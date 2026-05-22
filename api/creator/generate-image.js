// 장면별 이미지 생성 — nano-banana-2/edit (멀티 이미지 참조, Gemini 3.1 Flash Image)
// POST { draftId, sceneIndex }  → draft.scenes[sceneIndex].generated_image_url 갱신
//   또는 POST { baseAssetUrl, prompt, aspectRatio } → 임시 호출 (저장 X)
//
// 흐름:
//   1) draft + scene 로딩
//   2) image_urls 배열 구성 — [base, outfit, hair, background, makeup, lighting, ...products]
//      (assetUrl 없는 슬롯은 image_urls에서 제외, 인덱스 재계산해서 라벨드 영문 프롬프트에 매핑)
//      assetUrl 없고 description만 있는 슬롯 → 텍스트 fallback
//   3) fal-ai/nano-banana-2/edit 호출
//   4) 결과 이미지를 Supabase Storage(creator-library) 에 영구 저장 (fal URL 만료 대비)
//   5) draft.scenes 갱신 + 응답
//
// 비용: nano-banana-2 ≈ $0.04/이미지
import { getSupabase } from '../../lib/supabase.js';
import { randomUUID } from 'crypto';

export const config = { maxDuration: 60 };

const BUCKET = 'creator-library';
const FAL_ENDPOINT = 'https://fal.run/fal-ai/nano-banana-2/edit';

function falHeaders() {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY 미설정');
  return { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' };
}

// scene.slots[key] 형식:
//   undefined           → inherit (global 사용)
//   { cleared: true }   → cleared (이 장면 비움)
//   { assetId, assetUrl, description, ... } → custom 단일
//   { items: [...] }    → custom multi (제품/소품)
// global_slots[key]:
//   단일: { assetId?, assetUrl?, description? }
//   multi: [{ assetId?, assetUrl?, description?, kind }]
function effectiveSlot(sceneSlots, globalSlots, key, isMulti) {
  const s = sceneSlots?.[key];
  if (s?.cleared) return null;
  if (isMulti) {
    if (s && Array.isArray(s.items)) return s.items; // custom
    const g = globalSlots?.[key];
    return Array.isArray(g) ? g : [];
  } else {
    if (s && (s.assetId || s.assetUrl || s.description)) return s;
    return globalSlots?.[key] || null;
  }
}

// 멀티 이미지 + 라벨드 영문 프롬프트 동시 빌드.
// 반환: { image_urls, prompt }
function buildNanoSpec({ baseAssetUrl, scene, globalSlots, baseDescription }) {
  const sceneSlots = scene?.slots || {};
  const image_urls = [baseAssetUrl];
  const lines = [];

  // 1. 얼굴 정체성 — 항상 첫 번째 이미지
  lines.push(baseDescription
    ? `Identity: Use the FIRST image as the person's face reference. Preserve identical facial features, bone structure, eye shape, and skin tone. ${baseDescription}.`
    : `Identity: Use the FIRST image as the person's face reference. Preserve identical facial features, bone structure, eye shape, and skin tone.`);

  // 2. 피부 상태 (비포/애프터 핵심) — 텍스트
  if (scene?.skin_state) lines.push(`Skin state: ${scene.skin_state}.`);

  // 3. 단일 슬롯 — outfit / hair / background / makeup / lighting
  const slotMap = [
    ['outfit',     'Outfit',          'same garment style, color, fabric and silhouette'],
    ['hair',       'Hairstyle',       'same hairstyle, length, and color'],
    ['background', 'Background',      'compose the scene in this environment with matching props and depth'],
    ['makeup',     'Makeup',          'apply this exact makeup look (lip color, eye, brows, base)'],
    ['lighting',   'Lighting/tone',   'match the lighting direction, color temperature, and overall color tone'],
  ];
  for (const [key, label, hint] of slotMap) {
    const eff = effectiveSlot(sceneSlots, globalSlots, key, false);
    if (!eff) continue;
    if (eff.assetUrl) {
      const idx = image_urls.length + 1; // 1-based image index
      image_urls.push(eff.assetUrl);
      const desc = eff.description ? ` Note: ${eff.description}.` : '';
      lines.push(`${label}: Use image [${idx}] as the reference — ${hint}.${desc}`);
    } else if (eff.description) {
      lines.push(`${label}: ${eff.description}.`);
    }
  }

  // 4. 제품/소품 (multi)
  const prodItems = effectiveSlot(sceneSlots, globalSlots, 'products', true);
  if (Array.isArray(prodItems)) {
    for (const it of prodItems) {
      if (!it) continue;
      const role = it.kind === 'tool' ? 'Tool' : 'Product';
      if (it.assetUrl) {
        const idx = image_urls.length + 1;
        image_urls.push(it.assetUrl);
        const desc = it.description ? ` Note: ${it.description}.` : '';
        lines.push(`${role}: Use image [${idx}] for the exact texture, packaging, and color. Render it naturally in the scene held or placed in context.${desc}`);
      } else if (it.description) {
        lines.push(`${role}: ${it.description}.`);
      }
    }
  }

  // 5. 카메라/연출 (visual)
  if (scene?.visual) lines.push(`Scene action and camera: ${scene.visual}.`);

  // 6. 품질 고정
  lines.push('Style: ultra photorealistic, hyperrealistic skin texture, professional photography, natural soft lighting, sharp focus, 8K, no text overlay, no watermark.');

  return { image_urls, prompt: lines.filter(Boolean).join(' ') };
}

function aspectRatioForNano(ar) {
  // nano-banana-2 aspect_ratio: auto, 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16, 4:1, 1:4, 8:1, 1:8
  const supported = ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '4:1', '1:4', '8:1', '1:8'];
  if (supported.includes(ar)) return ar;
  return '9:16';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    draftId,
    sceneIndex,
    baseAssetUrl: directUrl,
    prompt: directPrompt,
    aspectRatio: directAR,
  } = req.body || {};

  const sb = getSupabase();
  let baseAssetUrl, prompt, aspectRatio, image_urls, draft = null, scene = null;

  // ── 1. 입력 로딩 ────────────────────────────────────
  if (draftId && sceneIndex !== undefined && sceneIndex !== null) {
    const { data: row, error } = await sb
      .from('creator_drafts')
      .select('data')
      .eq('id', draftId)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!row) return res.status(404).json({ error: '드래프트 없음' });
    draft = row.data;
    scene = (draft.scenes || []).find(s => s.scene_index === sceneIndex);
    if (!scene) return res.status(404).json({ error: `scene_index ${sceneIndex} 없음` });
    baseAssetUrl = draft.baseAssetUrl;
    aspectRatio = draft.aspectRatio || '9:16';
    if (!baseAssetUrl) {
      return res.status(400).json({ error: '베이스 얼굴 자산 URL 없음 (draft.baseAssetUrl)' });
    }
    const spec = buildNanoSpec({
      baseAssetUrl,
      scene,
      globalSlots: draft.global_slots || {},
      baseDescription: draft.baseDescription || '',
    });
    prompt = spec.prompt;
    image_urls = spec.image_urls;
  } else if (directUrl && directPrompt) {
    baseAssetUrl = directUrl;
    prompt = directPrompt;
    aspectRatio = directAR || '9:16';
    image_urls = [baseAssetUrl];
  } else {
    return res.status(400).json({
      error: 'draftId+sceneIndex 또는 baseAssetUrl+prompt 필수',
    });
  }

  // ── 2. nano-banana-2 호출 ────────────────────────────
  let falData;
  try {
    const falRes = await fetch(FAL_ENDPOINT, {
      method: 'POST',
      headers: falHeaders(),
      body: JSON.stringify({
        prompt,
        image_urls,
        aspect_ratio: aspectRatioForNano(aspectRatio),
        output_format: 'jpeg',
        resolution: '1K',
        safety_tolerance: 4,
        num_images: 1,
      }),
      signal: AbortSignal.timeout(55000),
    });

    if (!falRes.ok) {
      const errTxt = await falRes.text();
      console.error('[generate-image] nano-banana-2 실패', falRes.status, errTxt.substring(0, 300));
      return res.status(500).json({
        error: `nano-banana-2 생성 실패 ${falRes.status}: ${errTxt.substring(0, 300)}`,
        prompt,
        image_urls,
      });
    }
    falData = await falRes.json();
  } catch (e) {
    console.error('[generate-image] nano-banana-2 호출 에러', e.message);
    return res.status(500).json({ error: `nano-banana-2 호출 실패: ${e.message}`, prompt, image_urls });
  }

  const falImageUrl = falData?.images?.[0]?.url;
  if (!falImageUrl) {
    return res.status(500).json({
      error: 'nano-banana-2 응답에 이미지 URL 없음',
      raw: JSON.stringify(falData).substring(0, 300),
    });
  }

  // ── 3. Supabase Storage 영구 저장 (fal CDN 만료 대비) ─
  let publicUrl = falImageUrl;
  let storagePath = null;
  try {
    const imgRes = await fetch(falImageUrl);
    if (imgRes.ok) {
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const filename = `${randomUUID()}.jpeg`;
      const identityId = draft?.identityId || 'mine-primary';
      storagePath = `${identityId}/generated/${draftId || 'adhoc'}/${filename}`;
      const { error: upErr } = await sb.storage
        .from(BUCKET)
        .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: false });
      if (!upErr) {
        const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storagePath);
        if (pub?.publicUrl) publicUrl = pub.publicUrl;
      } else {
        console.warn('[generate-image] storage upload 실패 (fal URL fallback):', upErr.message);
        storagePath = null;
      }
    }
  } catch (e) {
    console.warn('[generate-image] storage 저장 예외 (fal URL fallback):', e.message);
  }

  // ── 4. draft 갱신 ───────────────────────────────────
  if (draftId && scene) {
    const updatedScenes = (draft.scenes || []).map(s =>
      s.scene_index === sceneIndex
        ? {
            ...s,
            generated_image_url: publicUrl,
            generated_image_path: storagePath,
            generated_at: new Date().toISOString(),
            generated_prompt: prompt,
            generated_image_refs: image_urls,
          }
        : s
    );
    const updatedDraft = { ...draft, scenes: updatedScenes, updatedAt: new Date().toISOString() };
    const { error: upDraftErr } = await sb
      .from('creator_drafts')
      .update({ data: updatedDraft })
      .eq('id', draftId);
    if (upDraftErr) {
      console.warn('[generate-image] draft 갱신 실패:', upDraftErr.message);
    }
  }

  return res.status(200).json({
    success: true,
    imageUrl: publicUrl,
    falUrl: falImageUrl,
    storagePath,
    prompt,
    imageRefsCount: image_urls.length,
    imageRefs: image_urls,
    sceneIndex,
  });
}

// 장면별 이미지 생성 — FLUX Kontext (이미지+텍스트 입력)
// POST { draftId, sceneIndex }  → draft.scenes[sceneIndex].generated_image_url 갱신
//   또는 POST { baseAssetUrl, prompt, aspectRatio } → 임시 호출 (저장 X)
//
// 흐름:
//   1) draft + scene 로딩
//   2) baseAssetUrl + visual + skin_state + 슬롯(전역+장면 effective) 합쳐 프롬프트 빌드
//   3) fal-ai/flux-pro/kontext 호출
//   4) 결과 이미지를 Supabase Storage(creator-library) 에 영구 저장 (fal URL 만료 대비)
//   5) draft.scenes 갱신 + 응답
//
// 비용: FLUX Kontext ≈ $0.04~0.05/이미지
import { getSupabase } from '../../lib/supabase.js';
import { randomUUID } from 'crypto';

export const config = { maxDuration: 60 };

const BUCKET = 'creator-library';
const FAL_ENDPOINT = 'https://fal.run/fal-ai/flux-pro/kontext';

function falHeaders() {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY 미설정');
  return { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' };
}

// scene.slots[key] 형식:
//   undefined           → inherit (global 사용)
//   { cleared: true }   → cleared (이 장면 비움)
//   { assetId, description, ... } → custom 단일
//   { items: [...] }    → custom multi (제품/소품)
// global_slots[key]:
//   단일: { assetId?, description? }
//   multi: [{ assetId?, description?, kind }]
function effectiveSlot(sceneSlots, globalSlots, key, isMulti) {
  const s = sceneSlots?.[key];
  if (s?.cleared) return null;
  if (isMulti) {
    if (s && Array.isArray(s.items)) return s.items; // custom
    const g = globalSlots?.[key];
    return Array.isArray(g) ? g : [];
  } else {
    if (s && (s.assetId || s.description)) return s;
    return globalSlots?.[key] || null;
  }
}

function buildKontextPrompt({ scene, globalSlots, baseDescription }) {
  const sceneSlots = scene.slots || {};
  const parts = [];

  // 1. 얼굴 정체성 — 베이스 이미지의 인물 유지
  parts.push(baseDescription
    ? `Same person as reference image, ${baseDescription}`
    : 'Same person as the reference image, identical facial features');

  // 2. 피부 상태 (비포/애프터 핵심)
  if (scene.skin_state) parts.push(`Skin state: ${scene.skin_state}`);

  // 3. 슬롯 — outfit / hair / background / makeup / lighting
  const slotMap = [
    ['outfit',     'Outfit'],
    ['hair',       'Hairstyle'],
    ['background', 'Background'],
    ['makeup',     'Makeup'],
    ['lighting',   'Lighting/tone'],
  ];
  for (const [key, label] of slotMap) {
    const eff = effectiveSlot(sceneSlots, globalSlots, key, false);
    if (eff && eff.description) parts.push(`${label}: ${eff.description}`);
  }

  // 4. 제품/소품 (multi)
  const prodItems = effectiveSlot(sceneSlots, globalSlots, 'products', true);
  if (Array.isArray(prodItems) && prodItems.length > 0) {
    const desc = prodItems
      .map(it => it?.description ? `${it.kind === 'tool' ? 'Tool' : 'Product'}: ${it.description}` : null)
      .filter(Boolean)
      .join('. ');
    if (desc) parts.push(desc);
  }

  // 5. 카메라/연출 (visual)
  if (scene.visual) parts.push(scene.visual);

  // 6. 품질 고정
  parts.push('ultra photorealistic, hyperrealistic skin texture, professional photography, natural lighting, 8K');

  return parts.filter(Boolean).join('. ');
}

function aspectRatioForKontext(ar) {
  // FLUX Kontext aspect_ratio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '9:21'
  if (['1:1', '16:9', '9:16', '4:3', '3:4'].includes(ar)) return ar;
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
  let baseAssetUrl, prompt, aspectRatio, draft = null, scene = null;

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
    prompt = buildKontextPrompt({
      scene,
      globalSlots: draft.global_slots || {},
      baseDescription: draft.baseDescription || '',
    });
  } else if (directUrl && directPrompt) {
    baseAssetUrl = directUrl;
    prompt = directPrompt;
    aspectRatio = directAR || '9:16';
  } else {
    return res.status(400).json({
      error: 'draftId+sceneIndex 또는 baseAssetUrl+prompt 필수',
    });
  }

  if (!baseAssetUrl) {
    return res.status(400).json({ error: '베이스 얼굴 자산 URL 없음 (draft.baseAssetUrl)' });
  }

  // ── 2. FLUX Kontext 호출 ─────────────────────────────
  let falData;
  try {
    const falRes = await fetch(FAL_ENDPOINT, {
      method: 'POST',
      headers: falHeaders(),
      body: JSON.stringify({
        prompt,
        image_url: baseAssetUrl,
        aspect_ratio: aspectRatioForKontext(aspectRatio),
        guidance_scale: 3.5,
        num_inference_steps: 28,
        output_format: 'jpeg',
        safety_tolerance: '2',
      }),
      signal: AbortSignal.timeout(55000),
    });

    if (!falRes.ok) {
      const errTxt = await falRes.text();
      console.error('[generate-image] FLUX 실패', falRes.status, errTxt.substring(0, 300));
      return res.status(500).json({
        error: `FLUX 생성 실패 ${falRes.status}: ${errTxt.substring(0, 300)}`,
        prompt,
      });
    }
    falData = await falRes.json();
  } catch (e) {
    console.error('[generate-image] FLUX 호출 에러', e.message);
    return res.status(500).json({ error: `FLUX 호출 실패: ${e.message}`, prompt });
  }

  const falImageUrl = falData?.images?.[0]?.url;
  if (!falImageUrl) {
    return res.status(500).json({
      error: 'FLUX 응답에 이미지 URL 없음',
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
    sceneIndex,
  });
}

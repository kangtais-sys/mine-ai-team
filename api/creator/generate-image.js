// 장면별 이미지 생성 — nano-banana-2/edit (멀티 이미지 참조, Gemini 3.1 Flash Image)
// POST { draftId, sceneIndex }  → draft.scenes[sceneIndex].generated_image_url 갱신
//   또는 POST { baseAssetUrl, prompt, aspectRatio } → 임시 호출 (저장 X)
//
// === 2026-05-24 80% 안정화 (canonical identity drift 대응) ===
// === 2026-05-24 헤어 슬롯 옵션화 — 빈 슬롯 = 캐논 헤어 유지, 레퍼런스 있으면 Vision 텍스트 ===
//
// 흐름 (2단계):
//   [PRE]  메이크업/조명/헤어(레퍼런스 있을 때만) 슬롯은 Vision 으로 텍스트 묘사 추출 → prompt 에만 박음 (image_urls 에서 제외)
//          → 이유: 얼굴 셀카가 들어가면 nano-banana 가 얼굴 섞을 위험. makeup/lighting/hair 은 픽셀로 넣으면 face mix 유발.
//          → 헤어 빈 슬롯 = 캐논 헤어 유지 명시 (모델 임의 변경 방지)
//          → image_urls = canonical + 의상/배경/제품 = 최대 4~N장
//   [R1]   1차 nano-banana-2/edit 호출 (위 이미지 + 강화된 prompt)
//          → identity ABSOLUTE 톤 + 슬롯 hint 에 "ignore the face/person, extract only the role" 명시
//          → 분포 트리거 키워드(8K, professional photography, natural soft lighting) 제거 — cinematic editorial matte 로 교체
//          → docs/persona-soul-prompt-guide.md §2 반영
//   [R2]   2차 face inpaint — [R1, canonical] 두 장으로 face-region 만 canonical 로 교체
//          → identity 보장 강화. R1 의 outfit/hair/background/lighting/makeup/pose 는 그대로 유지
//   최종 응답: { imageUrl: R2, preInpaintUrl: R1, ... }
//
// 비용: nano-banana ($0.04) × 2 + Vision ($0.001) × ≤2 = ~$0.08~0.10/장면
import { getSupabase } from '../../lib/supabase.js';
import { describeSlotImage } from '../../lib/vision-slot.js';
import { randomUUID } from 'crypto';

export const config = { maxDuration: 120 };

const BUCKET = 'creator-library';
const FAL_ENDPOINT = 'https://fal.run/fal-ai/nano-banana-2/edit';

// nano-banana 호출당 타임아웃 (1차 + 2차 합쳐 maxDuration 120s 내 들어와야 함)
const FAL_TIMEOUT_MS = 50000;

// Vision 텍스트 묘사로 변환할 슬롯 — image_urls 에 들어가지 않음
// hair: 변경할 때만 레퍼런스 넣음. 빈 슬롯 = 캐논 헤어 유지 (별도 line 으로 명시).
const VISION_TEXT_SLOTS = new Set(['makeup', 'lighting', 'hair']);

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

// Vision 호출 (makeup/lighting) — description 비어있고 assetUrl 있으면 분석.
// 결과는 in-memory cache (요청 단위). DB cache 는 후속 작업.
async function resolveVisionDescription(slotKey, eff, cache) {
  if (!eff) return '';
  // description 수동 입력값 우선
  if (eff.description && eff.description.trim()) return eff.description.trim();
  if (!eff.assetUrl) return '';
  const cacheKey = `${slotKey}::${eff.assetUrl}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  try {
    const text = await describeSlotImage(slotKey, eff.assetUrl);
    cache.set(cacheKey, text);
    return text;
  } catch (e) {
    console.warn(`[generate-image] Vision 추출 실패 ${slotKey}:`, e.message);
    return '';
  }
}

// 멀티 이미지 + 강화된 영문 프롬프트 빌드.
// makeup/lighting 은 image_urls 에 안 들어가고 Vision 묘사로 prompt 에만 박힘.
// 반환: { image_urls, prompt, visionDescriptions }
async function buildNanoSpec({ baseAssetUrl, scene, globalSlots, baseDescription }) {
  const sceneSlots = scene?.slots || {};
  const image_urls = [baseAssetUrl];
  const lines = [];
  const visionCache = new Map();
  const visionDescriptions = {};

  // 1. 얼굴 정체성 — ABSOLUTE 톤 (가이드 §3 인사이트 반영)
  const idBase = `Identity (ABSOLUTE): The person's face, bone structure, eye shape, eyebrows, lips, and skin tone come EXCLUSIVELY from the FIRST image. Reference images [2]+ are for non-face roles only — never borrow, blend, or echo any facial features from them.`;
  lines.push(baseDescription ? `${idBase} Subject context: ${baseDescription}.` : idBase);

  // 2. 피부 상태 (비포/애프터 핵심) — 텍스트
  if (scene?.skin_state) lines.push(`Skin state: ${scene.skin_state}.`);

  // 3. 슬롯 — 픽셀 참조 (의상/배경/제품) 과 Vision 텍스트 (메이크업/조명/헤어) 분리
  //    슬롯 hint 강화: "extract ONLY ... IGNORE face/person" (가이드 분포 트리거 회피 + 사용자 멘탈모델 일치)
  //    헤어는 픽셀에서 제외 — 셀카 얼굴 섞임 위험 회피, Vision 텍스트로 처리.
  const pixelSlotMap = [
    ['outfit',     'Outfit',     'extract ONLY the garment (style/color/fabric/silhouette). The person, face, hair, and background in this image are IRRELEVANT — ignore them entirely'],
    ['background', 'Background', 'extract ONLY the environment, props, and depth. Any person in this image is IRRELEVANT — ignore them entirely'],
  ];

  for (const [key, label, hint] of pixelSlotMap) {
    const eff = effectiveSlot(sceneSlots, globalSlots, key, false);
    if (!eff) continue;
    if (eff.assetUrl) {
      const idx = image_urls.length + 1; // 1-based image index
      image_urls.push(eff.assetUrl);
      const desc = eff.description ? ` Note: ${eff.description}.` : '';
      lines.push(`${label}: From image [${idx}], ${hint}.${desc}`);
    } else if (eff.description) {
      lines.push(`${label}: ${eff.description}.`);
    }
  }

  // 4. Vision 텍스트 슬롯 — makeup / lighting / hair (image_urls 에는 안 들어감)
  //    헤어: 슬롯에 레퍼런스 있을 때만 Vision 으로 묘사 추출 → 변경 적용.
  //         빈 슬롯이면 아래 [4b] 블록이 캐논 헤어 유지 line 을 박음.
  let hairChanged = false;
  for (const key of ['makeup', 'lighting', 'hair']) {
    const eff = effectiveSlot(sceneSlots, globalSlots, key, false);
    if (!eff) continue;
    const text = await resolveVisionDescription(key, eff, visionCache);
    if (!text) continue;
    visionDescriptions[key] = text;
    if (key === 'makeup') {
      lines.push(`Makeup (apply to the FIRST image's face): ${text}`);
    } else if (key === 'hair') {
      hairChanged = true;
      lines.push(`Hairstyle (replace the FIRST image's hair with this new style): ${text}`);
    } else {
      lines.push(`Lighting and color tone: ${text}`);
    }
  }

  // 4b. 헤어 슬롯 비어있으면 = 캐논 헤어 유지 명시 (모델 임의 변경 방지)
  if (!hairChanged) {
    lines.push(`Hair: Keep the hairstyle (length, shape, color, parting, texture) exactly as in the FIRST image. Do not modify the hair.`);
  }

  // 5. 제품/소품 (multi) — 픽셀 참조 유지
  const prodItems = effectiveSlot(sceneSlots, globalSlots, 'products', true);
  if (Array.isArray(prodItems)) {
    for (const it of prodItems) {
      if (!it) continue;
      const role = it.kind === 'tool' ? 'Tool' : 'Product';
      if (it.assetUrl) {
        const idx = image_urls.length + 1;
        image_urls.push(it.assetUrl);
        const desc = it.description ? ` Note: ${it.description}.` : '';
        lines.push(`${role}: Use image [${idx}] for the exact texture, packaging, and color. Render it naturally held or placed in context.${desc}`);
      } else if (it.description) {
        lines.push(`${role}: ${it.description}.`);
      }
    }
  }

  // 6. 카메라/연출 (visual)
  if (scene?.visual) lines.push(`Scene action and camera: ${scene.visual}.`);

  // 7. 톤·품질 — 분포 트리거 키워드 제거 (8K/professional photography/natural soft lighting)
  //    → cinematic editorial portrait + matte finish (가이드 §3 채택본)
  lines.push('Style: cinematic editorial portrait, natural matte skin finish with soft visible fine pores, realistic skin tone, balanced contrast, sharp focus. Not a magazine cover, not a product catalog, not airbrushed.');

  // 8. 마지막 reminder — identity 강제
  lines.push('Final reminder: Face identity = FIRST image ONLY. All other reference images are for their assigned roles only. Never mix or blend faces.');

  return {
    image_urls,
    prompt: lines.filter(Boolean).join(' '),
    visionDescriptions,
  };
}

function aspectRatioForNano(ar) {
  const supported = ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '4:1', '1:4', '8:1', '1:8'];
  if (supported.includes(ar)) return ar;
  return '9:16';
}

// nano-banana-2/edit 단일 호출 helper
async function callFal({ prompt, image_urls, aspect_ratio }) {
  const falRes = await fetch(FAL_ENDPOINT, {
    method: 'POST',
    headers: falHeaders(),
    body: JSON.stringify({
      prompt,
      image_urls,
      aspect_ratio: aspectRatioForNano(aspect_ratio),
      output_format: 'jpeg',
      resolution: '1K',
      safety_tolerance: 4,
      num_images: 1,
    }),
    signal: AbortSignal.timeout(FAL_TIMEOUT_MS),
  });
  if (!falRes.ok) {
    const errTxt = await falRes.text();
    const e = new Error(`nano-banana-2 호출 실패 ${falRes.status}: ${errTxt.substring(0, 300)}`);
    e.status = falRes.status;
    throw e;
  }
  const data = await falRes.json();
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error('nano-banana-2 응답에 이미지 URL 없음');
  return url;
}

// 2차 face inpaint — R1 의 얼굴만 canonical 로 교체.
//   image_urls = [R1, canonical], R1=image[1], canonical=image[2]
//   prompt: face-region replace + 나머지 모두 유지
async function faceInpaintWithCanonical({ r1Url, canonicalUrl, aspect_ratio }) {
  const prompt = [
    `Face replacement task: Take image [1] as the base scene.`,
    `Replace ONLY the person's face region in image [1] with the exact face from image [2].`,
    `The face from image [2] is the IDENTITY anchor — preserve its bone structure, eye shape, eyebrows, lips, nose, and skin tone perfectly.`,
    `Match the head pose, head angle, and lighting of image [1] so the face fits naturally — but the facial features themselves must come from image [2].`,
    `Keep everything else in image [1] unchanged: outfit, hair (style and color), background, scene composition, props, lighting direction, body pose, gesture, and overall color tone.`,
    `Do NOT modify hair beyond what's needed to frame the face naturally.`,
    `Output a photorealistic result with seamless blending — no visible seams or color mismatch at the face boundary.`,
  ].join(' ');
  return callFal({ prompt, image_urls: [r1Url, canonicalUrl], aspect_ratio });
}

// 결과 URL → Supabase Storage 영구 저장 (fal CDN 만료 대비)
async function persistFalImage(sb, identityId, draftId, falImageUrl, suffix = '') {
  try {
    const imgRes = await fetch(falImageUrl);
    if (!imgRes.ok) return { publicUrl: falImageUrl, storagePath: null };
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const filename = `${randomUUID()}${suffix}.jpeg`;
    const storagePath = `${identityId}/generated/${draftId || 'adhoc'}/${filename}`;
    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: false });
    if (upErr) {
      console.warn('[generate-image] storage upload 실패:', upErr.message);
      return { publicUrl: falImageUrl, storagePath: null };
    }
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storagePath);
    return { publicUrl: pub?.publicUrl || falImageUrl, storagePath };
  } catch (e) {
    console.warn('[generate-image] storage 저장 예외:', e.message);
    return { publicUrl: falImageUrl, storagePath: null };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    draftId,
    sceneIndex,
    baseAssetUrl: directUrl,
    prompt: directPrompt,
    aspectRatio: directAR,
    skipInpaint = false, // 디버그용 — true 면 R1 만 반환
  } = req.body || {};

  const sb = getSupabase();
  let baseAssetUrl, prompt, aspectRatio, image_urls, draft = null, scene = null, visionDescriptions = {};

  // ── 1. 입력 로딩 + spec 빌드 ─────────────────────
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
    const spec = await buildNanoSpec({
      baseAssetUrl,
      scene,
      globalSlots: draft.global_slots || {},
      baseDescription: draft.baseDescription || '',
    });
    prompt = spec.prompt;
    image_urls = spec.image_urls;
    visionDescriptions = spec.visionDescriptions;
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

  // ── 2. R1: 1차 합성 ─────────────────────────────
  let r1FalUrl;
  try {
    r1FalUrl = await callFal({ prompt, image_urls, aspect_ratio: aspectRatio });
  } catch (e) {
    console.error('[generate-image] R1 실패', e.message);
    return res.status(500).json({ error: `R1 실패: ${e.message}`, prompt, image_urls });
  }

  // R1 영구 저장
  const r1Saved = await persistFalImage(sb, draft?.identityId || 'mine-primary', draftId, r1FalUrl, '-r1');

  // ── 3. R2: face inpaint (canonical 얼굴 강제 교체) ─
  //    skipInpaint=true 또는 직접 호출 모드(baseAssetUrl+prompt) 면 R1 만 반환
  let r2Saved = null;
  let r2FalUrl = null;
  let inpaintError = null;
  const shouldInpaint = !skipInpaint && draftId && scene && baseAssetUrl;

  if (shouldInpaint) {
    try {
      r2FalUrl = await faceInpaintWithCanonical({
        r1Url: r1Saved.publicUrl,
        canonicalUrl: baseAssetUrl,
        aspect_ratio: aspectRatio,
      });
      r2Saved = await persistFalImage(sb, draft?.identityId || 'mine-primary', draftId, r2FalUrl, '-r2');
    } catch (e) {
      // R2 실패해도 R1 은 반환 — 사용자가 fallback 으로 R1 쓸 수 있음
      console.warn('[generate-image] R2 (face inpaint) 실패, R1 만 반환:', e.message);
      inpaintError = e.message;
    }
  }

  const finalPublicUrl = r2Saved?.publicUrl || r1Saved.publicUrl;
  const finalStoragePath = r2Saved?.storagePath || r1Saved.storagePath;

  // ── 4. draft 갱신 ─────────────────────────────
  if (draftId && scene) {
    const updatedScenes = (draft.scenes || []).map(s =>
      s.scene_index === sceneIndex
        ? {
            ...s,
            generated_image_url: finalPublicUrl,
            generated_image_path: finalStoragePath,
            generated_image_url_pre_inpaint: r2Saved ? r1Saved.publicUrl : null,
            generated_at: new Date().toISOString(),
            generated_prompt: prompt,
            generated_image_refs: image_urls,
            generated_vision_descriptions: visionDescriptions,
            inpaint_applied: !!r2Saved,
            inpaint_error: inpaintError,
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
    imageUrl: finalPublicUrl,
    preInpaintUrl: r2Saved ? r1Saved.publicUrl : null,
    inpaintApplied: !!r2Saved,
    inpaintError,
    storagePath: finalStoragePath,
    prompt,
    imageRefsCount: image_urls.length,
    imageRefs: image_urls,
    visionDescriptions,
    sceneIndex,
  });
}

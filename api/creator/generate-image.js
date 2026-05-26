// 장면별 이미지 생성 — Higgsfield Soul V2 (text2image + custom_reference_id 얼굴 conditioning)
//
// === 2026-05-26 nano-banana 폐기, Soul V2 t2i 로 전면 교체 ===
// 이유: nano-banana edit 가 헤드샷 canonical + 텍스트 outfit/배경 + close-up visual 받으면
//       "얼굴 박스 + 몸 박스" 패널 콜라주로 토함. 모델이 use case 에 안 맞음.
//       Soul V2 t2i + custom_reference_id 는 캐논 만들 때 쓴 동일 엔진. 콜라주 구조적 불가.
//
// POST { draftId, sceneIndex }  → draft.scenes[i].generated_image_url 갱신
// POST { baseAssetUrl, prompt, aspectRatio, soulId? } → 임시 호출 (저장 X)
//
// 슬롯 처리: 전부 TEXT 로 prompt 에 박음 (image_urls 자체가 없음 — Soul 은 t2i)
//   • outfit / background / products : description (수동) 또는 Vision 묘사 (assetUrl 있을 때)
//   • makeup / lighting / hair : Vision 묘사 우선 (description 수동입력 우선)
// soulId: 페르소나 row(creator_personas.data.soulId)에서 lookup. draft.baseAssetId 가 persona id.
//
// 비용: Soul ~$0.10/장면 (Vision 호출 추가 시 +$0.001 ~ $0.005)
import { getSupabase } from '../../lib/supabase.js';
import { describeSlotImage } from '../../lib/vision-slot.js';
import { fnfFetch as fnfFetchBase } from '../../lib/higgsfield-tokens.js';
import { randomUUID } from 'crypto';

export const config = { maxDuration: 300 };

const BUCKET = 'creator-library';
const FNF_BASE = 'https://fnf.higgsfield.ai';
const SOUL_ENDPOINT = `${FNF_BASE}/agents/jobs`;

const JOB_SET_TYPE_CANDIDATES = ['text2image_soul_v2', 'text2image_soul', 'soul_v2', 'soul'];
let CACHED_JOB_SET_TYPE = null;
let CACHED_POLL_BASE = null;

// 글자/매거진 표지 분포 차단 + 보정 과잉 차단 + 변형 차단 (persona-soul.js 와 동일 정책)
const NEGATIVE_PROMPT = [
  'text', 'letters', 'words', 'typography', 'title', 'caption', 'watermark', 'logo', 'brand name', 'signature', 'magazine cover', 'frame', 'border',
  'plastic skin', 'doll skin', 'airbrushed', 'overly smooth skin', 'porcelain skin',
  'oily skin', 'sweaty skin', 'wet skin', 'greasy shine', 'glossy forehead',
  'different face', 'distorted face', 'extra fingers', 'extra limbs', 'deformed', 'asymmetric features',
  'blurry', 'low resolution', 'jpeg artifact', 'noise', 'grain',
  // 콜라주 차단 — 이전 nano-banana 사고 재현 방지
  'collage', 'split image', 'photo grid', 'multiple panels', 'picture in picture', 'inset photo',
].join(', ');

function fnfFetch(url, options = {}, timeoutMs = 25000) {
  return fnfFetchBase(url, options, 'generate-image', timeoutMs);
}

// scene.slots[key]:
//   undefined           → inherit (global)
//   { cleared: true }   → cleared
//   { assetId, assetUrl, description, ... } → custom 단일
//   { items: [...] }    → custom multi (products)
function effectiveSlot(sceneSlots, globalSlots, key, isMulti) {
  const s = sceneSlots?.[key];
  if (s?.cleared) return null;
  if (isMulti) {
    if (s && Array.isArray(s.items)) return s.items;
    const g = globalSlots?.[key];
    return Array.isArray(g) ? g : [];
  } else {
    if (s && (s.assetId || s.assetUrl || s.description)) return s;
    return globalSlots?.[key] || null;
  }
}

// description 우선, 없으면 assetUrl Vision 분석.
async function resolveSlotText(slotKey, eff, cache) {
  if (!eff) return '';
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

// Soul V2 t2i prompt 빌더 — 전부 텍스트.
// Soul V2 가 single-portrait mode 로 진입하려면 캐논 생성과 동일한 라벨 구조 필요.
// 자유체 prompt → Soul 이 reference 를 두 번 복제 → 상하 diptych 생성 (검증됨 2026-05-26).
// 라벨 패턴: {subject 첫 문장}. Style/Lighting/Background/Skin/Makeup/Hair/Quality 정형.
// 슬롯 비어있으면 캐논 기본값으로 채워 라벨 자체는 항상 유지 (시그널 약화 방지).
async function buildSceneSpec({ scene, globalSlots, baseDescription }) {
  const sceneSlots = scene?.slots || {};
  const cache = new Map();
  const slotTexts = {};

  for (const key of ['outfit', 'background', 'makeup', 'hair', 'lighting']) {
    const eff = effectiveSlot(sceneSlots, globalSlots, key, false);
    if (!eff) continue;
    const text = await resolveSlotText(key, eff, cache);
    if (text) slotTexts[key] = text;
  }

  const prodItems = effectiveSlot(sceneSlots, globalSlots, 'products', true);
  const productTexts = [];
  if (Array.isArray(prodItems) && prodItems.length) {
    for (const it of prodItems) {
      if (!it) continue;
      let text = '';
      if (it.description && it.description.trim()) text = it.description.trim();
      else if (it.assetUrl) text = await resolveSlotText('products', it, cache);
      if (text) productTexts.push(it.kind === 'tool' ? `tool: ${text}` : text);
    }
  }

  const firstParts = ['A single Korean woman in her late twenties'];
  if (baseDescription) firstParts.push(baseDescription);
  if (scene?.visual) firstParts.push(scene.visual);

  const lines = [firstParts.join(', ') + '.'];
  if (slotTexts.outfit) lines.push(`Outfit: ${slotTexts.outfit}.`);
  if (productTexts.length) lines.push(`Props: ${productTexts.join('; ')}.`);
  lines.push('Style: cinematic editorial portrait.');
  lines.push(`Lighting: ${slotTexts.lighting || 'soft natural light, gentle key + fill, even flattering'}.`);
  lines.push(`Background: ${slotTexts.background || 'clean simple environment'}.`);
  lines.push(`Skin: ${scene?.skin_state || 'natural matte finish, soft visible fine pores, realistic skin tone, no oily shine, no sweat'}.`);
  lines.push(`Makeup: ${slotTexts.makeup || 'natural minimal K-beauty look'}.`);
  lines.push(`Hair: ${slotTexts.hair || 'natural well-groomed hairstyle consistent with the reference face'}.`);
  lines.push('Quality: ultra-high detail, natural skin texture, realistic color, sharp focus, balanced contrast.');

  return {
    prompt: lines.join(' '),
    slotTexts,
  };
}

// Soul aspect_ratio 매핑 — fnf 가 받는 enum 으로 정규화. 기본 9:16 (reels).
function soulAspectRatio(ar) {
  const supported = new Set(['9:16', '3:4', '1:1', '4:3', '16:9', '2:3', '3:2']);
  if (supported.has(ar)) return ar;
  return '9:16';
}

// width/height: aspect_ratio 에 맞는 1.5k 해상도 — Soul 서버 권장 사이즈
function soulDimensions(ar) {
  // 가로*세로 약 ≤ 2,400,000 (1.5k 클래스)
  const map = {
    '9:16': { width: 1152, height: 2048 },
    '3:4':  { width: 1536, height: 2048 },
    '1:1':  { width: 1536, height: 1536 },
    '4:3':  { width: 2048, height: 1536 },
    '16:9': { width: 2048, height: 1152 },
    '2:3':  { width: 1408, height: 2112 },
    '3:2':  { width: 2112, height: 1408 },
  };
  return map[ar] || map['9:16'];
}

function buildSoulParams({ soulId, prompt, aspectRatio, seed }) {
  const ar = soulAspectRatio(aspectRatio);
  const dim = soulDimensions(ar);
  return {
    is_custom: false,
    model: 'soul_v2',
    prompt,
    custom_reference_id: soulId,
    custom_reference_strength: 1,
    aspect_ratio: ar,
    quality: '1.5k',
    width: dim.width,
    height: dim.height,
    batch_size: 1,
    enhance_prompt: false,
    use_green: true,
    use_refiner: false,
    negative_prompt: NEGATIVE_PROMPT,
    lora: null,
    chain_enhancer: null,
    model_version: 'fast',
    medias: [],
    seed: seed != null ? seed : Math.floor(Math.random() * 2 ** 32),
  };
}

function extractJobId(data) {
  return (
    (Array.isArray(data) ? (typeof data[0] === 'string' ? data[0] : data[0]?.id || data[0]?.job_id) : null) ||
    data?.id ||
    data?.job_id ||
    data?.request_id ||
    data?.jobs?.[0]?.id ||
    data?.jobs?.[0]?.job_id ||
    data?.job_set?.id ||
    data?.job_set?.jobs?.[0]?.id ||
    null
  );
}

async function startSoulJob({ soulId, prompt, aspectRatio, seed }) {
  const params = buildSoulParams({ soulId, prompt, aspectRatio, seed });
  const order = CACHED_JOB_SET_TYPE
    ? [CACHED_JOB_SET_TYPE, ...JOB_SET_TYPE_CANDIDATES.filter((t) => t !== CACHED_JOB_SET_TYPE)]
    : JOB_SET_TYPE_CANDIDATES;
  const attempts = [];

  for (const jobSetType of order) {
    const body = { job_set_type: jobSetType, params };
    const res = await fnfFetch(SOUL_ENDPOINT, { method: 'POST', body: JSON.stringify(body) });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (res.ok) {
      const jobId = extractJobId(data);
      if (jobId) {
        if (!CACHED_JOB_SET_TYPE) {
          CACHED_JOB_SET_TYPE = jobSetType;
          console.log(`[generate-image] job_set_type 확정: ${jobSetType}`);
        }
        return { jobId, postRaw: text.substring(0, 500) };
      }
      attempts.push(`${jobSetType} 200이지만 jobId 없음: ${text.substring(0, 150)}`);
      continue;
    }

    if (CACHED_JOB_SET_TYPE === jobSetType) CACHED_JOB_SET_TYPE = null;
    attempts.push(`${jobSetType} → ${res.status}: ${text.substring(0, 200)}`);
    console.log(`[generate-image] ${jobSetType} 실패 ${res.status}: ${text.substring(0, 200)}`);
    if (res.status >= 500 || res.status === 401 || res.status === 403) {
      throw new Error(`Soul POST ${res.status} (${jobSetType}): ${text.substring(0, 250)}`);
    }
  }

  throw new Error(`Soul POST 전 후보 실패:\n${attempts.join('\n')}`);
}

async function discoverPollPath(jobId) {
  if (CACHED_POLL_BASE) return CACHED_POLL_BASE.replace('{id}', jobId);
  const templates = [
    `${FNF_BASE}/agents/jobs/{id}`,
    `${FNF_BASE}/jobs/{id}/status`,
    `${FNF_BASE}/jobs/v2/{id}`,
  ];
  const attemptLog = [];
  for (const tpl of templates) {
    const url = tpl.replace('{id}', jobId);
    try {
      const r = await fnfFetch(url, { method: 'GET' });
      if (r.ok) {
        CACHED_POLL_BASE = tpl;
        console.log(`[generate-image] 폴링 경로 확정: ${tpl}`);
        return url;
      }
      const errBody = await r.text().catch(() => '');
      attemptLog.push(`${tpl} → ${r.status}: ${errBody.substring(0, 150)}`);
    } catch (e) {
      attemptLog.push(`${tpl} → 예외: ${e.message}`);
    }
  }
  throw new Error(`폴링 경로 못 찾음 (jobId=${jobId}):\n${attemptLog.join('\n')}`);
}

async function pollSoulJob(jobId, { maxWaitMs = 240000, intervalMs = 2500 } = {}) {
  const pollUrl = await discoverPollPath(jobId);
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    const res = await fnfFetch(pollUrl, { method: 'GET' });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Soul 폴링 ${res.status}: ${t.substring(0, 200)}`);
    }
    const data = await res.json();
    const status = data?.status;
    if (status === 'completed') {
      const url =
        data?.result_url ||
        data?.result?.url ||
        data?.results?.[0]?.url ||
        data?.results?.raw?.url ||
        data?.images?.[0]?.url ||
        data?.image?.url ||
        data?.url ||
        data?.output?.[0]?.url ||
        data?.output?.url;
      if (!url) throw new Error(`Soul 완료지만 URL 없음: ${JSON.stringify(data).substring(0, 250)}`);
      return url;
    }
    if (status === 'failed' || status === 'nsfw' || status === 'canceled') {
      throw new Error(`Soul ${status}: ${JSON.stringify(data).substring(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Soul 폴링 타임아웃 (${Math.floor(maxWaitMs / 1000)}s)`);
}

async function callSoul({ soulId, prompt, aspectRatio, seed }) {
  const result = await startSoulJob({ soulId, prompt, aspectRatio, seed });
  try {
    return await pollSoulJob(result.jobId);
  } catch (e) {
    throw new Error(`${e.message}\n--- POST raw ---\n${result.postRaw || '(none)'}`);
  }
}

// Soul 결과 URL → Supabase Storage 영구 저장
async function persistImage(sb, identityId, draftId, hfUrl) {
  try {
    const imgRes = await fetch(hfUrl);
    if (!imgRes.ok) return { publicUrl: hfUrl, storagePath: null };
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const filename = `${randomUUID()}.jpeg`;
    const storagePath = `${identityId}/generated/${draftId || 'adhoc'}/${filename}`;
    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: false });
    if (upErr) {
      console.warn('[generate-image] storage upload 실패:', upErr.message);
      return { publicUrl: hfUrl, storagePath: null };
    }
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storagePath);
    return { publicUrl: pub?.publicUrl || hfUrl, storagePath };
  } catch (e) {
    console.warn('[generate-image] storage 저장 예외:', e.message);
    return { publicUrl: hfUrl, storagePath: null };
  }
}

// draft.baseAssetId(=persona id) → persona row → data.soulId
async function lookupSoulId(sb, draft) {
  // 1순위: draft 자체에 soulId 박혀있으면 그대로
  if (draft?.soulId) return draft.soulId;

  const personaId = draft?.baseAssetId || draft?.personaId;
  if (personaId) {
    const { data: row, error } = await sb
      .from('creator_personas')
      .select('data')
      .eq('id', personaId)
      .maybeSingle();
    if (!error && row?.data?.soulId) return row.data.soulId;
  }

  // 폴백: 같은 identityId V3 페르소나에서 soulId 찾기
  const identityId = draft?.identityId || 'mine-primary';
  const { data: list } = await sb
    .from('creator_personas')
    .select('data')
    .order('created_at', { ascending: false });
  const found = (list || []).find(
    (r) => r.data?.version === 'v3' && r.data?.identityId === identityId && r.data?.soulId
  );
  return found?.data?.soulId || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    draftId,
    sceneIndex,
    baseAssetUrl: directUrl,           // 호환용 (저장 X 모드)
    prompt: directPrompt,
    aspectRatio: directAR,
    soulId: directSoulId,              // 호환용
    seed: directSeed,
  } = req.body || {};

  const sb = getSupabase();
  let prompt, aspectRatio, draft = null, scene = null, slotTexts = {}, soulId = null, identityId;

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
    aspectRatio = draft.aspectRatio || '9:16';
    identityId = draft.identityId || 'mine-primary';

    soulId = await lookupSoulId(sb, draft);
    if (!soulId) {
      return res.status(400).json({
        error: 'soulId 없음 — 페르소나(creator_personas.data.soulId) 확인 필요',
        baseAssetId: draft.baseAssetId,
      });
    }

    const spec = await buildSceneSpec({
      scene,
      globalSlots: draft.global_slots || {},
      baseDescription: draft.baseDescription || '',
    });
    prompt = spec.prompt;
    slotTexts = spec.slotTexts;
  } else if (directPrompt) {
    prompt = directPrompt;
    aspectRatio = directAR || '9:16';
    soulId = directSoulId;
    identityId = 'mine-primary';
    if (!soulId) {
      // directUrl 만 줬을 때: 그게 페르소나 url 이라고 가정하고 lookup
      if (directUrl) {
        const { data: list } = await sb
          .from('creator_personas')
          .select('id, data')
          .order('created_at', { ascending: false });
        const found = (list || []).find(
          (r) => r.data?.candidates?.some((c) => c.url === directUrl) && r.data?.soulId
        );
        soulId = found?.data?.soulId;
      }
    }
    if (!soulId) return res.status(400).json({ error: 'soulId 필수 (직접 호출 모드)' });
  } else {
    return res.status(400).json({
      error: 'draftId+sceneIndex 또는 prompt+soulId 필수',
    });
  }

  // ── 2. Soul V2 t2i ─────────────────────────────
  let hfUrl;
  try {
    hfUrl = await callSoul({ soulId, prompt, aspectRatio, seed: directSeed });
  } catch (e) {
    console.error('[generate-image] Soul 실패', e.message);
    return res.status(500).json({ error: `Soul 실패: ${e.message}`, prompt, soulId });
  }

  // ── 3. Storage 영구 저장 ───────────────────────
  const saved = await persistImage(sb, identityId, draftId, hfUrl);

  // ── 4. draft 갱신 ──────────────────────────────
  if (draftId && scene) {
    const updatedScenes = (draft.scenes || []).map(s =>
      s.scene_index === sceneIndex
        ? {
            ...s,
            generated_image_url: saved.publicUrl,
            generated_image_path: saved.storagePath,
            generated_image_url_pre_inpaint: null, // 더이상 2단계 아님
            generated_at: new Date().toISOString(),
            generated_prompt: prompt,
            generated_image_refs: [], // Soul t2i — 참조 이미지 없음
            generated_vision_descriptions: slotTexts,
            inpaint_applied: false,
            inpaint_error: null,
            engine: 'soul_v2',
          }
        : s
    );
    const updatedDraft = { ...draft, scenes: updatedScenes, updatedAt: new Date().toISOString() };
    const { error: upDraftErr } = await sb
      .from('creator_drafts')
      .update({ data: updatedDraft })
      .eq('id', draftId);
    if (upDraftErr) console.warn('[generate-image] draft 갱신 실패:', upDraftErr.message);
  }

  return res.status(200).json({
    success: true,
    imageUrl: saved.publicUrl,
    storagePath: saved.storagePath,
    prompt,
    slotTexts,
    sceneIndex,
    engine: 'soul_v2',
    soulId,
  });
}

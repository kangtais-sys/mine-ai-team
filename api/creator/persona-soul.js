// Higgsfield Soul ID로 캐논 페르소나 생성 — Soul ID 1개 → 4 각도 병렬
//
// [전제] Soul ID 학습은 MINE이 Higgsfield 웹(cloud.higgsfield.ai)에서 1회 수동:
//   Create Soul ID → 셀카 10~20장 업로드 → 완료 시 UUID 형태 character_id 발급
// 우리 코드는 그 character_id로 4 각도 캐논 베이스를 자동 생성한다.
//
// POST ?action=create   { identityId, name, soulId, onlyAngle? }
//   → onlyAngle 지정 시 그 각도 1개만 (디버그/테스트용)
//   → 평소엔 4 각도 병렬 (front / three-quarter / smile / closeup)
//   → 각 호출 = POST 잡 생성 → 폴링 → 이미지 URL
//   → 결과 Storage 영구 저장 (creator-library/{identityId}/persona/{personaId}/candidate-{angle}-{ts}.jpeg)
//   → creator_personas insert (data.version='v3', data.engine='soul', candidates[], canonical=null)
//
// PATCH ?action=select  { personaId, angle }
//   → data.canonical = { angle, url, path } 갱신
//
// GET    → V3 페르소나 목록 (data.version='v3' 필터 — PuLID/Soul 동시 노출)
// DELETE ?id=xxx → 삭제
//
// 엔드포인트 (Cloudflare 우회 — /agents/jobs 채널, nano_banana_2 동일 패턴):
//   POST https://fnf.higgsfield.ai/agents/jobs
//   body: { job_set_type: 'text2image_soul_v2',   ← fallback 후보 자동 시도
//           params: { is_custom:false, model:'soul_v2', prompt,
//                     custom_reference_id: soulId,
//                     custom_reference_strength: 1,
//                     aspect_ratio: '3:4', quality: '1080p',
//                     width: 1536, height: 2048, batch_size: 1,
//                     enhance_prompt: false, use_green: true,
//                     use_refiner: false, negative_prompt: '',
//                     lora: null, chain_enhancer: null,
//                     model_version: 'fast', medias: [], seed } }
//   인증: Bearer JWT (CLI_TOKEN) — persona-image.js의 fnfFetch 자동 갱신 패턴
//   ※ style_id 의도적으로 미포함 — 무드보드 빼고 캐릭터 얼굴 순수 보존
//   ※ /jobs/v2/* 경로는 Cloudflare bot 차단되어 /agents/jobs 로 우회
//
// 폴링: GET /agents/jobs/{id} (nano_banana 와 동일)
//
// 비용: Soul 단가 × 4. UI 표기 약 $0.10 (보수치).

import { Redis } from '@upstash/redis';
import { getSupabase } from '../../lib/supabase.js';
import { randomUUID } from 'crypto';

export const config = { maxDuration: 300 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const BUCKET = 'creator-library';
const MAX_PERSONAS = 3;
const FNF_BASE = 'https://fnf.higgsfield.ai';
const SOUL_ENDPOINT = `${FNF_BASE}/agents/jobs`;
const REDIS_TOKEN_KEY = 'higgsfield:access_token';
const REDIS_REFRESH_KEY = 'higgsfield:refresh_token'; // rotation 대응

// job_set_type 후보 — 1순위(경로명)부터 차례로 시도. 422 받으면 다음 후보.
const JOB_SET_TYPE_CANDIDATES = ['text2image_soul_v2', 'text2image_soul', 'soul_v2', 'soul'];
let CACHED_JOB_SET_TYPE = null; // 첫 성공 후 캐시

// 4 각도 — K뷰티 콘텐츠용
// 설계: cinematic editorial portrait 스타일 (매거진 cover 분포 X).
// 글자/타이포 차단은 negative_prompt 에서 담당.
const ANGLES = [
  {
    key: 'front',
    label: '정면 무표정',
    prompt:
      'Korean woman in her late twenties, front view portrait, eye-level, perfectly centered, looking directly at camera, calm neutral expression, lips gently closed, symmetrical composition. Style: cinematic editorial portrait. Lighting: soft diffused studio light, even fill, no harsh shadow. Background: clean minimal pale neutral wall. Skin: natural matte finish, soft visible fine pores, realistic skin tone, no oily shine, no sweat. Makeup: natural minimal K-beauty look. Quality: ultra-high detail, natural skin texture, realistic color, sharp focus, balanced contrast.',
  },
  {
    key: 'three-quarter',
    label: '반측면 살짝미소',
    prompt:
      'Korean woman in her late twenties, three-quarter view portrait, head turned slightly to one side showing both eyes with one cheek more visible, soft gentle closed-mouth smile, calm warm expression, subtle cinematic depth. Style: cinematic editorial portrait. Lighting: warm soft natural light, gentle key + fill. Background: clean minimal pale neutral wall. Skin: natural matte finish, soft visible fine pores, realistic skin tone, no oily shine, no sweat. Makeup: natural minimal K-beauty look. Quality: ultra-high detail, natural skin texture, realistic color, sharp focus, balanced contrast.',
  },
  {
    key: 'smile',
    label: '정면 환한미소',
    prompt:
      'Korean woman in her late twenties, front view portrait, eye-level, looking at camera, bright warm genuine open smile with teeth softly showing, joyful relaxed expression, symmetrical composition. Style: cinematic editorial portrait. Lighting: natural daylight, soft diffused, even and flattering. Background: clean minimal pale neutral wall. Skin: natural matte finish, soft visible fine pores, realistic skin tone, no oily shine, no sweat. Makeup: natural minimal K-beauty look. Quality: ultra-high detail, natural skin texture, realistic color, sharp focus, balanced contrast.',
  },
  {
    key: 'closeup',
    label: '정면 클로즈업',
    prompt:
      'Korean woman in her late twenties, tight close-up portrait from forehead to chin, looking directly at camera, calm composed expression, lips gently closed, focused entirely on facial detail and eye expression. Style: cinematic editorial portrait. Lighting: soft diffused beauty light, even and gentle. Background: clean minimal pale neutral wall, soft shallow depth blur. Skin: natural matte finish, soft visible fine pores and realistic skin texture, no oily shine, no sweat, no airbrush. Makeup: natural minimal K-beauty look. Quality: ultra-high detail, sharp facial texture, realistic color, soft focus falloff, balanced contrast.',
  },
];

// 글자/매거진 표지 분포 차단 + 보정 과잉 차단 + 변형 차단
const NEGATIVE_PROMPT = [
  // 글자/타이포
  'text', 'letters', 'words', 'typography', 'title', 'caption', 'watermark', 'logo', 'brand name', 'signature', 'magazine cover', 'frame', 'border',
  // 보정 과잉
  'plastic skin', 'doll skin', 'airbrushed', 'overly smooth skin', 'porcelain skin',
  // wet/oily 차단
  'oily skin', 'sweaty skin', 'wet skin', 'greasy shine', 'glossy forehead',
  // 정체성 변형
  'different face', 'distorted face', 'extra fingers', 'extra limbs', 'deformed', 'asymmetric features',
  // 저품질
  'blurry', 'low resolution', 'jpeg artifact', 'noise', 'grain',
].join(', ');

const COST_USD_APPROX = 0.10;

// Soul ID 형식 검증
function isValidSoulId(s) {
  if (!s || typeof s !== 'string') return false;
  return (
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s) ||
    /^[A-Za-z0-9_-]{16,}$/.test(s)
  );
}

// ── 토큰 관리 (persona-image.js와 동일 패턴) ──

async function getValidToken() {
  const cached = await redis.get(REDIS_TOKEN_KEY).catch(() => null);
  if (cached) return cached;
  const envToken = (process.env.HIGGSFIELD_CLI_TOKEN || '').trim();
  if (envToken) return envToken;
  throw new Error('HIGGSFIELD_CLI_TOKEN 없음');
}

// refresh_token: Redis 우선 → env 폴백 (rotation 대응)
async function getValidRefreshToken() {
  const cached = await redis.get(REDIS_REFRESH_KEY).catch(() => null);
  if (cached) return cached;
  const envToken = (process.env.HIGGSFIELD_REFRESH_TOKEN || '').trim();
  if (envToken) return envToken;
  throw new Error('HIGGSFIELD_REFRESH_TOKEN 없음');
}

async function refreshAccessToken() {
  const refreshToken = await getValidRefreshToken();
  const source = (await redis.get(REDIS_REFRESH_KEY).catch(() => null)) ? 'redis' : 'env';
  console.log(`[persona-soul] 토큰 갱신 시도 (refresh source=${source})...`);
  const res = await fetch('https://fnf-device-auth.higgsfield.ai/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const rawText = await res.text();
  if (!res.ok) {
    // 401/400 invalid → Redis 캐시 무효화 (다음 시도는 env로 폴백)
    if (res.status === 401 || res.status === 400) {
      await redis.del(REDIS_REFRESH_KEY).catch(() => {});
    }
    throw new Error(`토큰 갱신 실패 (${res.status}) [source=${source}]: ${rawText.substring(0, 200)}`);
  }
  let data = null;
  try { data = JSON.parse(rawText); } catch {}
  const newToken = data?.access_token;
  if (!newToken) {
    throw new Error(`갱신 응답에 access_token 없음. raw: ${rawText.substring(0, 300)}`);
  }
  await redis.set(REDIS_TOKEN_KEY, newToken, { ex: 3000 }).catch(() => {});
  // rotation: 새 refresh_token 응답에 있으면 Redis 저장 (필드명 후보 자동 탐색)
  const newRefresh = data?.refresh_token || data?.refreshToken || data?.refresh || null;
  if (newRefresh) {
    await redis.set(REDIS_REFRESH_KEY, newRefresh, { ex: 60 * 60 * 24 * 30 }).catch(() => {});
    console.log(`[persona-soul] refresh_token rotation 감지 → Redis 동기화 (응답 길이=${rawText.length})`);
  } else {
    console.log(`[persona-soul] refresh 응답에 새 refresh_token 없음. 응답 키들: ${Object.keys(data || {}).join(',')}`);
  }
  return newToken;
}

// persona-image.js 와 동일한 단순 헤더 구성 (nano_banana_2 가 잘 동작했던 패턴)
// 브라우저 위장 헤더(Origin/Referer/sec-*)는 오히려 Cloudflare 의심 트리거
// timeoutMs: 외부 호출 hang 방지 (default 25초)
async function fnfFetch(url, options = {}, token = null, timeoutMs = 25000) {
  const tok = token || (await getValidToken());
  const headers = {
    Authorization: `Bearer ${tok}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, headers, signal: ctrl.signal });
    if (res.status === 401) {
      console.log('[persona-soul] 401 — 토큰 갱신 후 재시도');
      const newTok = await refreshAccessToken();
      const headers2 = {
        Authorization: `Bearer ${newTok}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };
      const ctrl2 = new AbortController();
      const timer2 = setTimeout(() => ctrl2.abort(), timeoutMs);
      try {
        return await fetch(url, { ...options, headers: headers2, signal: ctrl2.signal });
      } finally {
        clearTimeout(timer2);
      }
    }
    return res;
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`fnfFetch timeout ${timeoutMs}ms: ${url}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ── Soul 잡 생성 ──

function buildSoulParams(soulId, prompt) {
  const seed = Math.floor(Math.random() * 2 ** 32);
  return {
    is_custom: false,
    model: 'soul_v2',
    prompt,
    custom_reference_id: soulId,
    custom_reference_strength: 1,
    aspect_ratio: '3:4',
    quality: '1.5k', // 서버 enum: '1.5k' | '2k' (구 '1080p' 거부됨)
    width: 1536,
    height: 2048,
    batch_size: 1,
    enhance_prompt: false,
    use_green: true,
    use_refiner: false,
    negative_prompt: NEGATIVE_PROMPT,
    lora: null,
    chain_enhancer: null,
    model_version: 'fast',
    medias: [],
    seed,
  };
}

function extractJobId(data, text) {
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

async function startSoulJob(soulId, prompt) {
  const params = buildSoulParams(soulId, prompt);
  // 캐시된 job_set_type 우선
  const order = CACHED_JOB_SET_TYPE
    ? [CACHED_JOB_SET_TYPE, ...JOB_SET_TYPE_CANDIDATES.filter((t) => t !== CACHED_JOB_SET_TYPE)]
    : JOB_SET_TYPE_CANDIDATES;
  const attempts = [];

  for (const jobSetType of order) {
    const body = { job_set_type: jobSetType, params };
    const res = await fnfFetch(SOUL_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (res.ok) {
      const jobId = extractJobId(data, text);
      if (jobId) {
        if (!CACHED_JOB_SET_TYPE) {
          CACHED_JOB_SET_TYPE = jobSetType;
          console.log(`[persona-soul] job_set_type 확정: ${jobSetType}`);
        }
        console.log(`[persona-soul] POST 200 (${jobSetType}): ${text.substring(0, 400)}`);
        // 디버그용: POST raw 응답을 throw 메시지 위해 jobId 객체로 반환
        return { jobId, postRaw: text.substring(0, 500) };
      }
      attempts.push(`${jobSetType} 200이지만 jobId 없음: ${text.substring(0, 150)}`);
      continue;
    }

    // 캐시 무효화 — 다음 후보로 넘어감
    if (CACHED_JOB_SET_TYPE === jobSetType) CACHED_JOB_SET_TYPE = null;
    attempts.push(`${jobSetType} → ${res.status}: ${text.substring(0, 200)}`);
    console.log(`[persona-soul] ${jobSetType} 실패 ${res.status}: ${text.substring(0, 200)}`);

    // 5xx 면 후보 무관 서버 문제 — 바로 throw
    if (res.status >= 500) {
      throw new Error(`Soul POST ${res.status} (${jobSetType}): ${text.substring(0, 250)}`);
    }
    // 401/403 도 후보 문제가 아니라 인증/차단 — 바로 throw
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Soul POST ${res.status} (${jobSetType}): ${text.substring(0, 250)}`);
    }
    // 400/404/422 등은 job_set_type 문제일 수 있으므로 다음 후보 시도
  }

  throw new Error(`Soul POST 전 후보 실패:\n${attempts.join('\n')}`);
}

// ── 폴링 경로 자동 탐색 (첫 호출만) ──
// fnf의 잡 종류별 경로가 다를 수 있어 후보 3개 시도, 200 OK 받는 첫 경로 채택.

let CACHED_POLL_BASE = null; // 워밍업 후 캐시 (cold start마다 재발견)

// /agents/jobs 채널은 GET /agents/jobs/{id} 폴링 (nano_banana_2 동일)
// 안전망: 후보 2개 자동 폴백 (스키마 바뀌었을 때 빠진 채로 죽지 않도록)
async function discoverPollPath(jobId) {
  if (CACHED_POLL_BASE) return `${CACHED_POLL_BASE.replace('{id}', jobId)}`;
  const templates = [
    `${FNF_BASE}/agents/jobs/{id}`,    // ★ /agents/jobs 채널 정답
    `${FNF_BASE}/jobs/{id}/status`,    // 폴백 1 (구 v2 경로)
    `${FNF_BASE}/jobs/v2/{id}`,        // 폴백 2
  ];
  const attemptLog = [];
  for (const tpl of templates) {
    const url = tpl.replace('{id}', jobId);
    try {
      const r = await fnfFetch(url, { method: 'GET' });
      if (r.ok) {
        CACHED_POLL_BASE = tpl;
        const body = await r.text();
        console.log(`[persona-soul] 폴링 경로 확정: ${tpl}`);
        console.log(`[persona-soul] 첫 응답(${body.length}b): ${body.substring(0, 400)}`);
        return url;
      } else {
        const errBody = await r.text().catch(() => '');
        const log = `${tpl} → ${r.status}: ${errBody.substring(0, 150)}`;
        attemptLog.push(log);
        console.log(`[persona-soul] 폴링 후보 ${log}`);
      }
    } catch (e) {
      const log = `${tpl} → 예외: ${e.message}`;
      attemptLog.push(log);
      console.log(`[persona-soul] 폴링 후보 ${log}`);
    }
  }
  throw new Error(`폴링 경로 못 찾음 (jobId=${jobId}):\n${attemptLog.join('\n')}`);
}

// ── Soul 잡 폴링 → 이미지 URL ──

async function pollSoulJob(jobId, { maxWaitMs = 110000, intervalMs = 2500 } = {}) {
  const pollUrl = await discoverPollPath(jobId);
  const started = Date.now();
  let firstLogged = false;
  while (Date.now() - started < maxWaitMs) {
    const res = await fnfFetch(pollUrl, { method: 'GET' });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Soul 폴링 ${res.status}: ${t.substring(0, 200)}`);
    }
    const data = await res.json();
    if (!firstLogged) {
      console.log(`[persona-soul] 폴링 응답 샘플: ${JSON.stringify(data).substring(0, 300)}`);
      firstLogged = true;
    }
    const status = data?.status;
    if (status === 'completed') {
      // 이미지 URL 후보 위치 다 시도
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
      if (!url) {
        throw new Error(`Soul 완료지만 URL 없음: ${JSON.stringify(data).substring(0, 250)}`);
      }
      return url;
    }
    if (status === 'failed' || status === 'nsfw' || status === 'canceled') {
      throw new Error(`Soul ${status}: ${JSON.stringify(data).substring(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Soul 폴링 타임아웃 (${Math.floor(maxWaitMs / 1000)}s)`);
}

async function callSoul(soulId, prompt) {
  const result = await startSoulJob(soulId, prompt);
  const jobId = result.jobId;
  try {
    return await pollSoulJob(jobId);
  } catch (e) {
    // 폴링 실패 시 POST raw 응답을 에러에 첨부 (디버그용)
    throw new Error(`${e.message}\n--- POST raw ---\n${result.postRaw || '(none)'}`);
  }
}

// ── Storage 영구 저장 ──

async function persistImage(sb, identityId, personaId, angle, hfUrl) {
  try {
    const imgRes = await fetch(hfUrl);
    if (!imgRes.ok) return { url: hfUrl, path: null };
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const ts = Date.now();
    const path = `${identityId}/persona/${personaId}/candidate-${angle}-${ts}.jpeg`;
    const { error } = await sb.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: 'image/jpeg', upsert: false });
    if (error) {
      console.warn('[persona-soul] storage upload 실패:', error.message);
      return { url: hfUrl, path: null };
    }
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub?.publicUrl || hfUrl, path };
  } catch (e) {
    console.warn('[persona-soul] persist 예외:', e.message);
    return { url: hfUrl, path: null };
  }
}

export default async function handler(req, res) {
  const sb = getSupabase();
  const action = req.query?.action;

  // ─────────── GET: V3 페르소나 목록 ───────────
  if (req.method === 'GET') {
    try {
      const { data, error } = await sb
        .from('creator_personas')
        .select('id, data, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const identityId = req.query?.identityId;
      const personas = (data || []).filter(
        (r) => r.data?.version === 'v3' && (!identityId || r.data?.identityId === identityId)
      );
      return res.status(200).json({
        personas,
        meta: {
          angles: ANGLES.map(({ key, label }) => ({ key, label })),
          costUsdApprox: COST_USD_APPROX,
          max: MAX_PERSONAS,
          engine: 'soul',
        },
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ─────────── POST ?action=create ───────────
  if (req.method === 'POST' && action === 'create') {
    const { identityId = 'mine-primary', name, soulId, onlyAngle } = req.body || {};
    if (!soulId) return res.status(400).json({ error: 'soulId 필수' });
    if (!isValidSoulId(soulId)) {
      return res
        .status(400)
        .json({ error: 'Soul ID 형식이 올바르지 않습니다 (Higgsfield 학습 완료 후 받은 ID)' });
    }

    // 사용할 각도 결정 (디버그 모드: onlyAngle)
    const useAngles = onlyAngle
      ? ANGLES.filter((a) => a.key === onlyAngle)
      : ANGLES;
    if (useAngles.length === 0) {
      return res.status(400).json({
        error: `onlyAngle '${onlyAngle}' 유효하지 않음. 가능: ${ANGLES.map((a) => a.key).join(', ')}`,
      });
    }
    const isDebug = !!onlyAngle;

    // MAX_PERSONAS — 디버그 모드(1각도)는 카운트 미적용
    if (!isDebug) {
      const { data: existing } = await sb.from('creator_personas').select('data');
      const v3Count = (existing || []).filter((r) => r.data?.version === 'v3').length;
      if (v3Count >= MAX_PERSONAS) {
        return res
          .status(400)
          .json({ error: `V3 페르소나는 최대 ${MAX_PERSONAS}개까지 가능합니다` });
      }
    }

    const personaId = randomUUID();

    const settled = await Promise.allSettled(
      useAngles.map(async (a) => {
        const hfUrl = await callSoul(soulId, a.prompt);
        const { url, path } = await persistImage(sb, identityId, personaId, a.key, hfUrl);
        return {
          angle: a.key,
          label: a.label,
          url,
          path,
          hfUrl,
          prompt: a.prompt,
          generatedAt: new Date().toISOString(),
        };
      })
    );

    const candidates = [];
    const failures = [];
    settled.forEach((r, i) => {
      const a = useAngles[i];
      if (r.status === 'fulfilled') {
        candidates.push(r.value);
      } else {
        const msg = r.reason?.message || String(r.reason);
        console.error(`[persona-soul] ${a.key} 실패:`, msg);
        failures.push({ angle: a.key, label: a.label, error: msg });
      }
    });

    if (candidates.length === 0) {
      return res.status(500).json({
        error: `${useAngles.length} 각도 모두 생성 실패`,
        failures,
        debug: isDebug,
      });
    }

    // 디버그 모드는 DB 저장 안 함 (테스트 결과만 반환)
    if (isDebug) {
      return res.status(200).json({
        success: true,
        debug: true,
        onlyAngle,
        candidates,
        failures: failures.length ? failures : undefined,
      });
    }

    const data = {
      id: personaId,
      version: 'v3',
      engine: 'soul',
      identityId,
      name: name || `내 페르소나 ${candidates.length}`,
      soulId,
      candidates,
      failures: failures.length ? failures : undefined,
      partial: failures.length > 0,
      canonical: null,
      createdAt: new Date().toISOString(),
    };

    const { error: insErr } = await sb
      .from('creator_personas')
      .insert({ id: personaId, data });
    if (insErr) return res.status(500).json({ error: insErr.message });

    return res.status(200).json({
      success: true,
      personaId,
      partial: failures.length > 0,
      failures: failures.length ? failures : undefined,
      persona: { id: personaId, data, created_at: new Date().toISOString() },
    });
  }

  // ─────────── PATCH ?action=select ───────────
  if (req.method === 'PATCH' && action === 'select') {
    const { personaId, angle } = req.body || {};
    if (!personaId || !angle)
      return res.status(400).json({ error: 'personaId, angle 필수' });

    const { data: row, error } = await sb
      .from('creator_personas')
      .select('data')
      .eq('id', personaId)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!row) return res.status(404).json({ error: '페르소나 없음' });

    const cand = (row.data?.candidates || []).find((c) => c.angle === angle);
    if (!cand) return res.status(400).json({ error: '해당 각도 후보 없음' });

    const updated = {
      ...row.data,
      canonical: { angle, url: cand.url, path: cand.path },
      updatedAt: new Date().toISOString(),
    };
    const { error: upErr } = await sb
      .from('creator_personas')
      .update({ data: updated })
      .eq('id', personaId);
    if (upErr) return res.status(500).json({ error: upErr.message });

    return res
      .status(200)
      .json({ success: true, persona: { id: personaId, data: updated } });
  }

  // ─────────── DELETE ?id=xxx ───────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 필수' });
    const { error } = await sb.from('creator_personas').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Higgsfield Soul ID로 캐논 페르소나 생성 — Soul ID 1개 → 4 각도 병렬
//
// [전제] Soul ID 학습은 MINE이 Higgsfield 웹에서 1회 수동:
//   Higgsfield Cloud → Create Soul ID → 셀카 10~20장 업로드 → 완료 시 UUID 형태 Soul ID 발급
// 우리 코드는 그 Soul ID로 4 각도 캐논 베이스를 자동 생성한다.
//
// POST ?action=create   { identityId, name, soulId }
//   → 4 Soul 병렬 호출 (front / three-quarter / smile / closeup)
//   → 각 호출은 비동기 → GET /requests/{id}/status 폴링 (각 호출당 최대 110초)
//   → 결과 Storage 영구 저장 (creator-library/{identityId}/persona/{personaId}/candidate-{angle}-{ts}.jpeg)
//   → creator_personas insert (data.version='v3', data.engine='soul', candidates[], canonical=null)
//
// PATCH ?action=select  { personaId, angle }
//   → data.canonical = { angle, url, path } 갱신
//
// GET    → V3 페르소나 목록 (data.version='v3' 필터 — PuLID/Soul 동시 노출)
// DELETE ?id=xxx → 삭제
//
// 엔드포인트: POST https://platform.higgsfield.ai/v1/text2image/soul
//   body: { params: { prompt, custom_reference_id: soulId,
//                     custom_reference_strength: 1,
//                     width_and_height: 'PORTRAIT_1536x2048',
//                     quality: 'HD' } }
//   인증: hf-api-key 헤더 (media.js 패턴 동일)
//
// 비용: Higgsfield Soul 단가 × 4. UI 표기 약 $0.10 (보수치).

import { getSupabase } from '../../lib/supabase.js';
import { randomUUID } from 'crypto';

// Vercel Pro: 최대 300초. 4 Soul 병렬 + 폴링 + Storage 업로드.
// 각 호출당 폴링 abort timeout(pollSoulStatus)을 110초로 둔다.
export const config = { maxDuration: 300 };

const BUCKET = 'creator-library';
const MAX_PERSONAS = 3;
const HIGGSFIELD_BASE = 'https://platform.higgsfield.ai';
const SOUL_ENDPOINT = `${HIGGSFIELD_BASE}/v1/text2image/soul`;

// 4 각도 — K뷰티 콘텐츠용 (PuLID와 동일 프롬프트 재사용)
const ANGLES = [
  {
    key: 'front',
    label: '정면 무표정',
    prompt:
      'Korean woman, front view portrait, looking directly at camera, calm neutral expression, lips closed, soft studio lighting, eye contact, ultra photorealistic, hyperrealistic skin texture with visible pores, 8K, professional beauty photography, clean simple background, natural minimal makeup',
  },
  {
    key: 'three-quarter',
    label: '반측면 살짝미소',
    prompt:
      'Korean woman, three-quarter view portrait, head turned slightly to the left, soft gentle closed-mouth smile, warm natural lighting, ultra photorealistic, hyperrealistic skin texture with visible pores, 8K, professional beauty photography, clean simple background',
  },
  {
    key: 'smile',
    label: '정면 환한미소',
    prompt:
      'Korean woman, front view portrait, looking at camera, bright warm open smile showing teeth, joyful cheerful expression, natural daylight, ultra photorealistic, hyperrealistic skin texture with visible pores, 8K, professional beauty photography, clean simple background',
  },
  {
    key: 'closeup',
    label: '정면 클로즈업',
    prompt:
      'Korean woman, extreme close-up face portrait, looking at camera, calm composed expression, every pore and fine skin texture visible, macro beauty photography, sharp focus on skin detail, soft diffused beauty lighting, ultra photorealistic, 8K resolution',
  },
];

const COST_USD_APPROX = 0.10;

// Soul ID 형식 검증 — UUID 또는 영숫자/하이픈/언더스코어 16자 이상
// (Higgsfield 학습 결과 ID 형태가 변할 수 있어서 느슨하게)
function isValidSoulId(s) {
  if (!s || typeof s !== 'string') return false;
  return (
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s) ||
    /^[A-Za-z0-9_-]{16,}$/.test(s)
  );
}

function higgsfieldHeaders() {
  const key = (process.env.HIGGSFIELD_API_KEY || '').replace(/^["']|["']$/g, '').trim();
  if (!key) throw new Error('HIGGSFIELD_API_KEY 없음');
  // media.js 인증 패턴 동일 — Origin/Referer 필수
  return {
    'hf-api-key': key,
    'Content-Type': 'application/json',
    'Origin': 'https://cloud.higgsfield.ai',
    'Referer': 'https://cloud.higgsfield.ai/',
  };
}

// Soul 요청 → request_id
async function startSoulRequest(soulId, prompt) {
  const body = {
    params: {
      prompt,
      custom_reference_id: soulId,
      custom_reference_strength: 1,
      width_and_height: '1536x2048',
      quality: 'HD',
    },
  };
  const res = await fetch(SOUL_ENDPOINT, {
    method: 'POST',
    headers: higgsfieldHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Soul POST ${res.status}: ${t.substring(0, 200)}`);
  }
  const data = await res.json();
  // 응답: { id }, { request_id }, 또는 { jobs: [{ id }] } 가능 — media.js 패턴 따라 다 시도
  const requestId =
    data?.id ||
    data?.request_id ||
    data?.jobs?.[0]?.id ||
    data?.jobs?.[0]?.request_id;
  if (!requestId) {
    throw new Error(`Soul request_id 없음: ${JSON.stringify(data).substring(0, 200)}`);
  }
  return requestId;
}

// 상태 폴링 → 'completed' 시 이미지 URL 반환
async function pollSoulStatus(requestId, { maxWaitMs = 110000, intervalMs = 2500 } = {}) {
  const headers = higgsfieldHeaders();
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    const res = await fetch(`${HIGGSFIELD_BASE}/requests/${requestId}/status`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Soul status ${res.status}: ${t.substring(0, 200)}`);
    }
    const data = await res.json();
    const status = data?.status;
    if (status === 'completed') {
      // Higgsfield 응답 형태가 모델별로 다름 → 후보 위치 모두 시도
      const url =
        data?.results?.raw?.url ||
        data?.results?.[0]?.url ||
        data?.images?.[0]?.url ||
        data?.image?.url ||
        data?.url;
      if (!url) {
        throw new Error(`Soul 완료지만 이미지 URL 없음: ${JSON.stringify(data).substring(0, 200)}`);
      }
      return url;
    }
    if (status === 'failed' || status === 'nsfw') {
      throw new Error(`Soul ${status}: ${JSON.stringify(data).substring(0, 200)}`);
    }
    // queued / in_progress → 대기
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Soul 폴링 타임아웃 (${Math.floor(maxWaitMs / 1000)}s)`);
}

async function callSoul(soulId, prompt) {
  const requestId = await startSoulRequest(soulId, prompt);
  const url = await pollSoulStatus(requestId);
  return url;
}

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

  // ─────────── GET: V3 페르소나 목록 (PuLID + Soul 동시 노출) ───────────
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
    const { identityId = 'mine-primary', name, soulId } = req.body || {};
    if (!soulId) return res.status(400).json({ error: 'soulId 필수' });
    if (!isValidSoulId(soulId)) {
      return res
        .status(400)
        .json({ error: 'Soul ID 형식이 올바르지 않습니다 (Higgsfield 학습 완료 후 받은 ID)' });
    }

    // MAX_PERSONAS (v3 전체 카운트 — PuLID + Soul 합산)
    const { data: existing } = await sb.from('creator_personas').select('data');
    const v3Count = (existing || []).filter((r) => r.data?.version === 'v3').length;
    if (v3Count >= MAX_PERSONAS) {
      return res
        .status(400)
        .json({ error: `V3 페르소나는 최대 ${MAX_PERSONAS}개까지 가능합니다` });
    }

    const personaId = randomUUID();

    // 부분 성공 허용 — Promise.allSettled로 1장 실패해도 나머지 진행
    const settled = await Promise.allSettled(
      ANGLES.map(async (a) => {
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
      const a = ANGLES[i];
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
        error: '4 각도 모두 생성 실패',
        failures,
      });
    }

    const data = {
      id: personaId,
      version: 'v3',
      engine: 'soul', // PuLID 페르소나와 구분
      identityId,
      name: name || `내 페르소나 ${v3Count + 1}`,
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

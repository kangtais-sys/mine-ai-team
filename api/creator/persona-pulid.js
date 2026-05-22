// PuLID FLUX로 캐논 페르소나 생성 — 셀카 1장 → 4 각도 병렬
//
// POST ?action=create   { identityId, name, sourceSelfieUrl, sourceSelfieAssetId }
//   → 4 PuLID 병렬 호출 (front / three-quarter / smile / closeup)
//   → 결과 Storage 영구 저장 (creator-library/{identityId}/persona/{personaId}/candidate-{angle}-{ts}.jpeg)
//   → creator_personas insert (data.version='v3', candidates[], canonical=null)
//
// PATCH ?action=select  { personaId, angle }
//   → data.canonical = { angle, url, path } 갱신
//
// GET    → V3 페르소나 목록 (data.version='v3' 필터)
// DELETE ?id=xxx → 삭제
//
// 비용: PuLID FLUX ≈ $0.0333/회 × 4 = 약 $0.13 (UI에는 $0.16 안내)

import { getSupabase } from '../../lib/supabase.js';
import { randomUUID } from 'crypto';

// Vercel Pro: 최대 300초. 4 PuLID 병렬은 보통 30~50초지만 fal 폭주 시 1장이 길어지면 60초 초과 가능.
// → 300초로 잡고 한 장당 abort timeout(callPulid)을 110초로 둔다.
export const config = { maxDuration: 300 };

const BUCKET = 'creator-library';
const MAX_PERSONAS = 3;
const PULID_ENDPOINT = 'https://fal.run/fal-ai/flux-pulid';

// 4 각도 — K뷰티 콘텐츠용 (정면 무표정 / 반측면 살짝미소 / 정면 환한미소 / 정면 클로즈업)
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

const COST_USD_APPROX = 0.16;

function falHeaders() {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY 미설정');
  return { Authorization: `Key ${key}`, 'Content-Type': 'application/json' };
}

async function callPulid(referenceUrl, prompt) {
  const res = await fetch(PULID_ENDPOINT, {
    method: 'POST',
    headers: falHeaders(),
    body: JSON.stringify({
      prompt,
      reference_image_url: referenceUrl,
      image_size: 'portrait_4_3',
      num_inference_steps: 20,
      guidance_scale: 4,
      true_cfg: 1,
      id_weight: 1,
      max_sequence_length: 128,
      output_format: 'jpeg',
      num_images: 1,
    }),
    signal: AbortSignal.timeout(110000),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`PuLID ${res.status}: ${t.substring(0, 200)}`);
  }
  const data = await res.json();
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error('PuLID 응답에 이미지 URL 없음');
  return url;
}

async function persistImage(sb, identityId, personaId, angle, falUrl) {
  try {
    const imgRes = await fetch(falUrl);
    if (!imgRes.ok) return { url: falUrl, path: null };
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const ts = Date.now();
    const path = `${identityId}/persona/${personaId}/candidate-${angle}-${ts}.jpeg`;
    const { error } = await sb.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: 'image/jpeg', upsert: false });
    if (error) {
      console.warn('[persona-pulid] storage upload 실패:', error.message);
      return { url: falUrl, path: null };
    }
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub?.publicUrl || falUrl, path };
  } catch (e) {
    console.warn('[persona-pulid] persist 예외:', e.message);
    return { url: falUrl, path: null };
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
        meta: { angles: ANGLES.map(({ key, label }) => ({ key, label })), costUsdApprox: COST_USD_APPROX, max: MAX_PERSONAS },
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ─────────── POST ?action=create ───────────
  if (req.method === 'POST' && action === 'create') {
    const {
      identityId = 'mine-primary',
      name,
      sourceSelfieUrl,
      sourceSelfieAssetId,
    } = req.body || {};
    if (!sourceSelfieUrl) {
      return res.status(400).json({ error: 'sourceSelfieUrl 필수' });
    }

    // MAX_PERSONAS (v3만 카운트)
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
        const falUrl = await callPulid(sourceSelfieUrl, a.prompt);
        const { url, path } = await persistImage(sb, identityId, personaId, a.key, falUrl);
        return {
          angle: a.key,
          label: a.label,
          url,
          path,
          falUrl,
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
        console.error(`[persona-pulid] ${a.key} 실패:`, msg);
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
      identityId,
      name: name || `내 페르소나 ${v3Count + 1}`,
      sourceSelfieAssetId: sourceSelfieAssetId || null,
      sourceSelfieUrl,
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

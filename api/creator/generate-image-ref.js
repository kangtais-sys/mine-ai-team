// §8 — 레퍼런스-가이드 이미지 자체생성 (Higgsfield Cloud 공식 API, 안정 hf-api-key).
// {prompt, referenceUrls[], aspect} → (referenceUrls 있으면 custom-reference 생성) →
//   /v1/text2image/soul 로 오리지널 생성 → 우리 Blob 저장 → {url}.
// ★ device-auth(회전 fnf 토큰) 의존 제거 — 영상 파이프라인과 동일한 HIGGSFIELD_API_KEY 사용(만료 없음).
//
// 인증: Bearer CREATOR_INGEST_SECRET (코웍). 미들웨어 예외.
// 검증: 422 프로브로 스키마 확인 — text2image/soul params{prompt,width_and_height(enum)},
//        custom-references {name, input_images:[{type:'image_url',image_url}]}.
import { put } from '@vercel/blob';

export const config = { maxDuration: 120 };

const BASE = 'https://platform.higgsfield.ai';

function hfHeaders() {
  const key = (process.env.HIGGSFIELD_API_KEY || '').replace(/^["']|["']$/g, '').trim();
  if (!key) throw new Error('HIGGSFIELD_API_KEY 없음');
  return { 'hf-api-key': key, 'Content-Type': 'application/json', 'Origin': 'https://cloud.higgsfield.ai', 'Referer': 'https://cloud.higgsfield.ai/' };
}

// aspect → Higgsfield Soul width_and_height enum (검증된 허용값)
const SIZE = { '4:5': '1536x2048', '3:4': '1536x2048', '9:16': '1152x2048', '1:1': '1536x1536', '2:3': '1120x1680' };

const isHttps = (u) => { try { return new URL(u).protocol === 'https:'; } catch { return false; } };

// referenceUrls → custom-reference 생성 → reference id (best-effort)
async function createReference(urls) {
  const res = await fetch(`${BASE}/v1/custom-references`, {
    method: 'POST', headers: hfHeaders(),
    body: JSON.stringify({ name: `ref-${Date.now()}`, input_images: urls.map(u => ({ type: 'image_url', image_url: u })) }),
  });
  if (!res.ok) throw new Error(`custom-reference 생성 실패(${res.status}): ${(await res.text()).slice(0, 150)}`);
  const d = await res.json();
  const id = d.id || d.request_id || d.custom_reference_id;
  if (!id) throw new Error('reference id 없음');
  return id;
}

async function pollJobSet(jobSetId, deadlineMs) {
  while (Date.now() < deadlineMs) {
    await new Promise(r => setTimeout(r, 3000));
    const r = await fetch(`${BASE}/v1/job-sets/${jobSetId}`, { headers: hfHeaders() });
    if (!r.ok) continue;
    const data = await r.json();
    const job = data.jobs?.[0];
    const status = job?.status || data.status;
    if (status === 'completed') {
      const rr = job?.results || {};
      const url = rr.raw?.url || rr.min?.url || rr.image?.url || rr.url || rr.images?.[0]?.url || data.url || null;
      if (url) return url;
      throw new Error(`완료지만 이미지 URL 못 찾음: ${JSON.stringify(rr).slice(0, 200)}`);
    }
    if (['failed', 'nsfw', 'canceled'].includes(status)) throw new Error(`생성 ${status}: ${job?.error || ''}`);
  }
  throw new Error('생성 타임아웃');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.CREATOR_INGEST_SECRET;
  if (!secret) return res.status(503).json({ error: 'Service misconfigured' });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  const { prompt, referenceUrls = [], aspect = '4:5' } = req.body || {};
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'prompt 필요' });
  const refs = (Array.isArray(referenceUrls) ? referenceUrls : []).filter(isHttps).slice(0, 4);
  const width_and_height = SIZE[aspect] || SIZE['4:5'];

  try {
    // 1) 레퍼런스 생성 (있을 때만, best-effort — 실패해도 텍스트 생성은 진행)
    let refId = null, refNote = null;
    if (refs.length) {
      try { refId = await createReference(refs); }
      catch (e) { refNote = `reference skip: ${e.message}`; console.warn('[generate-image-ref]', refNote); }
    }

    // 2) text2image/soul 생성
    const params = { prompt: prompt.trim(), width_and_height };
    if (refId) { params.custom_reference_id = refId; params.custom_reference_strength = 0.6; }
    const sub = await fetch(`${BASE}/v1/text2image/soul`, { method: 'POST', headers: hfHeaders(), body: JSON.stringify({ params }) });
    if (!sub.ok) throw new Error(`생성 제출 실패(${sub.status}): ${(await sub.text()).slice(0, 200)}`);
    const subData = await sub.json();
    const jobSetId = subData.id || subData.request_id;
    if (!jobSetId) throw new Error(`job-set id 없음: ${JSON.stringify(subData).slice(0, 150)}`);

    // 3) 폴링 → 이미지 URL
    const imageUrl = await pollJobSet(jobSetId, Date.now() + 100_000);

    // 4) 우리 Blob 저장(앱 소유)
    const img = await fetch(imageUrl);
    const buf = Buffer.from(await img.arrayBuffer());
    const blob = await put(`gen/soul-${jobSetId}.png`, buf, { access: 'public', contentType: 'image/png', addRandomSuffix: true });

    return res.status(200).json({ url: blob.url, size: width_and_height, usedReference: !!refId, ...(refNote && { refNote }) });
  } catch (e) {
    console.error('[generate-image-ref]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

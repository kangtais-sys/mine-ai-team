// §8 — 레퍼런스-가이드 이미지 자체생성 (앱-사이드 Higgsfield 공식 API).
// {prompt, referenceUrls[], aspect} → 핀터 레퍼런스(§6 캡처)를 Higgsfield 에 업로드 →
//   nano_banana_2(이미지-레퍼런스 모델)로 무드 반영 오리지널 생성 → 우리 Blob 에 저장 → {url}.
// 카드 메인 이미지를 주제 맞춤 오리지널로. (persona-image.js 의 검증된 업로드/잡/폴링 흐름 재사용)
//
// 인증: Bearer CREATOR_INGEST_SECRET (다른 코웍 엔드포인트와 동일). 미들웨어 예외.
// ⚠️ 힉스필드 웹 UI 긁기 금지 — 공식 /agents API 만 사용.
import { put } from '@vercel/blob';
import { fnfFetch as fnfFetchBase } from '../../lib/higgsfield-tokens.js';

export const config = { maxDuration: 120 };

const FNF_BASE = 'https://fnf.higgsfield.ai';
const fnfFetch = (url, options = {}) => fnfFetchBase(url, options, 'generate-image-ref');

// 4:5(카드) → Higgsfield 포트레이트 enum '3:4', 9:16(릴스) 그대로
const ASPECT = { '4:5': '3:4', '3:4': '3:4', '9:16': '9:16', '1:1': '1:1' };

// SSRF — 레퍼런스 URL 은 공개 https 만 (우리가 fetch 해서 Higgsfield 에 올림)
function safeHttps(u) {
  try { const x = new URL(u); if (x.protocol !== 'https:') return false; const h = x.hostname.toLowerCase();
    if (h === 'localhost' || /^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return false;
    return true; } catch { return false; }
}

// 이미지 URL → Higgsfield 업로드 슬롯 → PUT → media_input 참조
async function uploadRef(url) {
  const slot = await fnfFetch(`${FNF_BASE}/agents/uploads?type=image`, { method: 'POST', body: JSON.stringify({ url: 'placeholder' }) });
  if (!slot.ok) throw new Error(`업로드 슬롯 실패(${slot.status})`);
  const { id: mediaId, upload_url } = await slot.json();
  if (!mediaId || !upload_url) throw new Error('업로드 슬롯 응답 이상');
  const imgRes = await fetch(url, { redirect: 'manual' });
  if (!imgRes.ok || !imgRes.body) throw new Error(`레퍼런스 다운로드 실패(${imgRes.status})`);
  const mime = imgRes.headers.get('content-type') || 'image/jpeg';
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const putRes = await fetch(upload_url, { method: 'PUT', headers: { 'Content-Type': mime }, body: buf });
  if (!putRes.ok && putRes.status !== 200) throw new Error(`S3 PUT 실패(${putRes.status})`);
  return { id: mediaId, type: 'media_input' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.CREATOR_INGEST_SECRET;
  if (!secret) return res.status(503).json({ error: 'Service misconfigured' });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  const { prompt, referenceUrls = [], aspect = '4:5' } = req.body || {};
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'prompt 필요' });
  const refs = Array.isArray(referenceUrls) ? referenceUrls.slice(0, 3) : [];
  for (const u of refs) if (!safeHttps(u)) return res.status(400).json({ error: `안전하지 않은 referenceUrl: ${u}` });

  try {
    // 1) 레퍼런스 업로드
    const inputImages = [];
    for (const u of refs) inputImages.push(await uploadRef(u));

    // 2) nano_banana_2 잡 생성 (레퍼런스 무드 반영 오리지널)
    const jobRes = await fnfFetch(`${FNF_BASE}/agents/jobs`, {
      method: 'POST',
      body: JSON.stringify({
        job_set_type: 'nano_banana_2',
        params: {
          prompt: prompt.trim(),
          aspect_ratio: ASPECT[aspect] || '3:4',
          ...(inputImages.length && { input_images: inputImages }),
          enhance_prompt: true,
        },
      }),
    });
    if (!jobRes.ok) throw new Error(`잡 생성 실패(${jobRes.status}): ${(await jobRes.text()).slice(0, 200)}`);
    const ids = await jobRes.json();
    const jobId = Array.isArray(ids) ? ids[0] : ids.id;
    if (!jobId) throw new Error('잡 ID 없음');

    // 3) 폴링 (최대 105초)
    const deadline = Date.now() + 105_000;
    let resultUrl = null;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000));
      const st = await fnfFetch(`${FNF_BASE}/agents/jobs/${jobId}`, { method: 'GET' });
      if (!st.ok) continue;
      const job = await st.json();
      if (job.status === 'completed' && job.result_url) { resultUrl = job.result_url; break; }
      if (job.status === 'failed') throw new Error('생성 잡 실패');
    }
    if (!resultUrl) throw new Error('생성 타임아웃');

    // 4) 결과를 우리 Blob 에 저장(앱 소유 URL — Higgsfield CloudFront 만료/CORS 회피)
    const imgRes = await fetch(resultUrl);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const blob = await put(`gen/ref-${jobId}.png`, buf, { access: 'public', contentType: 'image/png', addRandomSuffix: true });

    return res.status(200).json({ url: blob.url, refs: inputImages.length, aspect: ASPECT[aspect] || '3:4' });
  } catch (e) {
    console.error('[generate-image-ref]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

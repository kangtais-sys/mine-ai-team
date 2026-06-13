// Nano Banana Pro(nano_banana_2) 직접 이미지 생성 — input_images 를 그대로 입력(custom-reference 학습 없음).
//   → carousel 커버에서 soul+custom-reference(학습 큐·동시4 잼) 대체. persona-image.js 검증 흐름 재사용.
//   인증: fnf(lib/higgsfield-tokens, Supabase 토큰). 크레딧 풀도 platform API 와 분리(fnf).
//   genNanoBanana({imageUrls, prompt, aspectRatio}) → 완료 이미지 URL(fnf) 반환, 실패 시 null.
import { fnfFetch } from './higgsfield-tokens.js';

const FNF_BASE = 'https://fnf.higgsfield.ai';

// CloudFront flux_kontext 잡 URL(hf_날짜_UUID)이면 잡 ID 직접 사용(업로드 불필요), 아니면 S3 업로드.
const extractHiggsJobId = (url) =>
  (String(url || '').match(/hf_\d{8}_\d{6}_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\./i) || [])[1] || null;

async function toInputImage(url) {
  const jobId = extractHiggsJobId(url);
  if (jobId) return { id: jobId, type: 'flux_kontext_job' };
  // S3 업로드 슬롯 → PUT → media_input
  const slot = await fnfFetch(`${FNF_BASE}/agents/uploads?type=image`, { method: 'POST', body: JSON.stringify({ url: 'placeholder' }) });
  if (!slot.ok) throw new Error(`upload slot ${slot.status}: ${(await slot.text()).slice(0, 100)}`);
  const { id, upload_url } = await slot.json();
  if (!id || !upload_url) throw new Error('upload slot 응답 이상');
  const img = await fetch(url);
  if (!img.ok) throw new Error(`이미지 다운로드 ${img.status}`);
  const buf = Buffer.from(await img.arrayBuffer());
  const put = await fetch(upload_url, { method: 'PUT', headers: { 'Content-Type': img.headers.get('content-type') || 'image/jpeg' }, body: buf });
  if (!put.ok && put.status !== 200) throw new Error(`s3 put ${put.status}`);
  return { id, type: 'media_input' };
}

// imageUrls(0~N) + prompt → nano_banana_2 잡 → 완료 result_url. 실패/타임아웃 시 null(폴백).
export async function genNanoBanana({ imageUrls = [], prompt, aspectRatio = '3:4', deadlineMs = 120000, ctx = 'nano' }) {
  try {
    const inputs = [];
    for (const u of imageUrls) inputs.push(await toInputImage(u));
    const jr = await fnfFetch(`${FNF_BASE}/agents/jobs`, {
      method: 'POST',
      body: JSON.stringify({ job_set_type: 'nano_banana_2', params: { prompt, aspect_ratio: aspectRatio, input_images: inputs, enhance_prompt: true } }),
    });
    if (!jr.ok) throw new Error(`job ${jr.status}: ${(await jr.text()).slice(0, 140)}`);
    const ids = await jr.json();
    const jid = Array.isArray(ids) ? ids[0] : ids.id;
    if (!jid) throw new Error('job id 없음');
    const dl = Date.now() + deadlineMs;
    while (Date.now() < dl) {
      await new Promise(r => setTimeout(r, 3000));
      const s = await fnfFetch(`${FNF_BASE}/agents/jobs/${jid}`, { method: 'GET' });
      if (!s.ok) continue;
      const j = await s.json();
      if (j.status === 'completed' && j.result_url) return j.result_url;
      if (j.status === 'failed') throw new Error('job failed');
    }
    throw new Error('timeout');
  } catch (e) { console.warn(`[nano-banana] ${ctx} 실패(폴백):`, e.message); return null; }
}

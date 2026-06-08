// §6 — 캡처 인제스트. 외부 페이지(amazon.com/올리브영 등)에서 html2canvas 로 뜬 캡처를
// CORS POST 로 받아 Blob 에 올리고 공개 url 반환. (브라우저→sandbox 이미지 다리 제거)
//
// CORS *: 외부 origin 에서 직접 POST 가능. 단 무단 업로드 방지를 위해 Bearer 시크릿 필수
//   (CREATOR_INGEST_SECRET — §1 ingest 와 동일). preflight(OPTIONS)는 인증 없이 통과.
import { put } from '@vercel/blob';

export const config = { maxDuration: 30 };

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.CREATOR_INGEST_SECRET;
  if (!secret) return res.status(503).json({ error: 'Service misconfigured' });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { dataUrl, base64, mimeType, label } = req.body || {};
    let buf, mt = mimeType || 'image/jpeg';
    if (dataUrl) {
      const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
      if (!m) return res.status(400).json({ error: 'dataUrl 형식 오류' });
      mt = m[1]; buf = Buffer.from(m[2], 'base64');
    } else if (base64) {
      buf = Buffer.from(base64, 'base64');
    } else {
      return res.status(400).json({ error: 'dataUrl 또는 base64 필요' });
    }
    if (!buf.length) return res.status(400).json({ error: '빈 이미지' });
    if (buf.length > 4 * 1024 * 1024) return res.status(413).json({ error: '4MB 초과 — 캡처 품질 낮춰서' });

    // 이미지 타입 allowlist + 매직바이트 검증 — 임의 컨텐츠(html/svg) 공개 호스팅(XSS) 차단
    const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const ext = ALLOWED[mt];
    if (!ext) return res.status(415).json({ error: '허용 안 되는 형식(jpeg/png/webp만)' });
    const sniffOk =
      (mt === 'image/png' && buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) ||
      (mt === 'image/jpeg' && buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ||
      (mt === 'image/webp' && buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP');
    if (!sniffOk) return res.status(415).json({ error: '이미지 형식 불일치(매직바이트)' });

    const safeLabel = (label || 'capture').replace(/[^a-zA-Z0-9가-힣_-]/g, '').slice(0, 40) || 'capture';
    const blob = await put(`capture/${safeLabel}.${ext}`, buf, {
      access: 'public', contentType: mt, addRandomSuffix: true,
    });
    return res.status(200).json({ url: blob.url, bytes: buf.length });
  } catch (e) {
    console.error('[ingest-capture]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

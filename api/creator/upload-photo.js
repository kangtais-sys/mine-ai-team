// 사진 업로드 → fal.ai CDN 저장 후 URL 반환
// POST { base64, mimeType, category } → { url }

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { base64, mimeType = 'image/jpeg' } = req.body || {};
  if (!base64) return res.status(400).json({ error: 'base64 필수' });

  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'FAL_API_KEY 미설정' });

  try {
    const buffer = Buffer.from(base64, 'base64');
    const ext = mimeType.includes('png') ? 'png' : 'jpg';

    const uploadRes = await fetch('https://upload.fal.ai/files', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="photo.${ext}"`,
      },
      body: buffer,
      signal: AbortSignal.timeout(25000),
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return res.status(500).json({ error: `업로드 실패 ${uploadRes.status}: ${err.substring(0, 200)}` });
    }

    const data = await uploadRes.json();
    const url = data?.url || data?.file_url;
    if (!url) return res.status(500).json({ error: 'URL 없음', raw: JSON.stringify(data).substring(0, 200) });

    return res.status(200).json({ success: true, url });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

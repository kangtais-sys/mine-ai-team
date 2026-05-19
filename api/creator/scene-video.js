// Kling 2.1 Pro image-to-video — 장면별 영상 생성
// POST { personaImageUrl, visualPrompt, dialogue, duration } → requestId
// GET ?requestId=xxx → status / videoUrl

export const config = { maxDuration: 60 };

function falHeaders() {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY 미설정');
  return { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' };
}

function buildKlingPrompt(visualPrompt, dialogue) {
  return [
    visualPrompt,
    dialogue ? 'speaking dialogue naturally, mouth movements synchronized' : '',
    'photorealistic, cinematic quality, 9:16 vertical portrait, smooth motion, professional lighting, no blur',
  ].filter(Boolean).join(', ');
}

export default async function handler(req, res) {
  // GET — 상태 확인
  if (req.method === 'GET') {
    const { requestId } = req.query;
    if (!requestId) return res.status(400).json({ error: 'requestId 필수' });

    try {
      const statusRes = await fetch(
        `https://queue.fal.run/fal-ai/kling-video/v2.1/pro/image-to-video/requests/${requestId}`,
        { headers: falHeaders(), signal: AbortSignal.timeout(15000) }
      );
      const data = await statusRes.json();

      if (data.status === 'COMPLETED') {
        const videoUrl = data.output?.video?.url;
        return res.status(200).json({ status: 'completed', videoUrl });
      }
      if (data.status === 'FAILED') {
        return res.status(200).json({ status: 'failed', error: data.error || '생성 실패' });
      }
      return res.status(200).json({
        status: data.status === 'IN_QUEUE' ? 'queued' : 'processing',
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — 영상 생성 요청
  if (req.method === 'POST') {
    const {
      personaImageUrl,
      visualPrompt,
      dialogue = '',
      duration = 5,
    } = req.body || {};

    if (!personaImageUrl || !visualPrompt) {
      return res.status(400).json({ error: 'personaImageUrl, visualPrompt 필수' });
    }

    // Kling 지원 duration: 5 또는 10초
    const clampedDuration = duration >= 8 ? '10' : '5';
    const prompt = buildKlingPrompt(visualPrompt, dialogue);

    try {
      const submitRes = await fetch(
        'https://queue.fal.run/fal-ai/kling-video/v2.1/pro/image-to-video',
        {
          method: 'POST',
          headers: falHeaders(),
          body: JSON.stringify({
            image_url: personaImageUrl,
            prompt,
            duration: clampedDuration,
            aspect_ratio: '9:16',
          }),
          signal: AbortSignal.timeout(55000),
        }
      );

      if (!submitRes.ok) {
        const err = await submitRes.text();
        return res.status(500).json({ error: `Kling 제출 실패 ${submitRes.status}: ${err.substring(0, 300)}` });
      }

      const data = await submitRes.json();
      const requestId = data?.request_id;
      if (!requestId) {
        return res.status(500).json({ error: 'requestId 없음', raw: JSON.stringify(data).substring(0, 200) });
      }

      return res.status(200).json({ success: true, requestId, status: 'queued' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

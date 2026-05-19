// BGM 생성 — Udio API (pay-per-use, SNS 라이선스 포함)
// POST { topic, durationSec }
// Udio 실패 시 null 반환 (BGM 없이 합성 진행)

export const config = { maxDuration: 60 };

const BGM_PROMPTS = {
  beauty:     'Korean beauty tutorial background music, soft upbeat electronic, modern pop instrumental, no vocals, 120 BPM, bright and friendly',
  ingredient: 'science documentary background, subtle electronic ambient, minimal atmospheric, professional, calm',
  behind:     'behind the scenes casual vibe, light acoustic guitar, warm and friendly, relaxed tempo',
  trend:      'trendy K-pop inspired instrumental, energetic, modern, youthful, upbeat',
  default:    'Korean beauty content background music, soft uplifting electronic, clean instrumental, no lyrics, 110 BPM',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { topic = 'default', durationSec = 30 } = req.body || {};
  const apiKey = process.env.UDIO_API_KEY;

  if (!apiKey) {
    console.log('[BGM] UDIO_API_KEY 없음 — BGM 스킵');
    return res.status(200).json({ success: true, audioUrl: null, _skipped: true });
  }

  const prompt = BGM_PROMPTS[topic] || BGM_PROMPTS.default;

  try {
    const genRes = await fetch('https://udioapi.pro/api/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, duration: Math.min(durationSec, 60) }),
      signal: AbortSignal.timeout(55000),
    });

    if (!genRes.ok) {
      const err = await genRes.text();
      console.warn(`[BGM] Udio 실패 ${genRes.status}: ${err.substring(0, 100)}`);
      return res.status(200).json({ success: true, audioUrl: null, _skipped: true });
    }

    const data = await genRes.json();
    const audioUrl = data?.audio_url || data?.url || data?.songs?.[0]?.audio_url;
    return res.status(200).json({ success: true, audioUrl: audioUrl || null });
  } catch (e) {
    console.warn('[BGM] 오류:', e.message);
    return res.status(200).json({ success: true, audioUrl: null, _skipped: true });
  }
}

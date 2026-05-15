// 보이스 생성 — Google Cloud TTS (ko-KR Wavenet)
// POST { script, voice, draftId }
// Returns { audioBase64, mimeType, durationSec }

import { Redis } from '@upstash/redis';

export const config = { maxDuration: 60 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const VOICE_MAP = {
  'female-warm':  { name: 'ko-KR-Wavenet-B', ssmlGender: 'FEMALE' },
  'female-clear': { name: 'ko-KR-Wavenet-A', ssmlGender: 'FEMALE' },
  'male':         { name: 'ko-KR-Wavenet-C', ssmlGender: 'MALE' },
};

// Google TTS는 API Key 방식으로 호출 (JWT보다 단순하고 안정적)
function getTtsApiKey() {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GOOGLE_API_KEY 환경변수 미설정');
  return key;
}

function buildSsml(script) {
  const sentences = script
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.。！？!?\n])/)
    .map(s => s.trim())
    .filter(Boolean);

  const body = sentences
    .map(s => `<s>${s}</s><break time="350ms"/>`)
    .join('\n');

  return `<speak>${body}</speak>`;
}

function estimateDuration(audioBase64) {
  // MP3 ~128kbps = 16000 bytes/sec
  const bytes = Buffer.byteLength(audioBase64, 'base64');
  return Math.round(bytes / 16000);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { script, voice = 'female-warm', draftId } = req.body || {};
  if (!script) return res.status(400).json({ error: 'script 필수' });

  const voiceConfig = VOICE_MAP[voice] || VOICE_MAP['female-warm'];

  try {
    const apiKey = getTtsApiKey();
    const ssml = buildSsml(script);

    const ttsRes = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { ssml },
        voice: {
          languageCode: 'ko-KR',
          name: voiceConfig.name,
          ssmlGender: voiceConfig.ssmlGender,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 1.05,
          pitch: 0,
          volumeGainDb: 2.0,
        },
      }),
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      return res.status(502).json({ error: `TTS API 오류 ${ttsRes.status}: ${errText.substring(0, 300)}` });
    }

    const ttsData = await ttsRes.json();
    const audioBase64 = ttsData.audioContent;
    if (!audioBase64) return res.status(502).json({ error: 'TTS 응답에 audioContent 없음' });

    const durationSec = estimateDuration(audioBase64);

    if (draftId) {
      // 오디오 캐시 저장
      await redis.set(
        `creator:audio:${draftId}`,
        { audioBase64, mimeType: 'audio/mp3', durationSec, voice },
        { ex: 86400 },
      ).catch(() => {});

      // 드래프트 패치
      const raw = await redis.get(`creator:draft:${draftId}`).catch(() => null);
      if (raw) {
        const draft = typeof raw === 'string' ? JSON.parse(raw) : raw;
        await redis.set(
          `creator:draft:${draftId}`,
          { ...draft, audioBase64, audioDuration: durationSec, updatedAt: new Date().toISOString() },
          { ex: 86400 * 30 },
        ).catch(() => {});
      }
    }

    return res.status(200).json({ success: true, audioBase64, mimeType: 'audio/mp3', durationSec });
  } catch (e) {
    console.error('[Creator Voice]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// 보이스 생성 — ElevenLabs eleven_multilingual_v2 (한국어 네이티브 여성 보이스)
// POST { script, voice, draftId }
// Returns { audioBase64, mimeType, durationSec }

import { Redis } from '@upstash/redis';

export const config = { maxDuration: 60 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ElevenLabs 한국어 여성 보이스 맵 (한국어 네이티브 모델)
// 출처: json2video.com/ai-voices/elevenlabs/languages/korean + ElevenLabs Voice Library
const VOICE_MAP = {
  'female-warm':  { name: 'JiYoung',  voice_id: 'AW5wrnG1jVizOYY7R1Oo' },  // 서울 억양 프리미엄 여성
  'female-clear': { name: 'Seulki',   voice_id: 'ksaI0TCD9BstzEzlxj4q' },  // 깔끔한 여성
  'female-pro':   { name: 'Rosa Oh',  voice_id: 'sf8Bpb1IU97NI9BHSMRf' },  // 전문직 여성
  'male':         { name: 'Chungman', voice_id: '8MwPLtBplylvbrksiBOC' },  // 남성
};

function getApiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY 환경변수 미설정');
  return key;
}

// 스크립트를 자연스러운 말투로 전처리
// 개행을 공백으로 뭉개지 않고 → ElevenLabs가 인식하는 자연 pause로 변환
function preprocessScript(script) {
  return script
    .replace(/\r\n/g, '\n')
    // 개행 = 숨 고르는 포인트 → 짧은 정지 처리 (마침표가 없으면 추가)
    .replace(/([^.!?。])\n/g, '$1. ')
    .replace(/([.!?。])\n/g, '$1 ')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// MP3 binary에서 duration 추정 (128kbps 기준)
function estimateDuration(audioBuffer) {
  // MP3 @128kbps = 16000 bytes/sec
  return Math.max(1, Math.round(audioBuffer.length / 16000));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { script, voice = 'female-warm', draftId } = req.body || {};
  if (!script) return res.status(400).json({ error: 'script 필수' });

  const voiceConfig = VOICE_MAP[voice] || VOICE_MAP['female-warm'];
  const apiKey = getApiKey();
  const text = preprocessScript(script);

  try {
    console.log(`[Voice] ElevenLabs 요청 — 보이스: ${voiceConfig.name}, 텍스트 길이: ${text.length}`);

    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceConfig.voice_id}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          language_code: 'ko',
          voice_settings: {
            stability: 0.40,          // 더 자연스러운 변화 (낮을수록 생동감)
            similarity_boost: 0.80,   // 보이스 일관성 유지
            style: 0.48,              // 표현력 올림 (0.35 → 0.48) — 더 자연스러운 억양
            use_speaker_boost: true,  // 더 선명한 음질
            speed: 1.0,               // 자연 속도 (1.05는 약간 급해보임)
          },
          output_format: 'mp3_44100_128',
        }),
      }
    );

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      // 보이스 ID가 유효하지 않으면 fallback 보이스로 재시도
      if (ttsRes.status === 400 || ttsRes.status === 422) {
        console.warn(`[Voice] ${voiceConfig.name} 실패, Rachel로 fallback`);
        return await tryFallbackVoice(text, apiKey, draftId, script, res);
      }
      return res.status(502).json({ error: `ElevenLabs 오류 ${ttsRes.status}: ${errText.substring(0, 300)}` });
    }

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
    if (!audioBuffer || audioBuffer.length < 1000) {
      return res.status(502).json({ error: 'ElevenLabs 응답 오디오 없음' });
    }

    const audioBase64 = audioBuffer.toString('base64');
    const durationSec = estimateDuration(audioBuffer);
    console.log(`[Voice] 완료 — ${durationSec}초, ${audioBuffer.length} bytes`);

    if (draftId) {
      await redis.set(
        `creator:audio:${draftId}`,
        { audioBase64, mimeType: 'audio/mp3', durationSec, voice, voiceName: voiceConfig.name },
        { ex: 86400 },
      ).catch(() => {});

      const raw = await redis.get(`creator:draft:${draftId}`).catch(() => null);
      if (raw) {
        const draft = typeof raw === 'string' ? JSON.parse(raw) : raw;
        await redis.set(
          `creator:draft:${draftId}`,
          { ...draft, audioBase64, audioDuration: durationSec, voiceName: voiceConfig.name, updatedAt: new Date().toISOString() },
          { ex: 86400 * 30 },
        ).catch(() => {});
      }
    }

    return res.status(200).json({ success: true, audioBase64, mimeType: 'audio/mp3', durationSec, voiceName: voiceConfig.name });
  } catch (e) {
    console.error('[Creator Voice]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ElevenLabs 기본 안정 보이스로 fallback (Sola — 부드러운 한국어 여성)
async function tryFallbackVoice(text, apiKey, draftId, script, res) {
  const fallbackVoiceId = 'KlstlYt9VVf3zgie2Oht'; // Sola
  const fallbackRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${fallbackVoiceId}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        language_code: 'ko',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true, speed: 1.0 },
        output_format: 'mp3_44100_128',
      }),
    }
  );
  if (!fallbackRes.ok) {
    const err = await fallbackRes.text();
    return res.status(502).json({ error: `ElevenLabs fallback 실패: ${err.substring(0, 200)}` });
  }
  const buf = Buffer.from(await fallbackRes.arrayBuffer());
  const audioBase64 = buf.toString('base64');
  const durationSec = Math.max(1, Math.round(buf.length / 16000));

  if (draftId) {
    const raw = await redis.get(`creator:draft:${draftId}`).catch(() => null);
    if (raw) {
      const draft = typeof raw === 'string' ? JSON.parse(raw) : raw;
      await redis.set(`creator:draft:${draftId}`, { ...draft, audioBase64, audioDuration: durationSec, updatedAt: new Date().toISOString() }, { ex: 86400 * 30 }).catch(() => {});
    }
  }
  return res.status(200).json({ success: true, audioBase64, mimeType: 'audio/mp3', durationSec, voiceName: 'Sola (fallback)' });
}

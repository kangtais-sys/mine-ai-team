// 보이스 생성 — ElevenLabs eleven_multilingual_v2 (한국어 네이티브 여성 보이스)
// POST { script, voice, draftId }
// Returns { audioBase64, mimeType, durationSec }

import { Redis } from '@upstash/redis';

export const config = { maxDuration: 60 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ElevenLabs 보이스 맵
// 한국어 네이티브 보이스 (라이브러리 — Creator 플랜 이상 필요)
// 기본 내장 보이스 (모든 플랜 — eleven_multilingual_v2로 한국어 가능)
const VOICE_MAP = {
  // ── 한국어 네이티브 (유료 플랜 전용) ──
  'female-warm':  { name: 'JiYoung',  voice_id: 'AW5wrnG1jVizOYY7R1Oo', requiresPaid: true },
  'female-clear': { name: 'Seulki',   voice_id: 'ksaI0TCD9BstzEzlxj4q', requiresPaid: true },
  'female-pro':   { name: 'Rosa Oh',  voice_id: 'sf8Bpb1IU97NI9BHSMRf', requiresPaid: true },
  'male':         { name: 'Chungman', voice_id: '8MwPLtBplylvbrksiBOC', requiresPaid: true },
  // ── 기본 내장 (무료 플랜 — 한국어 가능) ──
  'female-basic': { name: 'Rachel',   voice_id: '21m00Tcm4TlvDq8ikWAM', requiresPaid: false },
  'female-soft':  { name: 'Bella',    voice_id: 'EXAVITQu4vr4xnSDxMaL', requiresPaid: false },
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

  // 요청 보이스 없거나 유료 전용이면 기본 보이스로 폴백
  let voiceConfig = VOICE_MAP[voice] || VOICE_MAP['female-warm'];
  // 유료 보이스인지 체크 — 실패 시 자동으로 Rachel로 폴백

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
      // 402 (유료 플랜 필요) 또는 400/422 → Rachel 폴백
      if (ttsRes.status === 402 || ttsRes.status === 400 || ttsRes.status === 422) {
        console.warn(`[Voice] ${voiceConfig.name} 실패 (${ttsRes.status}), Rachel로 fallback`);
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

// Google TTS 폴백 — ElevenLabs 유료 플랜 없을 때 사용
// ko-KR-Neural2-C (여성) — 자연스러운 한국어, 무료 100만 자/월
async function tryFallbackVoice(text, _elevenApiKey, draftId, _script, res) {
  const googleKey = process.env.GOOGLE_TTS_API_KEY;
  if (!googleKey) {
    return res.status(502).json({ error: 'ElevenLabs 유료 플랜 또는 GOOGLE_TTS_API_KEY 필요' });
  }

  console.log('[Voice] Google TTS 폴백 사용 (ko-KR-Neural2-C)');
  const ttsRes = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: 'ko-KR',
          name: 'ko-KR-Neural2-C',   // 자연스러운 여성 한국어
          ssmlGender: 'FEMALE',
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 1.0,
          pitch: 0.0,
          effectsProfileId: ['headphone-class-device'],
        },
      }),
    }
  );

  if (!ttsRes.ok) {
    const err = await ttsRes.text();
    return res.status(502).json({ error: `Google TTS 실패 ${ttsRes.status}: ${err.substring(0, 200)}` });
  }

  const { audioContent } = await ttsRes.json();
  if (!audioContent) return res.status(502).json({ error: 'Google TTS audioContent 없음' });

  const buf = Buffer.from(audioContent, 'base64');
  const durationSec = Math.max(1, Math.round(buf.length / 16000));

  if (draftId) {
    const raw = await redis.get(`creator:draft:${draftId}`).catch(() => null);
    if (raw) {
      const draft = typeof raw === 'string' ? JSON.parse(raw) : raw;
      await redis.set(
        `creator:draft:${draftId}`,
        { ...draft, audioBase64: audioContent, audioDuration: durationSec, voiceName: 'Google Neural2-C', updatedAt: new Date().toISOString() },
        { ex: 86400 * 30 }
      ).catch(() => {});
    }
  }
  return res.status(200).json({ success: true, audioBase64: audioContent, mimeType: 'audio/mp3', durationSec, voiceName: 'Google Neural2-C (fallback)' });
}

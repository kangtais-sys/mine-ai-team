// 자막 타이밍 생성 — Claude API로 스크립트를 세그먼트로 분할
// POST { script, durationSec, draftId }
// Returns { segments: [{text, startSec, endSec}], srtContent }

import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';

export const config = { maxDuration: 30 };

const anthropic = new Anthropic();
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

function toSrtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
}

function buildSrt(segments) {
  return segments
    .map((seg, i) => `${i+1}\n${toSrtTime(seg.startSec)} --> ${toSrtTime(seg.endSec)}\n${seg.text}`)
    .join('\n\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { script, durationSec, draftId } = req.body || {};
  if (!script) return res.status(400).json({ error: 'script 필수' });
  if (!durationSec || durationSec <= 0) return res.status(400).json({ error: 'durationSec 필수' });

  const prompt = `아래 한국어 스크립트를 영상 자막 세그먼트로 나눠줘.

영상 길이: ${durationSec}초
스크립트:
${script}

규칙:
1. 세그먼트당 2~5단어 (짧고 임팩트 있게, K-뷰티 숏츠 스타일)
2. 자연스러운 문장 단위로 끊기
3. 전체 타임라인이 0~${durationSec}초 내에 고르게 분포
4. 첫 세그먼트는 0.3초에 시작
5. 마지막 세그먼트는 ${(durationSec - 0.5).toFixed(1)}초 이전에 끝
6. startSec / endSec 소수점 한 자리

순수 JSON만 반환:
{"segments":[{"text":"자막텍스트","startSec":0.3,"endSec":1.8}]}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0]?.text || '';
    let parsed;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : raw);
    } catch {
      return res.status(500).json({ error: 'Claude 자막 파싱 실패', raw: raw.substring(0, 400) });
    }

    const segments = (parsed.segments || []).map(s => ({
      text: String(s.text || '').trim(),
      startSec: parseFloat(s.startSec) || 0,
      endSec: parseFloat(s.endSec) || 1,
    }));

    const srtContent = buildSrt(segments);

    if (draftId) {
      await redis.set(`creator:subtitles:${draftId}`, { segments, srtContent }, { ex: 86400 }).catch(() => {});
      const draftRaw = await redis.get(`creator:draft:${draftId}`).catch(() => null);
      if (draftRaw) {
        const draft = typeof draftRaw === 'string' ? JSON.parse(draftRaw) : draftRaw;
        await redis.set(
          `creator:draft:${draftId}`,
          { ...draft, subtitleSegments: segments, updatedAt: new Date().toISOString() },
          { ex: 86400 * 30 },
        ).catch(() => {});
      }
    }

    return res.status(200).json({ success: true, segments, srtContent });
  } catch (e) {
    console.error('[Creator Subtitle]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

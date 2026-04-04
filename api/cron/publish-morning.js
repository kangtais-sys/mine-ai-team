import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';

const anthropic = new Anthropic();
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});
const ZERNIO = 'https://zernio.com/api/v1';
const zFetch = (path, opts = {}) => fetch(`${ZERNIO}${path}`, { ...opts, headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json', ...opts.headers } }).then(r => r.json());

export const config = { maxDuration: 120 };

// KST 11:00 = UTC 02:00 → 인스타 + 틱톡 발행
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const results = { yuminhye: null, millimilli: null };

  try {
    // === 밀리밀리 트랙B: AI 콘텐츠 생성 + 발행 ===
    const captionRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `당신은 MILLIMILLI 밀리밀리 K뷰티 브랜드의 인스타그램 담당자입니다. 500달톤 프로틴 스킨케어 브랜드.
톤: 친근한 언니, 전문적이면서 쉽게. 이모지 2-3개.
해시태그: #밀리밀리 #MILLIMILLI #프로틴스킨케어 #500달톤 + 트렌드 태그 3개.
오늘의 인스타 포스트 캡션을 작성해주세요. 주제: 프로틴 스킨케어 팁.`,
      messages: [{ role: 'user', content: '오늘의 인스타 캡션 써줘' }],
    });

    const caption = captionRes.content[0]?.text || '';

    if (caption) {
      const postRes = await zFetch('/posts', {
        method: 'POST',
        body: JSON.stringify({
          profileId: process.env.ZERNIO_MILLIMILLI_PROFILE_ID,
          text: caption,
          platforms: ['instagram', 'tiktok'],
        }),
      });
      results.millimilli = { success: true, caption: caption.substring(0, 80), platforms: ['instagram', 'tiktok'], post: postRes };
    }

    // === 유민혜: n8n이 드라이브 감지 처리하므로 여기서는 스킵 ===
    results.yuminhye = { note: 'Drive pipeline handles via n8n' };

    // KV에 로그 저장
    const logKey = `publish-log:${today}`;
    const existing = await redis.get(logKey) || [];
    await redis.set(logKey, [...existing, { time: new Date().toISOString(), type: 'morning', ...results }]);

    return res.status(200).json({ success: true, ...results });
  } catch (error) {
    console.error('[Publish Morning]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

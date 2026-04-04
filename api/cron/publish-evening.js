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

// KST 19:00 = UTC 10:00 → 저녁 추가 발행 (인스타+틱톡)
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const captionRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `당신은 MILLIMILLI 밀리밀리 K뷰티 브랜드 SNS 담당자입니다.
저녁 시간대 인스타/틱톡 포스트를 작성해주세요.
톤: 하루 마무리, 스킨케어 루틴 유도, 공감 + 팁.
이모지 2-3개, 해시태그 5개 포함.`,
      messages: [{ role: 'user', content: '저녁 스킨케어 루틴 포스트 캡션 써줘' }],
    });

    const caption = captionRes.content[0]?.text || '';

    const postRes = await zFetch('/posts', {
      method: 'POST',
      body: JSON.stringify({
        profileId: process.env.ZERNIO_MILLIMILLI_PROFILE_ID,
        text: caption,
        platforms: ['instagram', 'tiktok'],
      }),
    });

    const logKey = `publish-log:${today}`;
    const existing = await redis.get(logKey) || [];
    await redis.set(logKey, [...existing, { time: new Date().toISOString(), type: 'evening', caption: caption.substring(0, 80), post: postRes }]);

    return res.status(200).json({ success: true, caption: caption.substring(0, 80) });
  } catch (error) {
    console.error('[Publish Evening]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

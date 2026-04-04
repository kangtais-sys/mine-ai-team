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

// KST 14:00 = UTC 05:00 → 유튜브 중심 발행
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const captionRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: `당신은 MILLIMILLI K뷰티 유튜브 콘텐츠 전문가입니다.
유튜브 쇼츠용 제목 + 설명을 작성해주세요.
JSON: {"title": "50자 이내 SEO 제목", "description": "3줄 설명 + 해시태그"}`,
      messages: [{ role: 'user', content: '오늘의 유튜브 쇼츠 캡션 써줘. 주제: 프로틴 스킨케어 루틴' }],
    });

    const text = captionRes.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { title: '프로틴 스킨케어', description: text };

    const postRes = await zFetch('/posts', {
      method: 'POST',
      body: JSON.stringify({
        profileId: process.env.ZERNIO_MILLIMILLI_PROFILE_ID,
        text: `${parsed.title}\n\n${parsed.description}`,
        platforms: ['youtube'],
      }),
    });

    const logKey = `publish-log:${today}`;
    const existing = await redis.get(logKey) || [];
    await redis.set(logKey, [...existing, { time: new Date().toISOString(), type: 'afternoon', youtube: { title: parsed.title, post: postRes } }]);

    return res.status(200).json({ success: true, title: parsed.title });
  } catch (error) {
    console.error('[Publish Afternoon]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

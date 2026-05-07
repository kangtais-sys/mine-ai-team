import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 자동 댓글/DM 응대 비활성화 상태
// 재활성화 전 페르소나 및 응대 기준 정의 필요
export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', autoReply: false });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 원시 웹훅 로그만 저장 (발송 없음)
  try {
    await redis.lpush('webhook-raw', JSON.stringify({
      timestamp: new Date().toISOString(),
      body: req.body,
    }));
    await redis.ltrim('webhook-raw', 0, 99);
  } catch {}

  console.log('[Webhook] received (auto-reply disabled):', JSON.stringify(req.body).slice(0, 200));

  return res.status(200).json({ received: true, autoReply: false });
}

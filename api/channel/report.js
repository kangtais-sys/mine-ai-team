// 채널 운영 일일 보고서 조회 API
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const raw = await redis.get('channel:daily-report');
    if (!raw) return res.status(200).json({ report: '', summary: null, date: null });
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

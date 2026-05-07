import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Data is fetched by Mac cron (~/.milli-cron/naver-sync.mjs) due to Naver IP whitelist restriction.
// That script stores results in Redis under 'sales:naver:daily'. This handler just serves it.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const cached = await redis.get('sales:naver:daily');
    if (cached) return res.status(200).json(cached);
    return res.status(200).json({ connected: true, months: [], monthly: {}, updatedAt: null, pendingSync: true });
  } catch (e) {
    console.error('[Naver Sales]', e.message);
    res.status(500).json({ error: e.message });
  }
}

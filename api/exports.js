import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    // Future: read from Amazon SP-API, Shopee, Qoo10 APIs
    // For now: read from Redis (manual or cron-populated)
    const [exportMonthly, exportByCountry] = await Promise.all([
      redis.get('exports:monthly'),
      redis.get('exports:by-country'),
    ]);

    // If no data yet, return empty structure
    const monthly = exportMonthly || [];
    const byCountry = exportByCountry || {};
    const totalYTD = Object.values(byCountry).reduce((s, v) => s + (v.ytd || 0), 0);
    const totalMonth = Object.values(byCountry).reduce((s, v) => s + (v.month || 0), 0);
    const yesterday = Object.values(byCountry).reduce((s, v) => s + (v.yesterday || 0), 0);

    return res.status(200).json({ monthly, byCountry, totalYTD, totalMonth, yesterday });
  } catch (e) {
    return res.status(200).json({ monthly: [], byCountry: {}, totalYTD: 0, totalMonth: 0, yesterday: 0 });
  }
}

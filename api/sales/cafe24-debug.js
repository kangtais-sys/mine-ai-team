import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  const accessToken = await redis.get('cafe24:access_token');
  const refreshToken = await redis.get('cafe24:refresh_token');
  if (!accessToken && !refreshToken) return res.status(200).json({ error: 'no tokens' });

  const mallId = (process.env.CAFE24_MALL_ID || 'millius').trim();
  let token = accessToken;

  if (!token) {
    const basic = Buffer.from(`${process.env.CAFE24_CLIENT_ID}:${process.env.CAFE24_CLIENT_SECRET}`).toString('base64');
    const refreshRes = await fetch(`https://${mallId}.cafe24api.com/api/v2/oauth/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
    const fresh = await refreshRes.json();
    token = fresh.access_token;
    if (token) await redis.set('cafe24:access_token', token, { ex: fresh.expires_in || 3600 });
  }

  const endpoints = [
    `/api/v2/admin/orders?limit=10&start_date=2026-04-01&end_date=2026-04-30&shop_no=1`,
    `/api/v2/admin/orders?limit=10&start_date=2026-05-01&end_date=2026-05-07&shop_no=1`,
  ];

  const results = [];
  for (const ep of endpoints) {
    const r = await fetch(`https://${mallId}.cafe24api.com${ep}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Cafe24-Api-Version': '2026-03-01',
      },
    });
    const raw = await r.text();
    results.push({ ep, status: r.status, body: raw.slice(0, 500) });
  }

  res.status(200).json({ mallId, hasToken: !!token, results });
}

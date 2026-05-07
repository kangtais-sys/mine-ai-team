import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function getAccessToken() {
  const accessToken = await redis.get('cafe24:access_token');
  if (accessToken) return accessToken;

  // Refresh using refresh_token
  const refreshToken = await redis.get('cafe24:refresh_token');
  if (!refreshToken) throw new Error('NOT_CONNECTED');

  const mallId = (process.env.CAFE24_MALL_ID || 'millius').trim();
  const basic = Buffer.from(`${process.env.CAFE24_CLIENT_ID}:${process.env.CAFE24_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`https://${mallId}.cafe24api.com/api/v2/oauth/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const fresh = await res.json();
  if (!fresh.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(fresh));

  await Promise.all([
    redis.set('cafe24:access_token', fresh.access_token, { ex: fresh.expires_in || 3600 }),
    fresh.refresh_token && redis.set('cafe24:refresh_token', fresh.refresh_token),
  ]);

  return fresh.access_token;
}

async function cafe24Fetch(path, accessToken) {
  const mallId = (process.env.CAFE24_MALL_ID || 'millius').trim();
  const res = await fetch(`https://${mallId}.cafe24api.com/api/v2${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Cafe24-Api-Version': '2026-03-01',
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Cafe24 ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function fetchMonthlySales(accessToken, months = 5) {
  const monthly = {};
  const now = new Date();

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const startDate = `${monthStr}-01`;
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const endDate = `${monthStr}-${String(lastDay).padStart(2, '0')}`;

    try {
      const data = await cafe24Fetch(
        `/admin/orders?start_date=${startDate}&end_date=${endDate}&limit=100&shop_no=1`,
        accessToken
      );
      const orders = data?.orders || [];
      const total = orders.reduce((sum, o) => {
        return sum + parseFloat(o.payment_amount || o.total_price || o.actual_payment_amount || 0);
      }, 0);
      monthly[monthStr] = { revenue: Math.round(total), orders: orders.length };
    } catch (e) {
      console.error(`[Cafe24] ${monthStr}:`, e.message);
      monthly[monthStr] = { revenue: 0, orders: 0 };
    }
  }

  return monthly;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cacheKey = `sales:cafe24:${new Date().toISOString().slice(0, 13)}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return res.status(200).json(cached);

    const accessToken = await getAccessToken();
    const monthly = await fetchMonthlySales(accessToken);

    const result = {
      monthly,
      months: Object.keys(monthly).sort().map(m => ({
        month: m,
        revenue: monthly[m].revenue,
        orders: monthly[m].orders,
        currency: 'KRW',
      })),
      updatedAt: new Date().toISOString(),
    };

    await redis.set(cacheKey, result, { ex: 3600 });
    res.status(200).json(result);
  } catch (e) {
    if (e.message === 'NOT_CONNECTED') return res.status(200).json({ connected: false });
    console.error('[Cafe24 Sales]', e.message);
    res.status(500).json({ error: e.message });
  }
}

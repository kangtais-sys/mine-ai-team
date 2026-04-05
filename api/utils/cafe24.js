import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function getCafe24Token() {
  const mallId = process.env.CAFE24_MALL_ID || 'millius';

  // Try cached access token first
  let token = await redis.get('cafe24:access_token');
  if (token) return { token, mallId };

  // Refresh using refresh_token
  const refreshToken = await redis.get('cafe24:refresh_token');
  if (!refreshToken) throw new Error('Cafe24 인증 필요 - /api/auth/cafe24 에서 연동하세요');

  const clientId = process.env.CAFE24_CLIENT_ID;
  const clientSecret = process.env.CAFE24_CLIENT_SECRET;

  const res = await fetch(`https://${mallId}.cafe24api.com/api/v2/oauth/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`Cafe24 token refresh failed: ${data.error_description || data.error}`);

  await Promise.all([
    redis.set('cafe24:access_token', data.access_token, { ex: data.expires_in || 3600 }),
    data.refresh_token && redis.set('cafe24:refresh_token', data.refresh_token),
  ]);

  return { token: data.access_token, mallId };
}

async function cafe24Api(path) {
  const { token, mallId } = await getCafe24Token();
  const res = await fetch(`https://${mallId}.cafe24api.com/api/v2${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Cafe24-Api-Version': '2024-06-01',
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cafe24 API ${res.status}: ${err.substring(0, 200)}`);
  }
  return res.json();
}

export async function getOrders(startDate, endDate, limit = 50) {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    limit: String(limit),
  });
  return cafe24Api(`/admin/orders?${params}`);
}

export async function getProducts(limit = 100) {
  return cafe24Api(`/admin/products?limit=${limit}&display=T`);
}

export async function getOrderCount(startDate, endDate) {
  return cafe24Api(`/admin/orders/count?start_date=${startDate}&end_date=${endDate}`);
}

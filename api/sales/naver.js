import bcrypt from 'bcryptjs';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const BASE = 'https://api.commerce.naver.com/external';

async function getToken() {
  const cached = await redis.get('naver:access_token');
  if (cached) return cached;

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('NOT_CONNECTED');

  const timestamp = String(Date.now() - 3000);
  const hashed = bcrypt.hashSync(`${clientId}_${timestamp}`, clientSecret);
  const client_secret_sign = Buffer.from(hashed).toString('base64');

  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      timestamp,
      client_secret_sign,
      grant_type: 'client_credentials',
      type: 'SELF',
      account_type: 'SELLER',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Naver token failed: ' + JSON.stringify(data));
  await redis.set('naver:access_token', data.access_token, { ex: (data.expires_in || 3600) - 60 });
  return data.access_token;
}

async function fetchOrders(token, from, to) {
  let page = 1;
  let allOrders = [];
  while (true) {
    const params = new URLSearchParams({
      lastChangedFrom: from,
      lastChangedTo: to,
      page: String(page),
      size: '500',
    });
    const res = await fetch(`${BASE}/v1/pay-order/seller/orders/last-changed-statuses?${params}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Naver orders ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const orders = data?.lastChangeStatuses || [];
    allOrders = allOrders.concat(orders);
    if (orders.length < 500) break;
    page++;
  }
  return allOrders;
}

async function fetchMonthlySales(token, months = 5) {
  const monthly = {};
  const now = new Date();

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const from = `${monthStr}-01T00:00:00.000Z`;
    const to = `${monthStr}-${String(lastDay).padStart(2, '0')}T23:59:59.000Z`;

    try {
      const orders = await fetchOrders(token, from, to);
      const paid = orders.filter(o => ['PAYED', 'DISPATCHED', 'DELIVERED', 'PURCHASE_DECIDED'].includes(o.paymentStatus));
      const total = paid.reduce((sum, o) => sum + (o.totalPaymentAmount || 0), 0);
      monthly[monthStr] = { revenue: Math.round(total), orders: paid.length };
    } catch (e) {
      console.error(`[Naver] ${monthStr}:`, e.message);
      monthly[monthStr] = { revenue: 0, orders: 0 };
    }
  }
  return monthly;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cacheKey = `sales:naver:${new Date().toISOString().slice(0, 13)}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return res.status(200).json(cached);

    const token = await getToken();
    const monthly = await fetchMonthlySales(token);

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
    console.error('[Naver Sales]', e.message);
    res.status(500).json({ error: e.message });
  }
}

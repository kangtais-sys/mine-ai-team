import { createHmac, createHash } from 'crypto';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function getLwaToken() {
  const cached = await redis.get('amazon:lwa_token');
  if (cached) return cached;

  const res = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.SP_API_REFRESH_TOKEN,
      client_id: process.env.SP_API_CLIENT_ID,
      client_secret: process.env.SP_API_CLIENT_SECRET,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('LWA failed: ' + JSON.stringify(data));
  await redis.set('amazon:lwa_token', data.access_token, { ex: (data.expires_in || 3600) - 60 });
  return data.access_token;
}

function sign(key, msg) { return createHmac('sha256', key).update(msg).digest(); }
function hash(s) { return createHash('sha256').update(s).digest('hex'); }

async function spFetch(path, lwaToken) {
  const host = 'sellingpartnerapi-na.amazon.com';
  const region = process.env.AWS_REGION || 'us-east-1';
  const service = 'execute-api';
  const now = new Date();
  const date = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateOnly = date.slice(0, 8);

  const url = new URL(`https://${host}${path}`);
  const queryStr = [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const headers = {
    host,
    'x-amz-access-token': lwaToken,
    'x-amz-date': date,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(k => `${k}:${headers[k]}\n`).join('');

  const canonical = ['GET', url.pathname, queryStr, canonicalHeaders, signedHeaders, hash('')].join('\n');
  const credScope = `${dateOnly}/${region}/${service}/aws4_request`;
  const strToSign = ['AWS4-HMAC-SHA256', date, credScope, hash(canonical)].join('\n');

  const sigKey = sign(sign(sign(sign(`AWS4${process.env.AWS_SECRET_KEY}`, dateOnly), region), service), 'aws4_request');
  const sig = createHmac('sha256', sigKey).update(strToSign).digest('hex');

  const auth = `AWS4-HMAC-SHA256 Credential=${process.env.AWS_ACCESS_KEY}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;

  const res = await fetch(`https://${host}${path}`, {
    headers: { ...headers, Authorization: auth },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SP-API ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function fetchMonthlySales(lwaToken, months = 5) {
  const monthly = {};
  const now = new Date();
  const marketplaceId = process.env.SP_API_MARKETPLACE_ID || 'ATVPDKIKX0DER';

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    // SP-API는 CreatedBefore가 현재 시각 - 2분 이내면 InvalidInput 거부.
    // 월말이 미래(현재 월)인 경우 현재 시각 - 3분으로 cap.
    const monthEndMs = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
    const safeEndMs = Math.min(monthEndMs, Date.now() - 3 * 60 * 1000);
    const end = new Date(safeEndMs).toISOString();

    try {
      // Canceled/Unfulfillable 제외, 실 결제 주문만
      const PAID_STATUSES = 'Unshipped,PartiallyShipped,Shipped,InvoiceUnconfirmed,Pending,PendingAvailability';
      let allOrders = [];
      let nextToken = null;
      do {
        const params = nextToken
          ? new URLSearchParams({ NextToken: nextToken })
          : new URLSearchParams({
              MarketplaceIds: marketplaceId,
              CreatedAfter: start,
              CreatedBefore: end,
              OrderStatuses: PAID_STATUSES,
              MaxResultsPerPage: '100',
            });
        const data = await spFetch(`/orders/v0/orders?${params}`, lwaToken);
        const orders = data?.payload?.Orders || [];
        allOrders = allOrders.concat(orders);
        nextToken = data?.payload?.NextToken || null;
        if (nextToken) await new Promise(r => setTimeout(r, 1000)); // rate limit
      } while (nextToken);

      const total = allOrders.reduce((sum, o) => sum + parseFloat(o.OrderTotal?.Amount || 0), 0);
      monthly[monthStr] = { revenue: parseFloat(total.toFixed(2)), orders: allOrders.length, currency: 'USD' };
      console.log(`[Amazon] ${monthStr}: ${allOrders.length}건 $${total.toFixed(2)}`);
    } catch (e) {
      console.error(`[Amazon] ${monthStr}:`, e.message);
      monthly[monthStr] = { revenue: 0, orders: 0, currency: 'USD' };
    }
  }

  return monthly;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const forceRefresh = req.query?.refresh === '1';
  // 시간별 키 (TTL 9600s = ~2.7시간) — cron 2h 간격보다 넉넉하게
  const cacheKey = `sales:amazon:${new Date().toISOString().slice(0, 13)}`;
  // 영구 집계 키 (stats.js fallback용, TTL 48h)
  const stableKey = 'sales:amazon:latest';
  try {
    const cached = !forceRefresh && (await redis.get(cacheKey) || await redis.get(stableKey));
    if (cached) return res.status(200).json(cached);

    const lwaToken = await getLwaToken();
    const monthly = await fetchMonthlySales(lwaToken);

    const result = {
      monthly,
      months: Object.keys(monthly).sort().map(m => ({
        month: m,
        ...monthly[m],
      })),
      updatedAt: new Date().toISOString(),
    };

    // 시간별 키: 9600s (2.67h) — cron 2h 사이에 만료 없음
    await redis.set(cacheKey, result, { ex: 9600 });
    // 안정 키: 48h — stats.js가 시간별 키 없을 때 fallback
    await redis.set(stableKey, result, { ex: 172800 });
    res.status(200).json(result);
  } catch (e) {
    console.error('[Amazon Sales]', e.message);
    res.status(500).json({ error: e.message });
  }
}

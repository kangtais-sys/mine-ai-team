import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // === Today stats ===
    const [todayTotal, todayDone, todayPending] = await Promise.all([
      redis.get(`stat:cs:total:${today}`),
      redis.get(`stat:cs:done:${today}`),
      redis.get(`stat:cs:pending:${today}`),
    ]);

    // === Type stats (today) ===
    const [typeExchange, typeDelivery, typeProduct, typeOther] = await Promise.all([
      redis.get(`stat:cs:type:exchange:${today}`),
      redis.get(`stat:cs:type:delivery:${today}`),
      redis.get(`stat:cs:type:product:${today}`),
      redis.get(`stat:cs:type:other:${today}`),
    ]);

    // === Monthly totals ===
    let monthTotal = 0;
    for (let d = 1; d <= now.getDate(); d++) {
      const dateStr = `${thisMonth}-${String(d).padStart(2, '0')}`;
      const v = await redis.get(`stat:cs:total:${dateStr}`);
      monthTotal += Number(v) || 0;
    }

    // === Commerce channel CS ===
    const channels = {};

    // Cafe24
    if (process.env.CAFE24_CLIENT_ID && process.env.CAFE24_MALL_ID) {
      channels.cafe24 = { status: 'connected', mallId: process.env.CAFE24_MALL_ID, pending: '-' };
    } else {
      channels.cafe24 = { status: 'disconnected' };
    }

    // Smartstore
    if (process.env.NAVER_COMMERCE_CLIENT_ID) {
      channels.smartstore = { status: 'connected', pending: '-' };
    } else {
      channels.smartstore = { status: 'disconnected' };
    }

    // Amazon
    if (process.env.AMAZON_SELLER_ID) {
      channels.amazon = { status: 'connected', pending: '-' };
    } else {
      channels.amazon = { status: 'disconnected' };
    }

    // Shopee
    if (process.env.SHOPEE_PARTNER_ID) {
      channels.shopee = { status: 'connected', pending: '-' };
    } else {
      channels.shopee = { status: 'disconnected' };
    }

    // Happytalk
    const happytalk = process.env.HAPPYTALK_API_KEY
      ? { status: 'connected' }
      : { status: 'pending', message: '해피톡 연동 준비 중' };

    return res.status(200).json({
      status: 'active',
      today: {
        total: Number(todayTotal) || 0,
        done: Number(todayDone) || 0,
        pending: Number(todayPending) || 0,
      },
      monthly: { total: monthTotal },
      typeStats: {
        exchange: Number(typeExchange) || 0,
        delivery: Number(typeDelivery) || 0,
        product: Number(typeProduct) || 0,
        other: Number(typeOther) || 0,
      },
      channels,
      happytalk,
    });
  } catch (error) {
    return res.status(200).json({ status: 'error', error: error.message });
  }
}

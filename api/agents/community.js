import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ZERNIO = 'https://zernio.com/api/v1';

async function zFetch(path) {
  if (!process.env.ZERNIO_API_KEY) return {};
  const r = await fetch(`${ZERNIO}${path}`, {
    headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` },
  });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return {};
  return r.json();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // === Today stats (by platform) ===
    const [igToday, ytToday, ttToday, dmToday] = await Promise.all([
      redis.get(`stat:comment:instagram:${today}`),
      redis.get(`stat:comment:youtube:${today}`),
      redis.get(`stat:comment:tiktok:${today}`),
      redis.get(`stat:dm:${today}`),
    ]);

    // === Monthly totals ===
    // Sum daily stats for current month
    let monthComments = 0, monthDM = 0;
    const monthPlatform = { instagram: 0, youtube: 0, tiktok: 0 };
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= Math.min(now.getDate(), daysInMonth); d++) {
      const dateStr = `${thisMonth}-${String(d).padStart(2, '0')}`;
      const [ig, yt, tt, dm] = await Promise.all([
        redis.get(`stat:comment:instagram:${dateStr}`),
        redis.get(`stat:comment:youtube:${dateStr}`),
        redis.get(`stat:comment:tiktok:${dateStr}`),
        redis.get(`stat:dm:${dateStr}`),
      ]);
      monthPlatform.instagram += Number(ig) || 0;
      monthPlatform.youtube += Number(yt) || 0;
      monthPlatform.tiktok += Number(tt) || 0;
      monthDM += Number(dm) || 0;
    }
    monthComments = monthPlatform.instagram + monthPlatform.youtube + monthPlatform.tiktok;

    // === Type stats (today) ===
    const [typeEvent, typeProduct, typeClaim, typeOther] = await Promise.all([
      redis.get(`stat:comment:type:event:${today}`),
      redis.get(`stat:comment:type:product:${today}`),
      redis.get(`stat:comment:type:claim:${today}`),
      redis.get(`stat:comment:type:other:${today}`),
    ]);

    // === Recent comments from Zernio inbox ===
    let recentComments = [];
    try {
      const data = await zFetch('/inbox/comments?limit=10');
      const items = data.data || data.comments || [];
      recentComments = items.slice(0, 10).map(c => ({
        id: c.id,
        text: (c.content || c.text || '').substring(0, 80),
        author: c.accountUsername || c.account?.username,
        platform: c.platform || 'instagram',
        date: c.createdTime || c.createdAt,
        commentCount: c.commentCount || 0,
      }));
    } catch {}

    // === Recent webhook logs ===
    const logs = await redis.lrange('webhook-logs', 0, 9);
    const recentLogs = (logs || []).map(l => { try { return typeof l === 'string' ? JSON.parse(l) : l; } catch { return l; } });

    return res.status(200).json({
      status: 'connected',
      today: {
        comments: (Number(igToday) || 0) + (Number(ytToday) || 0) + (Number(ttToday) || 0),
        dm: Number(dmToday) || 0,
        byPlatform: { instagram: Number(igToday) || 0, youtube: Number(ytToday) || 0, tiktok: Number(ttToday) || 0 },
      },
      monthly: {
        comments: monthComments,
        dm: monthDM,
        byPlatform: monthPlatform,
      },
      typeStats: {
        event: Number(typeEvent) || 0,
        product: Number(typeProduct) || 0,
        claim: Number(typeClaim) || 0,
        other: Number(typeOther) || 0,
      },
      recentComments,
      recentLogs,
    });
  } catch (error) {
    return res.status(200).json({ status: 'error', error: error.message });
  }
}

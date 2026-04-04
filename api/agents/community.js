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

    const [commentTotal, dmTotal] = await Promise.all([
      redis.get('stat:comment:total'),
      redis.get('stat:dm:total'),
    ]);

    const dailyStats = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
      const [ig, yt, tt, dm] = await Promise.all([
        redis.get(`stat:comment:instagram:${d}`),
        redis.get(`stat:comment:youtube:${d}`),
        redis.get(`stat:comment:tiktok:${d}`),
        redis.get(`stat:dm:${d}`),
      ]);
      dailyStats.push({
        date: d,
        instagram: Number(ig) || 0,
        youtube: Number(yt) || 0,
        tiktok: Number(tt) || 0,
        dm: Number(dm) || 0,
      });
    }

    const thisWeekComments = dailyStats.reduce((s, d) => s + d.instagram + d.youtube + d.tiktok, 0);
    const thisWeekDM = dailyStats.reduce((s, d) => s + d.dm, 0);
    const todayStats = dailyStats.find(d => d.date === today) || { instagram: 0, youtube: 0, tiktok: 0, dm: 0 };

    const logs = await redis.lrange('webhook-logs', 0, 9);

    return res.status(200).json({
      status: 'connected',
      totals: { comments: Number(commentTotal) || 0, dm: Number(dmTotal) || 0 },
      today: {
        comments: todayStats.instagram + todayStats.youtube + todayStats.tiktok,
        dm: todayStats.dm,
        byPlatform: { instagram: todayStats.instagram, youtube: todayStats.youtube, tiktok: todayStats.tiktok },
      },
      thisWeek: { comments: thisWeekComments, dm: thisWeekDM },
      dailyStats,
      recentLogs: (logs || []).slice(0, 10).map(l => typeof l === 'string' ? JSON.parse(l) : l),
    });
  } catch (error) {
    return res.status(200).json({ status: 'error', error: error.message });
  }
}

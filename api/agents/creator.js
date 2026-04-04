const ZERNIO = 'https://zernio.com/api/v1';
const zFetch = (path) => fetch(`${ZERNIO}${path}`, {
  headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` },
}).then(r => r.json());

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ZERNIO_API_KEY) return res.status(200).json({ status: 'disconnected', message: 'Zernio 연결 필요' });

  try {
    const data = await zFetch('/posts?limit=50&sort=createdAt:desc');
    const posts = data.posts || data || [];

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now - 7 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const today = posts.filter(p => (p.createdAt || '').startsWith(todayStr));
    const thisWeek = posts.filter(p => new Date(p.createdAt) >= weekAgo);
    const thisMonth = posts.filter(p => new Date(p.createdAt) >= monthStart);

    const byPlatform = {};
    for (const p of thisMonth) {
      for (const plat of p.platforms || [p.platform || 'unknown']) {
        byPlatform[plat] = (byPlatform[plat] || 0) + 1;
      }
    }

    const recent = posts.slice(0, 10).map(p => ({
      title: (p.text || '').substring(0, 50),
      platforms: p.platforms || [p.platform],
      createdAt: p.createdAt,
      likes: p.analytics?.likes || p.likeCount || 0,
    }));

    return res.status(200).json({
      status: 'connected',
      counts: { today: today.length, thisWeek: thisWeek.length, thisMonth: thisMonth.length },
      byPlatform,
      recent,
    });
  } catch (error) {
    return res.status(200).json({ status: 'error', error: error.message });
  }
}

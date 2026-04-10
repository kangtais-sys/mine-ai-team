const ZERNIO = 'https://zernio.com/api/v1';
const zFetch = (path) => fetch(`${ZERNIO}${path}`, {
  headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` },
}).then(r => r.json());

// 계정별 Zernio username 매핑
const ACCOUNTS = {
  yuminhye: { tiktok: 'peerstory', youtube: '15초유민혜' },
  millimilli: { instagram: 'millimilli.official', tiktok: 'millimilli.official', youtube: 'millimilli.official' },
  ulsera: {}, // Zernio 미연결
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ZERNIO_API_KEY) return res.status(200).json({ status: 'disconnected', message: 'Zernio 연결 필요' });

  try {
    // Fetch accounts + posts
    const [accountsData, postsData] = await Promise.all([
      zFetch('/accounts'),
      zFetch('/posts?limit=50&sort=createdAt:desc'),
    ]);

    const accounts = accountsData.accounts || [];
    const posts = postsData.posts || postsData.data || [];

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // 날짜별 발행 집계 (캘린더용)
    const byDate = {};
    const thisMonthPosts = posts.filter(p => new Date(p.createdAt || p.publishedAt) >= monthStart);
    for (const p of thisMonthPosts) {
      const d = (p.createdAt || p.publishedAt || '').slice(0, 10);
      if (d) byDate[d] = (byDate[d] || 0) + 1;
    }

    const todayPosts = posts.filter(p => (p.createdAt || '').startsWith(todayStr));

    // 플랫폼별 발행
    const byPlatform = {};
    for (const p of thisMonthPosts) {
      const platforms = p.platforms || [p.platform || 'unknown'];
      for (const plat of platforms) {
        const name = typeof plat === 'string' ? plat : plat?.platform || 'unknown';
        byPlatform[name] = (byPlatform[name] || 0) + 1;
      }
    }

    // 계정별 팔로워
    const followers = {};
    for (const [profile, mapping] of Object.entries(ACCOUNTS)) {
      followers[profile] = {};
      for (const [plat, username] of Object.entries(mapping)) {
        const acc = accounts.find(a => a.username === username && a.platform === plat);
        followers[profile][plat] = acc?.metadata?.profileData?.followersCount || 0;
      }
    }

    // 최근 발행
    const recent = posts.slice(0, 8).map(p => ({
      title: (p.text || p.content || '').substring(0, 50),
      platforms: (p.platforms || [p.platform]).map(pl => typeof pl === 'string' ? pl : pl?.platform || 'unknown'),
      createdAt: p.createdAt,
      likes: p.analytics?.likes || p.likeCount || 0,
      comments: p.analytics?.comments || p.commentCount || 0,
    }));

    return res.status(200).json({
      status: 'connected',
      counts: { today: todayPosts.length, thisMonth: thisMonthPosts.length },
      byPlatform,
      byDate,
      followers,
      recent,
    });
  } catch (error) {
    return res.status(200).json({ status: 'error', error: error.message });
  }
}

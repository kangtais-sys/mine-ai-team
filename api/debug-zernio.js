const ZERNIO = 'https://zernio.com/api/v1';

export default async function handler(req, res) {
  if (!process.env.ZERNIO_API_KEY) return res.status(400).json({ error: 'no key' });
  const h = { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` };

  try {
    const [accsRes, postsRes] = await Promise.all([
      fetch(`${ZERNIO}/accounts`, { headers: h }),
      fetch(`${ZERNIO}/posts?limit=5`, { headers: h }),
    ]);

    const accs = await accsRes.json();
    const posts = await postsRes.json();

    // Show account fields for debugging
    const accountSummary = (accs.accounts || []).map(a => ({
      id: a.id,
      profileId: a.profileId,
      platform: a.platform,
      username: a.username,
      handle: a.handle,
      name: a.name,
      followers: a.metadata?.profileData?.followersCount || a.followersCount || 0,
    }));

    // Show post fields
    const postList = (posts.posts || posts.data || posts.items || []).slice(0, 3).map(p => ({
      id: p.id,
      profileId: p.profileId,
      accountId: p.accountId,
      platform: p.platform,
      commentsCount: p.commentsCount,
      comments: p.comments,
      metrics: p.metrics,
      engagement: p.engagement,
      publishedAt: p.publishedAt,
    }));

    return res.status(200).json({
      accountsStatus: accsRes.status,
      accountCount: accountSummary.length,
      accounts: accountSummary,
      postsStatus: postsRes.status,
      postKeys: Object.keys(posts),
      posts: postList,
      envVars: {
        ZERNIO_MILLIMILLI_PROFILE_ID: process.env.ZERNIO_MILLIMILLI_PROFILE_ID || 'NOT SET',
        ZERNIO_YUMINHYE_PROFILE_ID: process.env.ZERNIO_YUMINHYE_PROFILE_ID || 'NOT SET',
        ZERNIO_PROFILE_ID: process.env.ZERNIO_PROFILE_ID || 'NOT SET',
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

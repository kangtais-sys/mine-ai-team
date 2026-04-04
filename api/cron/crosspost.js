import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});
const ZERNIO = 'https://zernio.com/api/v1';
const zFetch = (path, opts = {}) => fetch(`${ZERNIO}${path}`, { ...opts, headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json', ...opts.headers } }).then(r => r.json());

export const config = { maxDuration: 120 };

// 트랙A: @millimilli.official 인스타 게시물 → 유튜브+틱톡 크로스포스팅
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const profileId = process.env.ZERNIO_MILLIMILLI_PROFILE_ID;
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Get recent posts from millimilli profile
    const postsData = await zFetch(`/posts?profileId=${profileId}&limit=10`);
    const posts = postsData.posts || postsData || [];

    // Check KV for already crossposted IDs
    const crosspostedKey = `crossposted:${today}`;
    const crossposted = await redis.get(crosspostedKey) || [];

    let count = 0;
    for (const post of (Array.isArray(posts) ? posts : [])) {
      const postId = post._id || post.id;
      if (!postId || crossposted.includes(postId)) continue;

      // Only crosspost Instagram posts that haven't been sent to YT/TT
      const platforms = post.platforms || [];
      const hasIG = platforms.includes('instagram');
      const hasYT = platforms.includes('youtube');
      const hasTT = platforms.includes('tiktok');

      if (hasIG && (!hasYT || !hasTT)) {
        const targetPlatforms = [];
        if (!hasYT) targetPlatforms.push('youtube');
        if (!hasTT) targetPlatforms.push('tiktok');

        await zFetch('/posts', {
          method: 'POST',
          body: JSON.stringify({
            profileId,
            text: post.text || post.caption || '',
            platforms: targetPlatforms,
            mediaUrl: post.mediaUrl || post.media?.[0]?.url,
          }),
        });

        crossposted.push(postId);
        count++;
      }
    }

    await redis.set(crosspostedKey, crossposted);

    const logKey = `publish-log:${today}`;
    const existing = await redis.get(logKey) || [];
    if (count > 0) {
      await redis.set(logKey, [...existing, { time: new Date().toISOString(), type: 'crosspost', count }]);
    }

    return res.status(200).json({ success: true, crossposted: count });
  } catch (error) {
    console.error('[Crosspost]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

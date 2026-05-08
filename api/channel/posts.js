import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function getToken() {
  return (await redis.get('instagram_access_token').catch(() => null)) || process.env.INSTAGRAM_ACCESS_TOKEN;
}

// Map account → IG Business Account User ID (set these in Vercel env)
function getIgUserId(account) {
  if (account === 'yuminhye') return process.env.IG_USER_ID_YUMINHYE || process.env.IG_USER_ID;
  if (account === 'millimilli') return process.env.IG_USER_ID_MILLIMILLI || process.env.IG_USER_ID;
  return process.env.IG_USER_ID;
}

// 토큰으로 IG 비즈니스 계정 ID 자동 탐색
async function discoverIgUserId(token, targetUsername) {
  try {
    // 1. Instagram Basic Display API: /me로 직접 ID 조회
    const meRes = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${token}`);
    const me = await meRes.json();
    if (me.id && !me.error) return me.id;

    // 2. Facebook Graph API: /me/accounts → 페이지 → IG 비즈니스 계정
    const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=instagram_business_account,name,username&access_token=${token}`);
    const pages = await pagesRes.json();
    if (pages.data) {
      for (const page of pages.data) {
        if (page.instagram_business_account?.id) return page.instagram_business_account.id;
      }
    }
  } catch {}
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { account = 'millimilli', refresh } = req.query;
  const cacheKey = `channel:posts:${account}`;

  // Serve cache unless refresh=1
  if (refresh !== '1') {
    const cached = await redis.get(cacheKey);
    if (cached) return res.status(200).json({ posts: cached, cached: true });
  }

  const token = await getToken();
  const userId = getIgUserId(account);

  if (!token || !userId) {
    const cached = await redis.get(cacheKey);
    return res.status(200).json({
      posts: cached || [],
      cached: true,
      warning: 'IG token or user ID not configured. Set IG_USER_ID / INSTAGRAM_ACCESS_TOKEN env vars.',
    });
  }

  try {
    const fields = 'id,caption,timestamp,like_count,comments_count,media_type,permalink';
    const url = `https://graph.instagram.com/v21.0/${userId}/media?fields=${fields}&limit=10&access_token=${token}`;
    const igRes = await fetch(url);
    const data = await igRes.json();

    if (data.error) throw new Error(data.error.message);

    const posts = (data.data || []).slice(0, 10);
    await redis.set(cacheKey, posts, { ex: 3600 }); // 1h cache
    return res.status(200).json({ posts, cached: false });
  } catch (e) {
    console.error('[Channel Posts]', e.message);
    const cached = await redis.get(cacheKey);
    return res.status(200).json({ posts: cached || [], cached: true, error: e.message });
  }
}

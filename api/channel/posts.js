import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ZERNIO = 'https://zernio.com/api/v1';

// Zernio 프로필 ID → 계정 매핑 (CLAUDE.md 기준)
const MILLIMILLI_IDS = new Set([
  '69fbfc1992b3d8e85f86d277', // millimilli.kr
  '69d08cc1986d57bb8f733102', // 원래 millimilli ID
]);
const MILLIMILLI_US_IDS = new Set([
  '69fbfd0692b3d8e85f86d882', // millimilli.us
]);
const YUMINHYE_IDS = new Set([
  '69fca4b192b3d8e85f8cfea6', // lala_lounge_
  '69d08807986d57bb8f72f7e6', // 원래 yuminhye ID
]);

function belongsToAccount(item, account) {
  const id = item.accountId || item.profileId || item.profile?._id || '';
  const username = (item.accountUsername || '').toLowerCase();
  if (account === 'millimilli_us') {
    return MILLIMILLI_US_IDS.has(id) || username === 'millimilli.us';
  }
  if (account === 'millimilli') {
    // .kr 만 (millimilli.us 는 별도 계정으로 제외)
    return (MILLIMILLI_IDS.has(id) || username.includes('millimilli')) && username !== 'millimilli.us' && !MILLIMILLI_US_IDS.has(id);
  }
  if (account === 'yuminhye') {
    return YUMINHYE_IDS.has(id)
      || ['lala_lounge_', 'yuminhye', 'peerstory'].includes(username);
  }
  return false;
}

// Zernio /inbox/comments → 게시물 목록 (commentCount, likeCount 포함)
async function fetchZernioPosts(account) {
  const key = process.env.ZERNIO_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(`${ZERNIO}/inbox/comments?limit=50`, {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    const items = Array.isArray(data?.data) ? data.data
      : Array.isArray(data?.items) ? data.items
      : Array.isArray(data) ? data : [];

    // 계정 필터링
    const filtered = items.filter(item => belongsToAccount(item, account));

    // Instagram Graph API 호환 구조로 변환
    return filtered.map(item => ({
      id: item.id || item._id,
      caption: item.content || '',
      comments_count: item.commentCount || 0,
      like_count: item.likeCount || 0,
      timestamp: item.createdAt || item.timestamp || null,
      media_type: 'IMAGE',
      source: 'zernio',
    }));
  } catch (e) {
    console.warn('[Channel Posts] Zernio fetch failed:', e.message);
    return null;
  }
}

// Instagram Graph API fallback (yuminhye 계정 등 직접 연결된 경우)
async function fetchIgPosts(account) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN
    || (await redis.get('instagram_access_token').catch(() => null));
  if (!token) return null;

  const userId = account === 'yuminhye'
    ? (process.env.IG_USER_ID_YUMINHYE || process.env.IG_USER_ID)
    : (process.env.IG_USER_ID_MILLIMILLI || process.env.IG_USER_ID);
  if (!userId) return null;

  try {
    const fields = 'id,caption,timestamp,like_count,comments_count,media_type,permalink';
    const url = `https://graph.facebook.com/v21.0/${userId}/media?fields=${fields}&limit=10&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return (data.data || []).slice(0, 10).map(p => ({ ...p, source: 'instagram' }));
  } catch (e) {
    console.warn('[Channel Posts] Instagram fetch failed:', e.message);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { account = 'millimilli', refresh } = req.query;
  const cacheKey = `channel:posts:${account}`;

  // 캐시 서빙 (refresh=1이면 스킵)
  if (refresh !== '1') {
    const cached = await redis.get(cacheKey);
    if (cached) return res.status(200).json({ posts: cached, cached: true });
  }

  // 1차: Zernio (밀리밀리 포함 모든 계정 지원)
  let posts = await fetchZernioPosts(account);

  // 2차: Instagram Graph API fallback
  if (!posts || posts.length === 0) {
    posts = await fetchIgPosts(account);
  }

  if (posts && posts.length > 0) {
    await redis.set(cacheKey, posts, { ex: 7200 }); // 2h cache
    return res.status(200).json({ posts, cached: false });
  }

  // 캐시 fallback
  const cached = await redis.get(cacheKey);
  return res.status(200).json({
    posts: cached || [],
    cached: !!cached,
    warning: 'Could not fetch fresh posts from Zernio or Instagram',
  });
}

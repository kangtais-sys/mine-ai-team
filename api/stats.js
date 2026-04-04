import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ZERNIO = 'https://zernio.com/api/v1';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1. KV에서 스크래핑된 유민혜 인스타 팔로워
    const igFollowers = await redis.get('followers:yuminhye:instagram');

    // 2. Zernio에서 연결 계정 팔로워
    let zAccounts = [];
    if (process.env.ZERNIO_API_KEY) {
      try {
        const zRes = await fetch(`${ZERNIO}/accounts`, {
          headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` },
        });
        const zData = await zRes.json();
        zAccounts = zData.accounts || [];
      } catch { /* Zernio unavailable */ }
    }

    // Parse Zernio accounts by profile
    const getFollowers = (username) => {
      const acc = zAccounts.find(a => a.username === username);
      return acc?.metadata?.profileData?.followersCount || 0;
    };

    const yuminhye = {
      instagram: {
        count: igFollowers?.count || 0,
        raw: igFollowers?.raw || '-',
        updatedAt: igFollowers?.updatedAt || null,
        source: 'scrape',
      },
      tiktok: { count: getFollowers('peerstory'), source: 'zernio' },
      youtube: { count: getFollowers('millimilli.official') || getFollowers('choi_jacob'), source: 'zernio' },
    };
    yuminhye.total = yuminhye.instagram.count + yuminhye.tiktok.count + yuminhye.youtube.count;

    const millimilli = {
      instagram: { count: getFollowers('millimilli.official'), source: 'zernio' },
      tiktok: { count: getFollowers('millimilli.official'), source: 'zernio' },
      youtube: { count: getFollowers('choi_jacob'), source: 'zernio' },
    };
    // Deduplicate: millimilli.official appears in both IG and TT
    const milliIG = zAccounts.find(a => a.username === 'millimilli.official' && a.platform === 'instagram');
    const milliTT = zAccounts.find(a => a.username === 'millimilli.official' && a.platform === 'tiktok');
    const milliYT = zAccounts.find(a => a.profileId?._id === process.env.ZERNIO_MILLIMILLI_PROFILE_ID && a.platform === 'youtube');
    millimilli.instagram.count = milliIG?.metadata?.profileData?.followersCount || 0;
    millimilli.tiktok.count = milliTT?.metadata?.profileData?.followersCount || 0;
    millimilli.youtube.count = milliYT?.metadata?.profileData?.followersCount || 0;
    millimilli.total = millimilli.instagram.count + millimilli.tiktok.count + millimilli.youtube.count;

    return res.status(200).json({ yuminhye, millimilli });
  } catch (error) {
    return res.status(200).json({
      yuminhye: { instagram: { count: 0 }, tiktok: { count: 0 }, youtube: { count: 0 }, total: 0 },
      millimilli: { instagram: { count: 0 }, tiktok: { count: 0 }, youtube: { count: 0 }, total: 0 },
      error: error.message,
    });
  }
}

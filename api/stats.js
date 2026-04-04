import { Redis } from '@upstash/redis';
import { readSheet } from './utils/sheets.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ZERNIO = 'https://zernio.com/api/v1';
const zFetch = (path) => fetch(`${ZERNIO}${path}`, {
  headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` },
}).then(r => r.json());

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // === A. Followers (Zernio API) ===
    let yuminhye = { instagram: { count: 0 }, tiktok: { count: 0 }, youtube: { count: 0 }, total: 0 };
    let millimilli = { instagram: { count: 0 }, tiktok: { count: 0 }, youtube: { count: 0 }, total: 0 };

    if (process.env.ZERNIO_API_KEY) {
      try {
        const zData = await zFetch('/accounts');
        const accounts = zData.accounts || [];
        const milliProfileId = process.env.ZERNIO_MILLIMILLI_PROFILE_ID;
        const yuProfileId = process.env.ZERNIO_YUMINHYE_PROFILE_ID;

        for (const acc of accounts) {
          const followers = acc.metadata?.profileData?.followersCount || 0;
          const profId = acc.profileId?._id || acc.profileId;
          const plat = acc.platform;

          if (profId === yuProfileId && plat === 'tiktok') yuminhye.tiktok = { count: followers, source: 'zernio' };
          if (profId === yuProfileId && plat === 'youtube') yuminhye.youtube = { count: followers, source: 'zernio' };
          if (profId === milliProfileId && plat === 'instagram') millimilli.instagram = { count: followers, source: 'zernio' };
          if (profId === milliProfileId && plat === 'tiktok') millimilli.tiktok = { count: followers, source: 'zernio' };
          if (profId === milliProfileId && plat === 'youtube') millimilli.youtube = { count: followers, source: 'zernio' };
        }

        // 유민혜 인스타 from scrape
        const igFollowers = await redis.get('followers:yuminhye:instagram');
        yuminhye.instagram = { count: igFollowers?.count || 0, source: 'scrape' };
      } catch { /* Zernio unavailable */ }
    }

    yuminhye.total = yuminhye.instagram.count + yuminhye.tiktok.count + yuminhye.youtube.count;
    millimilli.total = millimilli.instagram.count + millimilli.tiktok.count + millimilli.youtube.count;

    // === B. Content count (Zernio posts) ===
    let contentCount = 0;
    if (process.env.ZERNIO_API_KEY) {
      try {
        const postsData = await zFetch('/posts?limit=1');
        contentCount = postsData.total || postsData.pagination?.total || (postsData.posts || []).length || 0;
      } catch { /* skip */ }
    }

    // === C. Comment/DM stats (KV) ===
    const [commentTotal, dmTotal] = await Promise.all([
      redis.get('stat:comment:total'),
      redis.get('stat:dm:total'),
    ]);

    // === D. Olive Young revenue (Google Sheets) ===
    let oliveyoungRevenue = null;
    if (process.env.OLIVEYOUNG_SHEET_ID) {
      try {
        const rows = await readSheet(process.env.OLIVEYOUNG_SHEET_ID);
        oliveyoungRevenue = { status: 'connected', rows: rows.length - 1 };
      } catch (e) { oliveyoungRevenue = { status: 'error', error: e.message }; }
    }

    // === E. Follower growth (daily snapshots from KV) ===
    const followerHistory = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
      const snap = await redis.get(`followers:snapshot:${d}`);
      if (snap) followerHistory.push(typeof snap === 'string' ? JSON.parse(snap) : snap);
    }

    // Save today's snapshot if not exists
    const todayKey = `followers:snapshot:${now.toISOString().slice(0, 10)}`;
    const todaySnap = await redis.get(todayKey);
    if (!todaySnap) {
      await redis.set(todayKey, JSON.stringify({
        date: now.toISOString().slice(0, 10),
        yuminhye: yuminhye.total,
        millimilli: millimilli.total,
      }), { ex: 86400 * 30 });
    }

    // === F. Activity log (KV) ===
    const activityLog = await redis.lrange('activity:log', 0, 9);
    const parsedLog = (activityLog || []).map(l => typeof l === 'string' ? JSON.parse(l) : l);

    // === G. Channel connection status ===
    const connections = {
      zernio: { connected: !!process.env.ZERNIO_API_KEY, label: process.env.ZERNIO_API_KEY ? '🟢' : '🔴' },
      google: { connected: !!process.env.GOOGLE_REFRESH_TOKEN, label: process.env.GOOGLE_REFRESH_TOKEN ? '🟢' : '🔴' },
      anthropic: { connected: !!process.env.ANTHROPIC_API_KEY, label: process.env.ANTHROPIC_API_KEY ? '🟢' : '🔴' },
      instagram: { connected: !!process.env.INSTAGRAM_ACCESS_TOKEN, label: process.env.INSTAGRAM_ACCESS_TOKEN ? '🟢' : '🔴' },
      oliveyoung: { connected: !!process.env.OLIVEYOUNG_SHEET_ID, label: process.env.OLIVEYOUNG_SHEET_ID ? '🟢' : '🔴' },
      happytalk: { connected: !!process.env.HAPPYTALK_API_KEY, label: process.env.HAPPYTALK_API_KEY ? '🟢' : '🔴' },
      naverAds: { connected: !!process.env.NAVER_AD_API_KEY, label: process.env.NAVER_AD_API_KEY ? '🟢' : '🔴' },
      googleAds: { connected: !!process.env.GOOGLE_ADS_CUSTOMER_ID, label: process.env.GOOGLE_ADS_CUSTOMER_ID ? '🟢' : '🔴' },
      ga4: { connected: !!process.env.GA4_PROPERTY_ID, label: process.env.GA4_PROPERTY_ID ? '🟢' : '🔴' },
    };

    return res.status(200).json({
      yuminhye,
      millimilli,
      contentCount,
      engagement: { comments: Number(commentTotal) || 0, dm: Number(dmTotal) || 0 },
      oliveyoungRevenue,
      followerHistory,
      activityLog: parsedLog,
      connections,
    });
  } catch (error) {
    return res.status(200).json({ error: error.message });
  }
}

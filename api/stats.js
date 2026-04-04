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

// Username-based matching as fallback (no env var dependency)
const YUMINHYE_ACCOUNTS = {
  tiktok: 'peerstory',
  youtube: '15초유민혜',
};
const MILLIMILLI_ACCOUNTS = {
  instagram: 'millimilli.official',
  tiktok: 'millimilli.official',
  youtube: '유민혜-z2r',
};

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

        for (const acc of accounts) {
          const followers = acc.metadata?.profileData?.followersCount || 0;
          const plat = acc.platform;
          const username = acc.username;

          // Match by username (reliable, no env var needed)
          if (username === YUMINHYE_ACCOUNTS[plat]) {
            yuminhye[plat] = { count: followers, source: 'zernio', username };
          }
          if (username === MILLIMILLI_ACCOUNTS[plat]) {
            millimilli[plat] = { count: followers, source: 'zernio', username };
          }
        }

        // 유민혜 인스타 from scrape (not in Zernio)
        const igFollowers = await redis.get('followers:yuminhye:instagram');
        yuminhye.instagram = { count: igFollowers?.count || 0, source: 'scrape' };
      } catch (e) {
        console.error('[Stats] Zernio error:', e.message);
      }
    }

    yuminhye.total = (yuminhye.instagram?.count || 0) + (yuminhye.tiktok?.count || 0) + (yuminhye.youtube?.count || 0);
    millimilli.total = (millimilli.instagram?.count || 0) + (millimilli.tiktok?.count || 0) + (millimilli.youtube?.count || 0);

    // === B. Content count (Zernio posts) ===
    let contentCount = 0;
    if (process.env.ZERNIO_API_KEY) {
      try {
        const postsData = await zFetch('/posts?limit=1');
        contentCount = postsData.pagination?.total || postsData.total || 0;
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
      } catch (e) {
        const msg = e.message || '';
        if (msg.includes('has not been used') || msg.includes('not been enabled') || msg.includes('PERMISSION_DENIED')) {
          oliveyoungRevenue = { status: 'sheets_api_disabled', message: 'Google Sheets API 활성화 필요', url: 'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=998424366713' };
        } else {
          oliveyoungRevenue = { status: 'error', error: msg };
        }
      }
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
    if (!todaySnap && (yuminhye.total > 0 || millimilli.total > 0)) {
      await redis.set(todayKey, JSON.stringify({
        date: now.toISOString().slice(0, 10),
        yuminhye: yuminhye.total,
        millimilli: millimilli.total,
      }), { ex: 86400 * 30 });
    }

    // === F. Activity log (KV) ===
    const activityLog = await redis.lrange('activity:log', 0, 9);
    const parsedLog = (activityLog || []).map(l => { try { return typeof l === 'string' ? JSON.parse(l) : l; } catch { return l; } });

    // === G. Channel connection status ===
    const connections = {
      zernio: { connected: !!process.env.ZERNIO_API_KEY },
      google: { connected: !!process.env.GOOGLE_REFRESH_TOKEN },
      anthropic: { connected: !!process.env.ANTHROPIC_API_KEY },
      instagram: { connected: !!process.env.INSTAGRAM_ACCESS_TOKEN },
      oliveyoung: { connected: !!process.env.OLIVEYOUNG_SHEET_ID },
      happytalk: { connected: !!process.env.HAPPYTALK_API_KEY },
      naverAds: { connected: !!process.env.NAVER_AD_API_KEY },
      googleAds: { connected: !!process.env.GOOGLE_ADS_CUSTOMER_ID },
      ga4: { connected: !!process.env.GA4_PROPERTY_ID },
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

import { Redis } from '@upstash/redis';
import { readSheet } from './utils/sheets.js';
import { getEcommerceData } from './utils/ga4.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ZERNIO = 'https://zernio.com/api/v1';
const zFetch = (path) => fetch(`${ZERNIO}${path}`, {
  headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` },
}).then(r => r.json());

// Username-based matching (from Zernio API 2026-04-05 확인)
const YUMINHYE_ACCOUNTS = {
  tiktok: 'peerstory',
  youtube: '15초유민혜',
  // instagram: Zernio 미연결 → 스크래핑으로 대체
};
const MILLIMILLI_ACCOUNTS = {
  instagram: 'millimilli.official',
  tiktok: 'millimilli.official',
  youtube: 'millimilli.official', // Zernio에서 username=millimilli.official로 등록됨
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // === A. Followers (Zernio API) ===
    let yuminhye = { instagram: { count: 0 }, tiktok: { count: 0 }, youtube: { count: 0 }, total: 0 };
    let millimilli = { instagram: { count: 0 }, tiktok: { count: 0 }, youtube: { count: 0 }, total: 0 };

    if (process.env.ZERNIO_API_KEY) {
      try {
        const zRes = await fetch(`${ZERNIO}/accounts`, {
          headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` },
        });
        const zText = await zRes.text();
        console.log(`[Stats] Zernio /accounts status=${zRes.status} len=${zText.length}`);
        const zData = JSON.parse(zText);
        const accounts = zData.accounts || [];
        console.log(`[Stats] Zernio accounts: ${accounts.length}`);

        for (const acc of accounts) {
          const followers = acc.metadata?.profileData?.followersCount || 0;
          const plat = acc.platform;
          const username = acc.username;
          console.log(`[Stats] account: ${plat} ${username} followers=${followers}`);

          // Match by username (reliable, no env var needed)
          if (username === YUMINHYE_ACCOUNTS[plat]) {
            yuminhye[plat] = { count: followers, source: 'zernio', username };
          }
          if (username === MILLIMILLI_ACCOUNTS[plat]) {
            millimilli[plat] = { count: followers, source: 'zernio', username };
          }
        }

        // 유민혜 인스타: Zernio 미연결 → KV or fallback 31만
        const igFollowers = await redis.get('followers:yuminhye:instagram');
        const igCount = igFollowers?.count || 310000; // fallback: 31만
        yuminhye.instagram = {
          count: igCount,
          source: igFollowers?.count > 0 ? 'scrape' : 'manual',
          username: igFollowers?.username || 'lala_lounge_',
        };
      } catch (e) {
        console.error('[Stats] Zernio error:', e.message, e.stack);
      }
    } else {
      console.log('[Stats] ZERNIO_API_KEY not set');
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
    // 시트 구조: [빈열, 기준일, 기간계상품코드, 상품코드, 상품명, 올리브영 매출, 판매수량, 홍천 납품 기준 매출]
    let oliveyoungRevenue = null;
    if (process.env.OLIVEYOUNG_SHEET_ID) {
      try {
        const rows = await readSheet(process.env.OLIVEYOUNG_SHEET_ID);
        const dataRows = rows.slice(1); // 헤더 제외
        const totalSales = dataRows.reduce((s, r) => s + (Number((r[5] || '0').replace(/,/g, '')) || 0), 0);
        const totalQty = dataRows.reduce((s, r) => s + (Number(r[6]) || 0), 0);
        const totalShipment = dataRows.reduce((s, r) => s + (Number((r[7] || '0').replace(/,/g, '')) || 0), 0);

        // 날짜별 집계
        const byDate = {};
        for (const r of dataRows) {
          const date = r[1] || '';
          if (!byDate[date]) byDate[date] = { sales: 0, qty: 0 };
          byDate[date].sales += Number((r[5] || '0').replace(/,/g, '')) || 0;
          byDate[date].qty += Number(r[6]) || 0;
        }

        oliveyoungRevenue = {
          status: 'connected',
          totalRows: dataRows.length,
          totalSales,
          totalQty,
          totalShipment,
          byDate,
        };
      } catch (e) {
        const msg = e.message || '';
        if (msg.includes('has not been used') || msg.includes('not been enabled') || msg.includes('PERMISSION_DENIED')) {
          oliveyoungRevenue = { status: 'sheets_api_disabled', message: 'Google Sheets API 활성화 필요' };
        } else {
          oliveyoungRevenue = { status: 'error', error: msg };
        }
      }
    }

    // === E. GA4 자사몰 매출 ===
    let ga4Revenue = null;
    if (process.env.GA4_PROPERTY_ID) {
      try {
        ga4Revenue = { status: 'connected', ...(await getEcommerceData(process.env.GA4_PROPERTY_ID)) };
      } catch (e) { ga4Revenue = { status: 'error', error: e.message }; }
    }

    // === F. Follower growth (daily snapshots from KV) ===
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

    // === Total Revenue (all channels) ===
    const channelSales = {
      oliveyoung: oliveyoungRevenue?.totalSales || 0,
      ga4: ga4Revenue?.revenue || 0,
      smartstore: 0, // 연동 전
      export: 0, // 수출 시트에서 별도 계산 필요
    };
    const totalRevenue = channelSales.oliveyoung + channelSales.ga4 + channelSales.smartstore + channelSales.export;

    return res.status(200).json({
      yuminhye,
      millimilli,
      contentCount,
      engagement: { comments: Number(commentTotal) || 0, dm: Number(dmTotal) || 0 },
      oliveyoungRevenue,
      ga4Revenue,
      totalRevenue,
      channelSales,
      followerHistory,
      activityLog: parsedLog,
      connections,
    });
  } catch (error) {
    return res.status(200).json({ error: error.message });
  }
}

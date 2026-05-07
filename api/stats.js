import { Redis } from '@upstash/redis';
import { readPublicSheet } from './utils/sheets.js';
import { getEcommerceData } from './utils/ga4.js';

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
        const zRes = await fetch(`${ZERNIO}/accounts`, {
          headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` },
        });
        const zText = await zRes.text();
        console.log(`[Stats] Zernio /accounts status=${zRes.status} len=${zText.length}`);
        const zData = JSON.parse(zText);
        const accounts = zData.accounts || [];
        console.log(`[Stats] Zernio accounts: ${accounts.length}`);

        const ymId = (process.env.ZERNIO_YUMINHYE_PROFILE_ID || '').trim();
        const mmId = (process.env.ZERNIO_MILLIMILLI_PROFILE_ID || '').trim();

        for (const acc of accounts) {
          const followers = acc.metadata?.profileData?.followersCount || 0;
          const plat = acc.platform;
          const username = acc.username;
          const pid = acc.profileId?._id || '';
          console.log(`[Stats] account: ${plat} ${username} profileId=${pid} followers=${followers}`);

          if (ymId && pid === ymId) {
            yuminhye[plat] = { count: followers, source: 'zernio', username };
          } else if (mmId && pid === mmId) {
            millimilli[plat] = { count: followers, source: 'zernio', username };
          }
        }

        // 유민혜 인스타: Zernio에서 못 가져왔으면 KV or fallback
        if (!yuminhye.instagram?.count) {
          const igFollowers = await redis.get('followers:yuminhye:instagram');
          const igCount = igFollowers?.count || 310000;
          yuminhye.instagram = {
            count: igCount,
            source: igFollowers?.count > 0 ? 'scrape' : 'manual',
            username: igFollowers?.username || 'lala_lounge_',
          };
        }
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

    // === D. Olive Young revenue (공개 Google Sheet — CSV export, no OAuth) ===
    // 시트: 스킨케어파트 gid=352972103 [A:날짜(YYYYMMDD), D:상품명, E:올리브영매출(₩), F:판매량, G:납품가매출(₩)]
    const parseWon = (v) => Number((v || '0').replace(/[₩,\s]/g, '')) || 0;
    let oliveyoungRevenue = null;
    if (process.env.OLIVEYOUNG_SHEET_ID) {
      try {
        const rows = await readPublicSheet(process.env.OLIVEYOUNG_SHEET_ID, 352972103);
        const dataRows = rows.slice(1);
        const totalSales = dataRows.reduce((s, r) => s + parseWon(r[4]), 0);
        const totalQty = dataRows.reduce((s, r) => s + (Number(r[5]) || 0), 0);
        const totalShipment = dataRows.reduce((s, r) => s + parseWon(r[6]), 0);

        // 날짜별 집계
        const byDate = {};
        for (const r of dataRows) {
          const date = r[0] || '';
          if (!byDate[date]) byDate[date] = { sales: 0, qty: 0 };
          byDate[date].sales += parseWon(r[4]);
          byDate[date].qty += Number(r[5]) || 0;
        }

        // 월별 집계 (YYYYMMDD → YYYY-MM)
        const byMonth = {};
        for (const r of dataRows) {
          const date = r[0] || '';
          if (date.length >= 6) {
            const monthKey = `${date.slice(0, 4)}-${date.slice(4, 6)}`;
            byMonth[monthKey] = (byMonth[monthKey] || 0) + parseWon(r[4]);
          }
        }

        // 당월/연간 분리
        const nowMonth = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const nowYear = String(new Date().getFullYear());
        const currentMonthSales = dataRows.filter(r => (r[0] || '').startsWith(nowMonth)).reduce((s, r) => s + parseWon(r[4]), 0);
        const yearlySales = dataRows.filter(r => (r[0] || '').startsWith(nowYear)).reduce((s, r) => s + parseWon(r[4]), 0);

        oliveyoungRevenue = {
          status: 'connected',
          totalRows: dataRows.length,
          totalSales,
          currentMonthSales,
          yearlySales,
          totalQty,
          totalShipment,
          byDate,
          byMonth,
        };
      } catch (e) {
        oliveyoungRevenue = { status: 'error', error: e.message };
      }
    }

    // === D2. Export/Amazon revenue (공개 Google Sheet) ===
    let exportRevenue = null;
    if (process.env.EXPORT_SHEET_ID) {
      try {
        const rows = await readPublicSheet(process.env.EXPORT_SHEET_ID);
        const dataRows = rows.slice(1).filter(r => r.some(c => c));
        // Try to find date/amount columns (flexible — unknown structure)
        const nowYear = String(new Date().getFullYear());
        const nowMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        // Scan for numeric amounts in each row, date in col 0
        let yearlyTotal = 0, monthlyTotal = 0;
        const byMonth = {};
        for (const r of dataRows) {
          const dateStr = (r[0] || '').toString().replace(/\//g, '-');
          const isThisYear = dateStr.startsWith(nowYear);
          const isThisMonth = dateStr.startsWith(nowMonth) || dateStr.replace('-', '').startsWith(nowMonth.replace('-', ''));
          // Find largest numeric value in row as amount
          let maxVal = 0;
          for (let ci = 1; ci < r.length; ci++) {
            const v = Number((r[ci] || '').toString().replace(/[,$₩\s]/g, ''));
            if (v > maxVal) maxVal = v;
          }
          if (maxVal > 0 && isThisYear) {
            yearlyTotal += maxVal;
            const mk = dateStr.slice(0, 7);
            byMonth[mk] = (byMonth[mk] || 0) + maxVal;
          }
          if (maxVal > 0 && isThisMonth) monthlyTotal += maxVal;
        }
        exportRevenue = {
          status: 'connected',
          rows: dataRows.length,
          yearlyTotal,
          monthlyTotal,
          byMonth,
        };
      } catch (e) {
        exportRevenue = { status: 'error', error: e.message };
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
      naverAds: { connected: !!process.env.NAVER_AD_API_KEY },
      googleAds: { connected: !!process.env.GOOGLE_ADS_CUSTOMER_ID },
      ga4: { connected: !!process.env.GA4_PROPERTY_ID },
    };

    // === H. Naver + Cafe24 from Redis (Mac cron / Vercel cache) ===
    const [naverDaily, cafe24Daily, chiefReport] = await Promise.all([
      redis.get('sales:naver:daily'),
      redis.get('sales:cafe24:daily'),
      redis.get('chief:daily-report'),
    ]);
    const nowMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const naverMonthly = naverDaily?.monthly || {};
    const cafe24Monthly = cafe24Daily?.monthly || {};
    const naverMonthSales = naverMonthly[nowMonthKey]?.revenue || 0;
    const cafe24MonthSales = cafe24Monthly[nowMonthKey]?.revenue || 0;
    const naverYearly = Object.values(naverMonthly).reduce((s, m) => s + (m.revenue || 0), 0);
    const cafe24Yearly = Object.values(cafe24Monthly).reduce((s, m) => s + (m.revenue || 0), 0);

    // === Total Revenue (all channels) — monthly + yearly ===
    const channelSales = {
      oliveyoung: oliveyoungRevenue?.currentMonthSales || 0,
      ga4: ga4Revenue?.month?.revenue || ga4Revenue?.revenue || 0,
      smartstore: naverMonthSales,
      cafe24: cafe24MonthSales,
      amazon: exportRevenue?.monthlyTotal || 0,
    };
    const channelSalesYearly = {
      oliveyoung: oliveyoungRevenue?.yearlySales || 0,
      ga4: ga4Revenue?.year?.revenue || ga4Revenue?.revenue || 0,
      smartstore: naverYearly,
      cafe24: cafe24Yearly,
      amazon: exportRevenue?.yearlyTotal || 0,
    };
    const totalRevenue = Object.values(channelSales).reduce((s, v) => s + v, 0);
    const totalRevenueYearly = Object.values(channelSalesYearly).reduce((s, v) => s + v, 0);

    // Monthly revenue array for chart (Jan-current month 2026) — per channel
    const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    const monthlyRevenue = monthNames.map((name, i) => {
      const key = `2026-${String(i + 1).padStart(2, '0')}`;
      const oy = oliveyoungRevenue?.byMonth?.[key] || 0;
      const ss = naverMonthly[key]?.revenue || 0;
      const c24 = cafe24Monthly[key]?.revenue || 0;
      return { month: name, oliveyoung: oy, smartstore: ss, cafe24: c24, total: oy + ss + c24 };
    }).filter((_, i) => i < new Date().getMonth() + 1);

    // Parse chiefReport if string
    const chiefData = typeof chiefReport === 'string' ? JSON.parse(chiefReport) : chiefReport;

    return res.status(200).json({
      yuminhye,
      millimilli,
      contentCount,
      engagement: { comments: Number(commentTotal) || 0, dm: Number(dmTotal) || 0 },
      oliveyoungRevenue,
      exportRevenue,
      ga4Revenue,
      totalRevenue,
      totalRevenueYearly,
      channelSales,
      channelSalesYearly,
      monthlyRevenue,
      followerHistory,
      activityLog: parsedLog,
      connections,
      chiefReport: chiefData,
    });
  } catch (error) {
    return res.status(200).json({ error: error.message });
  }
}

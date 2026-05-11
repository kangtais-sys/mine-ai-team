import { Redis } from '@upstash/redis';
import { readSheet } from '../utils/sheets.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const AD_ACCOUNTS = [
  { name: '밀리밀리_인하우스', id: '2327868604313508' },
  { name: '밀리밀리_한국', id: '791241442793311' },
  { name: '밀리밀리_한국_올리브영', id: '623851980786807' },
];

const PERIODS = [
  { key: 'yesterday', preset: 'yesterday' },
  { key: 'thisMonth', preset: 'this_month' },
  { key: 'thisYear', preset: 'this_year' },
];

const AGENCIES = [
  { key: 'inhouse', name: '인하우스', envKey: 'AGENCY_SHEET_INHOUSE' },
  { key: 'growth', name: '그로스미디어', envKey: 'AGENCY_SHEET_GROWTH' },
  { key: 'en', name: '이엔미디어', envKey: 'AGENCY_SHEET_EN' },
  { key: 'epro', name: '이프로애드', envKey: 'AGENCY_SHEET_EPRO' },
];

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = { meta: null, agencies: {}, naver: null, google: null, tiktok: null, ga: null, totalSpend: 0, suggestions: null };

  // === Meta Ads ===
  const token = process.env.META_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN;
  if (token) {
    try {
      const fields = 'spend,impressions,clicks,cpc,ctr,actions,action_values';
      const accounts = await Promise.all(AD_ACCOUNTS.map(async (acc) => {
        try {
          // 3개 기간 병렬 요청: 전일 / 월간 / 연간
          const periodData = await Promise.all(PERIODS.map(async ({ key, preset }) => {
            try {
              const url = `https://graph.facebook.com/v19.0/act_${acc.id}/insights?fields=${fields}&date_preset=${preset}&access_token=${token}`;
              const r = await fetch(url);
              const d = await r.json();
              if (d.error) return { key, spend: 0, revenue: 0, roas: '-', error: d.error.message };
              const insight = d.data?.[0] || {};
              const spend = Number(insight.spend) || 0;
              const revenue = (insight.action_values || [])
                .filter(a => a.action_type === 'purchase')
                .reduce((s, a) => s + Number(a.value), 0);
              return { key, spend, revenue, roas: spend > 0 ? (revenue / spend).toFixed(2) : '-' };
            } catch (e) { return { key, spend: 0, revenue: 0, roas: '-', error: e.message }; }
          }));
          const byPeriod = Object.fromEntries(periodData.map(p => [p.key, p]));
          return { name: acc.name, ...byPeriod };
        } catch (e) { return { name: acc.name, error: e.message || 'API error' }; }
      }));
      const totalSpendMonth = accounts.reduce((s, a) => s + (a.thisMonth?.spend || 0), 0);
      const totalRevenueMonth = accounts.reduce((s, a) => s + (a.thisMonth?.revenue || 0), 0);
      const totalSpendYesterday = accounts.reduce((s, a) => s + (a.yesterday?.spend || 0), 0);
      const totalRevenueYesterday = accounts.reduce((s, a) => s + (a.yesterday?.revenue || 0), 0);
      const totalSpendYear = accounts.reduce((s, a) => s + (a.thisYear?.spend || 0), 0);
      const totalRevenueYear = accounts.reduce((s, a) => s + (a.thisYear?.revenue || 0), 0);
      const successAccounts = accounts.filter(a => !a.error);
      const status = successAccounts.length > 0 ? 'connected' : 'disconnected';
      const errorMsg = successAccounts.length === 0 ? accounts[0]?.error : null;
      result.meta = {
        status,
        totalSpend: totalSpendMonth, // 하위호환
        totalSpendMonth, totalRevenueMonth,
        totalSpendYesterday, totalRevenueYesterday,
        totalSpendYear, totalRevenueYear,
        accounts,
        ...(errorMsg ? { message: errorMsg } : {}),
      };
      result.totalSpend += totalSpendMonth;
      // Redis에 캐시 저장 (daily-report cron이 HTTP 호출 없이 읽을 수 있도록)
      try {
        await redis.set('marketer:meta:cache', JSON.stringify(result.meta), { ex: 3600 });
      } catch {}
    } catch (e) { result.meta = { status: 'error', error: e.message }; }
  } else {
    result.meta = { status: 'disconnected', message: 'META_ACCESS_TOKEN 또는 INSTAGRAM_ACCESS_TOKEN 필요' };
  }

  // === Agency sheets ===
  for (const agency of AGENCIES) {
    const sheetId = process.env[agency.envKey];
    if (sheetId) {
      try {
        const rows = await readSheet(sheetId);
        const data = rows.slice(1);
        result.agencies[agency.key] = { status: 'connected', name: agency.name, rows: data.length };
      } catch (e) { result.agencies[agency.key] = { status: 'error', name: agency.name, error: e.message }; }
    } else {
      result.agencies[agency.key] = { status: 'disconnected', name: agency.name };
    }
  }

  // === Other channels ===
  result.naver = process.env.NAVER_AD_API_KEY ? { status: 'connected' } : { status: 'disconnected' };
  result.google = process.env.GOOGLE_ADS_CUSTOMER_ID ? { status: 'connected' } : { status: 'disconnected' };
  result.tiktok = process.env.TIKTOK_AD_ACCESS_TOKEN ? { status: 'connected' } : { status: 'disconnected' };
  result.ga = process.env.GA4_PROPERTY_ID ? { status: 'connected' } : { status: 'disconnected' };

  // === Optimization suggestions (from KV) ===
  try {
    const cached = await redis.get('marketer:suggestions');
    result.suggestions = cached ? (typeof cached === 'string' ? JSON.parse(cached) : cached) : null;
  } catch {}

  return res.status(200).json(result);
}

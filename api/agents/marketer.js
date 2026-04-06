import { Redis } from '@upstash/redis';
import { readSheet } from '../utils/sheets.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const AD_ACCOUNTS = [
  { name: '랄라라운지_한국', id: '855116430496295' },
  { name: '밀리밀리_인하우스', id: '2327868604313508' },
  { name: '밀리밀리_한국', id: '791241442793311' },
  { name: '밀리밀리_한국_올리브영', id: '623851980786807' },
  { name: '엠마워시_오피셜', id: '864303894888410' },
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
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (token) {
    try {
      const accounts = await Promise.all(AD_ACCOUNTS.map(async (acc) => {
        try {
          const url = `https://graph.facebook.com/v19.0/act_${acc.id}/insights?fields=spend,impressions,clicks,cpc,ctr,actions&date_preset=last_7d&access_token=${token}`;
          const r = await fetch(url);
          const d = await r.json();
          const insight = d.data?.[0] || {};
          const spend = Number(insight.spend) || 0;
          const purchases = (insight.actions || []).filter(a => a.action_type === 'purchase').reduce((s, a) => s + Number(a.value), 0);
          return { name: acc.name, spend, impressions: Number(insight.impressions) || 0, clicks: Number(insight.clicks) || 0, ctr: Number(insight.ctr) || 0, roas: spend > 0 ? (purchases / spend).toFixed(2) : '-' };
        } catch { return { name: acc.name, error: 'API error' }; }
      }));
      const totalSpend = accounts.reduce((s, a) => s + (a.spend || 0), 0);
      result.meta = { status: 'connected', totalSpend, accounts };
      result.totalSpend += totalSpend;
    } catch (e) { result.meta = { status: 'error', error: e.message }; }
  } else {
    result.meta = { status: 'disconnected', message: 'Meta token required' };
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

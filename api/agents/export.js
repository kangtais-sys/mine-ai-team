import { readSheet } from '../utils/sheets.js';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = { exports: null, byCountry: null, prices: null, exchangeRates: null, buyerPipeline: null, dailyReport: null, channels: {} };

  // A. Export status + country breakdown
  if (process.env.EXPORT_SHEET_ID) {
    try {
      const rows = await readSheet(process.env.EXPORT_SHEET_ID);
      const headers = rows[0] || [];
      const data = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      });

      // Country aggregation
      const countryMap = {};
      let totalAmount = 0;
      for (const row of data) {
        const country = row['국가'] || row['Country'] || row['country'] || '기타';
        const amount = Number((row['금액'] || row['매출'] || row['Amount'] || '0').replace(/[^0-9.-]/g, '')) || 0;
        if (!countryMap[country]) countryMap[country] = { amount: 0, products: 0 };
        countryMap[country].amount += amount;
        countryMap[country].products++;
        totalAmount += amount;
      }

      const byCountry = Object.entries(countryMap)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.amount - a.amount);

      result.exports = { status: 'connected', totalOrders: data.length, totalAmount };
      result.byCountry = byCountry;
    } catch (e) { result.exports = { status: 'error', error: e.message }; }
  } else {
    result.exports = { status: 'disconnected', message: '수출현황 시트 연결 필요' };
  }

  // Export prices
  if (process.env.EXPORT_PRICE_SHEET_ID) {
    try {
      const rows = await readSheet(process.env.EXPORT_PRICE_SHEET_ID);
      result.prices = { status: 'connected', products: rows.length - 1 };
    } catch (e) { result.prices = { status: 'error', error: e.message }; }
  }

  // B. Exchange rates (cached 1hr)
  try {
    let rates = await redis.get('exchange:rates');
    if (!rates) {
      const r = await fetch('https://api.exchangerate-api.com/v4/latest/KRW');
      const data = await r.json();
      rates = {};
      for (const [k, v] of Object.entries({ USD: data.rates?.USD, JPY: data.rates?.JPY, SGD: data.rates?.SGD, CNY: data.rates?.CNY, EUR: data.rates?.EUR })) {
        rates[k] = v ? Math.round(1 / v) : null;
      }
      rates.updatedAt = new Date().toISOString();
      await redis.set('exchange:rates', JSON.stringify(rates), { ex: 3600 });
    } else {
      rates = typeof rates === 'string' ? JSON.parse(rates) : rates;
    }
    result.exchangeRates = rates;
  } catch {}

  // C. Buyer pipeline (from KV or defaults)
  try {
    const cached = await redis.get('export:buyer-pipeline');
    result.buyerPipeline = cached ? (typeof cached === 'string' ? JSON.parse(cached) : cached)
      : { db: 0, firstMail: 0, replied: 0, sample: 0, proposal: 0, contract: 0 };
  } catch {}

  // D. Daily report (from KV)
  try {
    const cached = await redis.get('export:daily-report');
    result.dailyReport = cached ? (typeof cached === 'string' ? JSON.parse(cached) : cached) : null;
  } catch {}

  // E. Overseas channels
  result.channels.amazon = process.env.AMAZON_SELLER_ID ? { status: 'connected' } : { status: 'disconnected' };
  result.channels.shopee = process.env.SHOPEE_SHOP_ID ? { status: 'connected' } : { status: 'disconnected' };
  result.channels.qoo10 = process.env.QOO10_API_KEY ? { status: 'connected' } : { status: 'disconnected' };
  result.channels.tiktokShop = process.env.TIKTOK_SHOP_ACCESS_TOKEN ? { status: 'connected' } : { status: 'disconnected' };
  result.channels.naverWorks = process.env.WORKS_API_KEY ? { status: 'connected' } : { status: 'disconnected' };

  return res.status(200).json(result);
}

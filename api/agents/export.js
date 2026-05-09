import { readPublicSheet } from '../utils/sheets.js';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // B2B 수출 중심 구조
  const result = {
    exports: null,        // 수출시트 총합
    byCountry: null,      // 국가별 매출
    byBuyer: null,        // 바이어별 매출
    buyerPipeline: null,  // 바이어 파이프라인
    exchangeRates: null,  // 환율
    dailyReport: null,    // 일일 보고 (KV cron)
    b2bContacts: null,    // 바이어 컨택 현황 (KV)
  };

  // A. 수출시트 — 바이어별/국가별 집계
  if (process.env.EXPORT_SHEET_ID) {
    try {
      // 공개 시트 — OAuth 불필요 (첫 번째 탭)
      const rows = await readPublicSheet(process.env.EXPORT_SHEET_ID);
      const headers = rows[0] || [];
      const data = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      });

      // 국가별 집계
      const countryMap = {};
      // 바이어별 집계
      const buyerMap = {};
      let totalAmount = 0;

      for (const row of data) {
        const country = row['국가'] || row['Country'] || row['country'] || '기타';
        const buyer = row['바이어'] || row['Buyer'] || row['buyer'] || row['업체명'] || '미상';
        const product = row['품목'] || row['상품'] || row['Product'] || '';
        const qty = Number((row['수량'] || row['Qty'] || '0').replace(/[^0-9]/g, '')) || 0;
        const raw = row['금액'] || row['매출'] || row['Amount'] || row['수출금액'] || '0';
        const amount = Number(raw.replace(/[^0-9.-]/g, '')) || 0;

        if (!countryMap[country]) countryMap[country] = { amount: 0, orders: 0 };
        countryMap[country].amount += amount;
        countryMap[country].orders++;

        if (!buyerMap[buyer]) buyerMap[buyer] = { amount: 0, qty: 0, products: [], country };
        buyerMap[buyer].amount += amount;
        buyerMap[buyer].qty += qty;
        if (product && !buyerMap[buyer].products.includes(product)) buyerMap[buyer].products.push(product);

        totalAmount += amount;
      }

      const byCountry = Object.entries(countryMap)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.amount - a.amount);

      const byBuyer = Object.entries(buyerMap)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.amount - a.amount);

      result.exports = { status: 'connected', totalOrders: data.length, totalAmount };
      result.byCountry = byCountry;
      result.byBuyer = byBuyer;
    } catch (e) { result.exports = { status: 'error', error: e.message }; }
  } else {
    result.exports = { status: 'disconnected', message: '수출현황 시트 연결 필요 (EXPORT_SHEET_ID)' };
  }

  // B. 환율 (1시간 캐시)
  try {
    let rates = await redis.get('exchange:rates');
    if (!rates) {
      const r = await fetch('https://api.exchangerate-api.com/v4/latest/KRW');
      const data = await r.json();
      rates = {};
      for (const [k, v] of Object.entries({ USD: data.rates?.USD, JPY: data.rates?.JPY, SGD: data.rates?.SGD, CNY: data.rates?.CNY, EUR: data.rates?.EUR, AED: data.rates?.AED })) {
        rates[k] = v ? Math.round(1 / v) : null;
      }
      rates.updatedAt = new Date().toISOString();
      await redis.set('exchange:rates', JSON.stringify(rates), { ex: 3600 });
    } else {
      rates = typeof rates === 'string' ? JSON.parse(rates) : rates;
    }
    result.exchangeRates = rates;
  } catch {}

  // C. 바이어 파이프라인 (KV — 크론/수동 업데이트)
  try {
    const cached = await redis.get('export:buyer-pipeline');
    result.buyerPipeline = cached
      ? (typeof cached === 'string' ? JSON.parse(cached) : cached)
      : { db: 0, firstMail: 0, replied: 0, sample: 0, proposal: 0, contract: 0 };
  } catch {}

  // D. 바이어 컨택 현황 (KV)
  try {
    const cached = await redis.get('export:b2b-contacts');
    result.b2bContacts = cached ? (typeof cached === 'string' ? JSON.parse(cached) : cached) : null;
  } catch {}

  // E. 일일 보고 (KV — 오전 8시 크론)
  try {
    const cached = await redis.get('export:daily-report');
    result.dailyReport = cached ? (typeof cached === 'string' ? JSON.parse(cached) : cached) : null;
  } catch {}

  return res.status(200).json(result);
}

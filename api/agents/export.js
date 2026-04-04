import { readSheet } from '../utils/sheets.js';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = { exports: null, prices: null, exchangeRates: null, channels: {} };

  // A. Export status (Google Sheets)
  if (process.env.EXPORT_SHEET_ID) {
    try {
      const rows = await readSheet(process.env.EXPORT_SHEET_ID);
      const headers = rows[0] || [];
      const data = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      });
      result.exports = { status: 'connected', totalOrders: data.length, data: data.slice(-20) };
    } catch (e) { result.exports = { status: 'error', error: e.message }; }
  } else {
    result.exports = { status: 'disconnected', message: '수출현황 시트 연결 필요' };
  }

  // Export prices
  if (process.env.EXPORT_PRICE_SHEET_ID) {
    try {
      const rows = await readSheet(process.env.EXPORT_PRICE_SHEET_ID);
      const headers = rows[0] || [];
      const data = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      });
      result.prices = { status: 'connected', products: data.length, data };
    } catch (e) { result.prices = { status: 'error', error: e.message }; }
  } else {
    result.prices = { status: 'disconnected', message: '수출공급가 시트 ��결 필요' };
  }

  // B. Exchange rates (cached 1hr)
  try {
    let rates = await redis.get('exchange:rates');
    if (!rates) {
      const r = await fetch('https://api.exchangerate-api.com/v4/latest/KRW');
      const data = await r.json();
      const selected = { USD: data.rates?.USD, JPY: data.rates?.JPY, SGD: data.rates?.SGD, CNY: data.rates?.CNY, EUR: data.rates?.EUR };
      rates = {};
      for (const [k, v] of Object.entries(selected)) {
        rates[k] = v ? Math.round(1 / v) : null;
      }
      rates.updatedAt = new Date().toISOString();
      await redis.set('exchange:rates', JSON.stringify(rates), { ex: 3600 });
    } else {
      rates = typeof rates === 'string' ? JSON.parse(rates) : rates;
    }
    result.exchangeRates = rates;
  } catch (e) { result.exchangeRates = { error: e.message }; }

  // C. Overseas channels
  result.channels.amazon = process.env.AMAZON_SELLER_ID ? { status: 'connected' } : { status: 'disconnected', message: '아마존 연결 필요' };
  result.channels.shopee = process.env.SHOPEE_SHOP_ID ? { status: 'connected' } : { status: 'disconnected', message: '쇼피 연결 필요' };
  result.channels.qoo10 = process.env.QOO10_API_KEY ? { status: 'connected' } : { status: 'disconnected', message: '큐텐 연결 필요' };
  result.channels.tiktokShop = process.env.TIKTOK_SHOP_ACCESS_TOKEN ? { status: 'connected' } : { status: 'disconnected', message: '���톡샵 연결 필요' };

  return res.status(200).json(result);
}

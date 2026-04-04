import { readSheet } from '../utils/sheets.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = { oliveyoung: null, smartstore: null, cafe24: null, amazon: null, shopee: null, qoo10: null, tiktokShop: null };

  // A. Olive Young (Google Sheets)
  if (process.env.OLIVEYOUNG_SHEET_ID) {
    try {
      const rows = await readSheet(process.env.OLIVEYOUNG_SHEET_ID);
      const headers = rows[0] || [];
      const data = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      });
      result.oliveyoung = { status: 'connected', rowCount: data.length, data: data.slice(-10) };
    } catch (e) { result.oliveyoung = { status: 'error', error: e.message }; }
  } else {
    result.oliveyoung = { status: 'disconnected', message: '올리브영 시트 연결 필요' };
  }

  // B-G. Channel connection status
  result.smartstore = process.env.NAVER_COMMERCE_CLIENT_ID && process.env.NAVER_COMMERCE_CLIENT_SECRET
    ? { status: 'connected', message: '스마트스토어 연결됨' }
    : { status: 'disconnected', message: '스마트���토어 연결 필요' };

  result.cafe24 = process.env.CAFE24_CLIENT_ID && process.env.CAFE24_CLIENT_SECRET && process.env.CAFE24_MALL_ID
    ? { status: 'connected', mallId: process.env.CAFE24_MALL_ID }
    : { status: 'disconnected', message: '카페24 연결 필요' };

  result.amazon = process.env.AMAZON_SELLER_ID && process.env.AMAZON_REFRESH_TOKEN
    ? { status: 'connected', sellerId: process.env.AMAZON_SELLER_ID }
    : { status: 'disconnected', message: '아마존 연결 ���요' };

  result.shopee = process.env.SHOPEE_PARTNER_ID && process.env.SHOPEE_SHOP_ID
    ? { status: 'connected', shopId: process.env.SHOPEE_SHOP_ID }
    : { status: 'disconnected', message: '쇼피 연결 필요' };

  result.qoo10 = process.env.QOO10_API_KEY
    ? { status: 'connected' }
    : { status: 'disconnected', message: '큐텐 연결 필요' };

  result.tiktokShop = process.env.TIKTOK_SHOP_APP_KEY && process.env.TIKTOK_SHOP_ACCESS_TOKEN
    ? { status: 'connected' }
    : { status: 'disconnected', message: '틱톡샵 연결 필요' };

  return res.status(200).json(result);
}

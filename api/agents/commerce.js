import { readSheet } from '../utils/sheets.js';
import { getOrders, getOrderCount } from '../utils/cafe24.js';
import { getEcommerceData } from '../utils/ga4.js';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = { oliveyoung: null, ga4: null, smartstore: null, cafe24: null, amazon: null, shopee: null, qoo10: null, tiktokShop: null };

  // A. Olive Young (Google Sheets)
  // 시트: 스킨케어파트 [A:날짜, B:기간계코드, C:상품코드, D:상품명, E:올리브영매출(₩), F:판매량, G:납품가(₩)]
  const parseWon = (v) => Number((v || '0').replace(/[₩,\s]/g, '')) || 0;
  if (process.env.OLIVEYOUNG_SHEET_ID) {
    try {
      const rows = await readSheet(process.env.OLIVEYOUNG_SHEET_ID, '스킨케어파트!A1:G500');
      const dataRows = rows.slice(1);
      const totalSales = dataRows.reduce((s, r) => s + parseWon(r[4]), 0);
      const totalQty = dataRows.reduce((s, r) => s + (Number(r[5]) || 0), 0);

      // 상품별 집계
      const byProduct = {};
      for (const r of dataRows) {
        const name = r[3] || '미상';
        if (!byProduct[name]) byProduct[name] = { sales: 0, qty: 0 };
        byProduct[name].sales += parseWon(r[4]);
        byProduct[name].qty += Number(r[5]) || 0;
      }

      const recent = dataRows.slice(-10).map(r => ({
        date: r[0], product: r[3], sales: r[4], qty: r[5],
      }));

      result.oliveyoung = { status: 'connected', totalRows: dataRows.length, totalSales, totalQty, byProduct, recent };
    } catch (e) { result.oliveyoung = { status: 'error', error: e.message }; }
  } else {
    result.oliveyoung = { status: 'disconnected', message: '올리브영 시트 연결 필요' };
  }

  // B. GA4 자사몰 매출 (Google Analytics Data API)
  if (process.env.GA4_PROPERTY_ID) {
    try {
      const ecom = await getEcommerceData(process.env.GA4_PROPERTY_ID);
      result.ga4 = { status: 'connected', propertyId: process.env.GA4_PROPERTY_ID, ...ecom };
    } catch (e) {
      result.ga4 = { status: 'error', error: e.message };
    }
  } else {
    result.ga4 = { status: 'disconnected', message: 'GA4 Property ID 연결 필요 — /api/auth/google 재인증 후 GA4_PROPERTY_ID 환경변수 추가' };
  }

  // C-G. Channel connection status
  result.smartstore = process.env.NAVER_COMMERCE_CLIENT_ID && process.env.NAVER_COMMERCE_CLIENT_SECRET
    ? { status: 'connected', message: '스마트스토어 연결됨' }
    : { status: 'disconnected', message: '스마트���토어 연결 필요' };

  // C. Cafe24 (OAuth - real data)
  if (process.env.CAFE24_CLIENT_ID && process.env.CAFE24_MALL_ID) {
    try {
      const now = new Date();
      const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const endDate = now.toISOString().slice(0, 10);
      const countData = await getOrderCount(startDate, endDate);
      const ordersData = await getOrders(startDate, endDate, 10);
      const orders = ordersData.orders || [];
      const totalAmount = orders.reduce((s, o) => s + (Number(o.order_price_amount) || 0), 0);
      result.cafe24 = {
        status: 'connected',
        mallId: process.env.CAFE24_MALL_ID,
        thisMonth: { orders: countData.count || orders.length, sampleAmount: totalAmount },
        recent: orders.slice(0, 5).map(o => ({ orderId: o.order_id, date: o.order_date, amount: o.order_price_amount })),
      };
    } catch (e) {
      result.cafe24 = e.message.includes('인증 필요')
        ? { status: 'auth_required', message: '카페24 OAuth 인증 필요', authUrl: '/api/auth/cafe24' }
        : { status: 'error', error: e.message, mallId: process.env.CAFE24_MALL_ID };
    }
  } else {
    result.cafe24 = { status: 'disconnected', message: '카페24 연결 필요' };
  }

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

  // Promotions calendar (from KV)
  try {
    const cached = await redis.get('commerce:promotions');
    result.promotions = cached ? (typeof cached === 'string' ? JSON.parse(cached) : cached) : null;
  } catch {}

  // Daily suggestions (from KV)
  try {
    const cached = await redis.get('md:daily-suggestions');
    result.dailySuggestions = cached ? (typeof cached === 'string' ? JSON.parse(cached) : cached) : null;
  } catch {}

  return res.status(200).json(result);
}

import { readSheet } from '../utils/sheets.js';
import { getOrders, getOrderCount } from '../utils/cafe24.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = { oliveyoung: null, smartstore: null, cafe24: null, amazon: null, shopee: null, qoo10: null, tiktokShop: null };

  // A. Olive Young (Google Sheets)
  // 시트: [빈열, 기준일, 기간계상품코드, 상품코드, 상품명, 올리브영 매출, 판매수량, 홍천 납품 기준 매출]
  if (process.env.OLIVEYOUNG_SHEET_ID) {
    try {
      const rows = await readSheet(process.env.OLIVEYOUNG_SHEET_ID);
      const dataRows = rows.slice(1);
      const totalSales = dataRows.reduce((s, r) => s + (Number((r[5] || '0').replace(/,/g, '')) || 0), 0);
      const totalQty = dataRows.reduce((s, r) => s + (Number(r[6]) || 0), 0);

      // 상품별 집계
      const byProduct = {};
      for (const r of dataRows) {
        const name = r[4] || '미상';
        if (!byProduct[name]) byProduct[name] = { sales: 0, qty: 0 };
        byProduct[name].sales += Number((r[5] || '0').replace(/,/g, '')) || 0;
        byProduct[name].qty += Number(r[6]) || 0;
      }

      const recent = dataRows.slice(-10).map(r => ({
        date: r[1], product: r[4], sales: r[5], qty: r[6],
      }));

      result.oliveyoung = { status: 'connected', totalRows: dataRows.length, totalSales, totalQty, byProduct, recent };
    } catch (e) { result.oliveyoung = { status: 'error', error: e.message }; }
  } else {
    result.oliveyoung = { status: 'disconnected', message: '올리브영 시트 연결 필요' };
  }

  // B-G. Channel connection status
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

  return res.status(200).json(result);
}

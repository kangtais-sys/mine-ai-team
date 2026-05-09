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

  // Promotions calendar (from KV → fallback to curated indie-beauty calendar)
  const INDIE_BEAUTY_PROMOS = [
    {
      date: '2026-06-01', name: '올영세일 (올리브영 최대 행사)',
      channel: '올리브영', importance: 'high',
      suggestion: '퀵비 앰플 번들(10+2 구성) + 체험단 100명 운영. 올리브영 올세일 기간 중 랭킹 1위 유지 위해 광고비 1.5배 증액. 인플루언서 리뷰 영상 사전 세팅(D-7).',
    },
    {
      date: '2026-06-16', name: '올리브영 올세일 후속 리텐션',
      channel: '올리브영/자사몰', importance: 'medium',
      suggestion: '세일 구매자 대상 카카오 알림톡 "재구매 쿠폰" 발송. 자사몰 단독 리필팩 출시로 충성 고객 Lock-in. 후기 작성 유도 이벤트.',
    },
    {
      date: '2026-07-01', name: '여름 선케어 기획전',
      channel: '전 채널', importance: 'high',
      suggestion: '선크림/미스트 조합 "여름 데일리 루틴 세트" 번들. TikTok "5초 선크림 바르기" 챌린지 연동. 스마트스토어 카테고리 최적화(선케어 → SPF 키워드).',
    },
    {
      date: '2026-08-01', name: '스마트스토어 브랜드데이',
      channel: '스마트스토어', importance: 'high',
      suggestion: '베스트셀러 단독 500개 한정 "밀리밀리 데이" 쿠폰(-20%). 스마트스토어 쇼핑라이브 진행(유민혜 실시간 방송). 검색광고 브랜드키워드 집중 세팅.',
    },
    {
      date: '2026-09-15', name: '추석 선물세트 기획',
      channel: '올리브영/스마트스토어', importance: 'high',
      suggestion: '한정판 추석 기프트박스 출시(퀵비 앰플 + 미스트 세트). 기프티콘 상품 등록. 올리브영 MD 미팅 요청(D-30 시작). 선물용 포장지 디자인 준비.',
    },
    {
      date: '2026-11-11', name: '빼빼로/쇼핑 시즌',
      channel: '전 채널', importance: 'medium',
      suggestion: '빼빼로 모양 제품 패키지 에디션 SNS 바이럴. 스마트스토어 11.11 기획전 신청(D-30). 타임세일 2시간 단위 운영.',
    },
    {
      date: '2026-11-29', name: '블랙프라이데이 (틱톡샵US)',
      channel: '틱톡샵US/아마존', importance: 'high',
      suggestion: 'K-뷰티 번들 $39.99 세트 구성. TikTok LIVE 쇼핑 이벤트 진행(PST 오전 10시). Amazon 쿠폰 20% 적용 후 광고 집중. 해외 인플루언서 1명 협업.',
    },
    {
      date: '2026-12-25', name: '크리스마스 한정판',
      channel: '자사몰/스마트스토어', importance: 'medium',
      suggestion: '크리스마스 에디션 패키지(레드+골드) 300세트 한정. 선착순 구매자 홀리데이 파우치 증정. 유민혜 인스타 언박싱 라이브.',
    },
  ];

  try {
    const cached = await redis.get('commerce:promotions');
    const cachedPromos = cached ? (typeof cached === 'string' ? JSON.parse(cached) : cached) : null;
    // KV에 데이터 있으면 suggestion 병합, 없으면 인디뷰티 캘린더 사용
    if (cachedPromos?.upcoming?.length) {
      const merged = cachedPromos.upcoming.map(p => {
        const match = INDIE_BEAUTY_PROMOS.find(r => r.date === p.date || r.name.includes(p.name?.slice(0, 4)));
        return match ? { ...p, suggestion: match.suggestion } : p;
      });
      result.promotions = { ...cachedPromos, upcoming: merged };
    } else {
      const today = new Date().toISOString().slice(0, 10);
      result.promotions = { upcoming: INDIE_BEAUTY_PROMOS.filter(p => p.date >= today) };
    }
  } catch {
    const today = new Date().toISOString().slice(0, 10);
    result.promotions = { upcoming: INDIE_BEAUTY_PROMOS.filter(p => p.date >= today) };
  }

  // Daily suggestions (from KV)
  try {
    const cached = await redis.get('md:daily-suggestions');
    result.dailySuggestions = cached ? (typeof cached === 'string' ? JSON.parse(cached) : cached) : null;
  } catch {}

  return res.status(200).json(result);
}

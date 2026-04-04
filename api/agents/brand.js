import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = { products: null, reviews: null, competitors: null };

  // A. Millimilli products (from KV cache, populated by cron)
  try {
    const cached = await redis.get('brand:products');
    if (cached) {
      result.products = { status: 'connected', ...(typeof cached === 'string' ? JSON.parse(cached) : cached) };
    } else {
      result.products = { status: 'no_data', message: '크롤링 데이터 없음 - 다음 크론 실행 대기' };
    }
  } catch (e) { result.products = { status: 'error', error: e.message }; }

  // B. Reviews
  if (process.env.SNAPREVIEW_API_KEY) {
    result.reviews = { status: 'connected', source: 'snapreview' };
  } else if (process.env.CAFE24_CLIENT_ID) {
    result.reviews = { status: 'connected', source: 'cafe24' };
  } else {
    result.reviews = { status: 'disconnected', message: '리뷰 API 연결 필요' };
  }

  // C. Competitors (from KV cache)
  try {
    const competitors = await redis.get('brand:competitors');
    if (competitors) {
      result.competitors = { status: 'connected', ...(typeof competitors === 'string' ? JSON.parse(competitors) : competitors) };
    } else {
      result.competitors = { status: 'no_data', message: '경쟁사 데이터 수집 대기 중' };
    }
  } catch (e) { result.competitors = { status: 'error', error: e.message }; }

  return res.status(200).json(result);
}

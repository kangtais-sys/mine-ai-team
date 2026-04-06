import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = { rankings: null, reviews: null, suggestions: null };

  // A. Rankings (from KV cache)
  try {
    const cached = await redis.get('ranking:data');
    result.rankings = cached
      ? { status: 'connected', ...(typeof cached === 'string' ? JSON.parse(cached) : cached) }
      : { status: 'no_data', message: '랭킹 데이터 수집 대기 중' };
  } catch { result.rankings = { status: 'error' }; }

  // B. Reviews (from KV, populated by review-monitor cron)
  try {
    const cached = await redis.get('review:monitor');
    result.reviews = cached
      ? { status: 'connected', ...(typeof cached === 'string' ? JSON.parse(cached) : cached) }
      : { status: 'no_data', message: '리뷰 모니터링 대기 중' };
  } catch { result.reviews = { status: 'error' }; }

  // C. Product suggestions (from KV, weekly AI analysis)
  try {
    const cached = await redis.get('product:suggestions');
    result.suggestions = cached
      ? { status: 'connected', ...(typeof cached === 'string' ? JSON.parse(cached) : cached) }
      : { status: 'no_data', message: '주간 제안 대기 중' };
  } catch { result.suggestions = { status: 'error' }; }

  // Connection status summary
  result.connections = {
    oliveyoung: !!process.env.OLIVEYOUNG_SHEET_ID,
    smartstore: !!process.env.NAVER_COMMERCE_CLIENT_ID,
    cafe24: !!process.env.CAFE24_CLIENT_ID,
    amazon: !!process.env.AMAZON_SELLER_ID,
  };

  return res.status(200).json(result);
}

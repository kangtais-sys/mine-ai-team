import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Redis 우선 → env fallback. OAuth callback이 KV에 새 토큰 저장하므로
// Vercel env 자동 업데이트가 실패해도 사용자 재인증만으로 모든 API가 새 토큰 사용.
export async function getGoogleRefreshToken() {
  const fromKv = await redis.get('google:refresh_token').catch(() => null);
  return fromKv || process.env.GOOGLE_REFRESH_TOKEN || null;
}

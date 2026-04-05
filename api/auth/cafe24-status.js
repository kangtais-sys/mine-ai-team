import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  try {
    const [accessToken, refreshToken, mallId] = await Promise.all([
      redis.get('cafe24:access_token'),
      redis.get('cafe24:refresh_token'),
      redis.get('cafe24:mall_id'),
    ]);

    return res.status(200).json({
      connected: !!(accessToken || refreshToken),
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      mallId: mallId || process.env.CAFE24_MALL_ID || null,
    });
  } catch (error) {
    return res.status(200).json({ connected: false, error: error.message });
  }
}

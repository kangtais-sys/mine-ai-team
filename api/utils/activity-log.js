import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function logActivity(agent, action, detail = '') {
  await redis.lpush('activity:log', JSON.stringify({
    agent, action, detail, timestamp: Date.now(),
  }));
  await redis.ltrim('activity:log', 0, 49);
}

export { redis };

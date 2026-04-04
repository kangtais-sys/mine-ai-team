import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { maxDuration: 120 };

// KST 09:00/13:00/18:00/22:00 → 댓글+DM 자동 응대
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Call our own inbox API to trigger auto-reply
    const baseUrl = `https://${req.headers.host || 'mine-ai-team.vercel.app'}`;
    const inboxRes = await fetch(`${baseUrl}/api/zernio/inbox`, { method: 'POST' });
    const result = await inboxRes.json();

    // Save to KV
    const today = new Date().toISOString().slice(0, 10);
    const logKey = `inbox-log:${today}`;
    const existing = await redis.get(logKey) || [];
    await redis.set(logKey, [...existing, { time: new Date().toISOString(), ...result }]);

    console.log(`[Inbox Cron] replied=${result.replied}, skipped=${result.skipped}, dm=${result.dmReplied}`);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[Inbox Cron]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

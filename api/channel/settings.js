import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const DEFAULT = { autoComment: false, autoDm: false };

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const [ym, mm] = await Promise.all([
      redis.get('channel:settings:yuminhye'),
      redis.get('channel:settings:millimilli'),
    ]);
    return res.status(200).json({
      yuminhye: { ...DEFAULT, ...(ym || {}) },
      millimilli: { ...DEFAULT, ...(mm || {}) },
    });
  }

  if (req.method === 'POST') {
    const { account, autoComment, autoDm } = req.body || {};
    if (!account) return res.status(400).json({ error: 'account required' });
    const key = `channel:settings:${account}`;
    const existing = (await redis.get(key)) || {};
    const updated = { ...DEFAULT, ...existing };
    if (autoComment !== undefined) updated.autoComment = Boolean(autoComment);
    if (autoDm !== undefined) updated.autoDm = Boolean(autoDm);
    await redis.set(key, updated);
    return res.status(200).json({ success: true, settings: updated });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

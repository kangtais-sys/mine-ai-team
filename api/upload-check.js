import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// n8n calls this to check/mark files as processed (dedup)
export default async function handler(req, res) {
  // GET: check if file already processed
  if (req.method === 'GET') {
    const fileId = req.query?.fileId;
    if (!fileId) return res.status(400).json({ error: 'fileId required' });

    const processed = await redis.get(`upload:processed:${fileId}`);
    return res.status(200).json({ fileId, processed: !!processed });
  }

  // POST: mark file as processed
  if (req.method === 'POST') {
    const { fileId, fileName, platforms } = req.body;
    if (!fileId) return res.status(400).json({ error: 'fileId required' });

    await redis.set(`upload:processed:${fileId}`, {
      fileName, platforms, processedAt: new Date().toISOString(),
    }, { ex: 604800 }); // 7 day TTL

    return res.status(200).json({ success: true, fileId });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

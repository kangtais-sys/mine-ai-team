import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const KV_KEY = 'instagram_comment_logs';
const MAX_LOGS = 100;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, CORS_HEADERS);
    return res.end();
  }

  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  // GET: Read logs
  if (req.method === 'GET') {
    try {
      const logs = await redis.get(KV_KEY) || [];
      return res.status(200).json({ logs });
    } catch (error) {
      console.error('[Instagram Logs] Redis read error:', error.message);
      return res.status(200).json({ logs: [], error: error.message });
    }
  }

  // POST: Write logs (from n8n webhook)
  if (req.method === 'POST') {
    try {
      const { logs: newLogs, log: singleLog } = req.body;
      const existing = await redis.get(KV_KEY) || [];

      let updated;
      if (newLogs && Array.isArray(newLogs)) {
        updated = [...newLogs, ...existing].slice(0, MAX_LOGS);
      } else if (singleLog) {
        updated = [singleLog, ...existing].slice(0, MAX_LOGS);
      } else {
        return res.status(400).json({ error: 'Provide "logs" array or "log" object' });
      }

      await redis.set(KV_KEY, updated);
      return res.status(200).json({ saved: updated.length });
    } catch (error) {
      console.error('[Instagram Logs] Redis write error:', error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

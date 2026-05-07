import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method === 'POST') {
    // Log an activity (called by cron/API handlers)
    const { agent, action } = req.body;
    if (!agent || !action) return res.status(400).json({ error: 'agent and action required' });

    const entry = { agent, action, time: new Date().toISOString() };
    const existing = await redis.lrange('activity:log:v2', 0, 48) || [];
    await redis.lpush('activity:log:v2', JSON.stringify(entry));
    await redis.ltrim('activity:log:v2', 0, 49);
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const today = new Date().toISOString().slice(0, 10);

    const [raw, publishLog, inboxLog, crosspostLog] = await Promise.all([
      redis.lrange('activity:log:v2', 0, 19),
      redis.get(`publish-log:${today}`),
      redis.get(`inbox-log:${today}`),
      redis.get(`creator-crosspost-log:${today}`),
    ]);

    // Parse stored log entries
    const stored = (raw || []).map(r => {
      try { return typeof r === 'string' ? JSON.parse(r) : r; } catch { return null; }
    }).filter(Boolean);

    // Build synthetic activities from today's KV logs
    const synthetic = [];
    const pLogs = Array.isArray(publishLog) ? publishLog : [];
    const iLogs = Array.isArray(inboxLog) ? inboxLog : [];
    const cpLogs = Array.isArray(crosspostLog) ? crosspostLog : [];

    if (pLogs.length > 0) {
      const total = pLogs.reduce((s, l) => s + (l.count || 1), 0);
      const last = pLogs[pLogs.length - 1];
      synthetic.push({ agent: 'creator', action: `콘텐츠 ${total}건 발행 완료`, time: last?.time || new Date().toISOString() });
    }

    const totalReplied = iLogs.reduce((s, l) => s + (l.replied || 0), 0);
    const totalDM = iLogs.reduce((s, l) => s + (l.dmReplied || 0), 0);
    if (totalReplied > 0) {
      synthetic.push({ agent: 'community', action: `댓글 ${totalReplied}건, DM ${totalDM}건 응대 완료`, time: new Date().toISOString() });
    }

    cpLogs.slice(-3).forEach(cp => {
      if (cp.tiktok || cp.youtube) {
        synthetic.push({ agent: 'creator', action: `@lala_lounge_ 크로스포스팅 완료 (TT+YT)`, time: new Date().toISOString() });
      }
    });

    const activities = [...synthetic, ...stored].slice(0, 20);

    return res.status(200).json({ activities });
  } catch (error) {
    return res.status(200).json({ activities: [], error: error.message });
  }
}

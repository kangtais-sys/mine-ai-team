import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// GET: 오늘의 발행/응대/보고 현황 조회
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const today = new Date().toISOString().slice(0, 10);

  try {
    const [publishLogs, inboxLogs, dailyReport] = await Promise.all([
      redis.get(`publish-log:${today}`),
      redis.get(`inbox-log:${today}`),
      redis.get(`daily-report:${today}`),
    ]);

    const pLogs = Array.isArray(publishLogs) ? publishLogs : [];
    const iLogs = Array.isArray(inboxLogs) ? inboxLogs : [];

    return res.status(200).json({
      date: today,
      publish: {
        total: pLogs.length,
        morning: pLogs.filter(l => l.type === 'morning').length,
        afternoon: pLogs.filter(l => l.type === 'afternoon').length,
        evening: pLogs.filter(l => l.type === 'evening').length,
        logs: pLogs.slice(-5),
      },
      inbox: {
        replied: iLogs.reduce((s, l) => s + (l.replied || 0), 0),
        skipped: iLogs.reduce((s, l) => s + (l.skipped || 0), 0),
        dm: iLogs.reduce((s, l) => s + (l.dmReplied || 0), 0),
        runs: iLogs.length,
      },
      report: dailyReport,
    });
  } catch (error) {
    return res.status(200).json({ date: today, publish: { total: 0 }, inbox: { replied: 0, dm: 0 }, report: null, error: error.message });
  }
}

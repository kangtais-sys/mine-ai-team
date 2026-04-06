import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const today = new Date().toISOString().slice(0, 10);

    // Agent summaries (direct KV reads instead of self-fetch to avoid HTML issues)
    const [commentTotal, dmTotal, claudeCallsToday] = await Promise.all([
      redis.get('stat:comment:total'),
      redis.get('stat:dm:total'),
      redis.get(`stat:claude:calls:${today}`),
    ]);

    // Chief daily report
    let dailyReport = null;
    try {
      const cached = await redis.get('chief:daily-report');
      dailyReport = cached ? (typeof cached === 'string' ? JSON.parse(cached) : cached) : null;
    } catch {}

    // Connection status (from env vars)
    const connections = {
      zernio: { status: !!process.env.ZERNIO_API_KEY ? 'connected' : 'disconnected' },
      google: { status: !!process.env.GOOGLE_REFRESH_TOKEN ? 'connected' : 'disconnected' },
      meta: { status: !!process.env.INSTAGRAM_ACCESS_TOKEN ? 'connected' : 'disconnected' },
      anthropic: { status: !!process.env.ANTHROPIC_API_KEY ? 'connected' : 'disconnected' },
      cafe24: { status: !!(process.env.CAFE24_CLIENT_ID && process.env.CAFE24_MALL_ID) ? 'connected' : 'disconnected' },
      ga4: { status: !!process.env.GA4_PROPERTY_ID ? 'connected' : 'disconnected' },
      oliveyoung: { status: !!process.env.OLIVEYOUNG_SHEET_ID ? 'connected' : 'disconnected' },
      naverAds: { status: !!process.env.NAVER_AD_API_KEY ? 'connected' : 'disconnected' },
      happytalk: { status: !!process.env.HAPPYTALK_API_KEY ? 'connected' : 'pending' },
    };

    const connCount = Object.values(connections).filter(v => v.status === 'connected').length;

    // Monthly costs estimate
    const claudeCalls = Number(claudeCallsToday) || 0;
    const costs = {
      vercel: { name: 'Vercel Pro', amount: 20, currency: 'USD' },
      n8n: { name: 'n8n Starter', amount: 24, currency: 'EUR' },
      zernio: { name: 'Zernio', amount: 0, currency: 'USD', note: '플랜 확인 필요' },
      anthropic: { name: 'Anthropic API', amount: Math.round(claudeCalls * 30 * 0.002 * 100) / 100, currency: 'USD', note: `~${claudeCalls}calls/day` },
    };
    const totalCostUSD = costs.vercel.amount + costs.n8n.amount * 1.1 + costs.anthropic.amount;

    return res.status(200).json({
      status: 'connected',
      summary: {
        community: { comments: Number(commentTotal) || 0, dm: Number(dmTotal) || 0 },
      },
      connections,
      connCount,
      totalConnections: Object.keys(connections).length,
      claudeCalls: { today: claudeCalls },
      costs,
      totalCostUSD: Math.round(totalCostUSD * 100) / 100,
      dailyReport,
    });
  } catch (error) {
    return res.status(200).json({ status: 'error', error: error.message });
  }
}

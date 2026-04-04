import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const baseUrl = `https://${req.headers.host || 'mine-ai-team.vercel.app'}`;

    const [creator, community, marketer, commerce, management, exportData] = await Promise.all([
      fetch(`${baseUrl}/api/agents/creator`).then(r => r.json()).catch(() => null),
      fetch(`${baseUrl}/api/agents/community`).then(r => r.json()).catch(() => null),
      fetch(`${baseUrl}/api/agents/marketer`).then(r => r.json()).catch(() => null),
      fetch(`${baseUrl}/api/agents/commerce`).then(r => r.json()).catch(() => null),
      fetch(`${baseUrl}/api/agents/management`).then(r => r.json()).catch(() => null),
      fetch(`${baseUrl}/api/agents/export`).then(r => r.json()).catch(() => null),
    ]);

    const latestInsight = await redis.get('strategy:weekly-insight');

    return res.status(200).json({
      status: 'connected',
      summary: {
        content: creator?.counts || null,
        community: community?.totals || null,
        adSpend: marketer?.totalSpend || 0,
        metaAccounts: marketer?.meta?.accounts?.length || 0,
        oliveyoung: commerce?.oliveyoung?.status || 'unknown',
        employees: management?.employees?.active || 0,
        exports: exportData?.exports?.totalOrders || 0,
      },
      connections: {
        creator: creator?.status || 'unknown',
        community: community?.status || 'unknown',
        marketer: marketer?.meta?.status || 'unknown',
        commerce: commerce?.oliveyoung?.status || 'unknown',
        management: management?.employees?.status || 'unknown',
        export: exportData?.exports?.status || 'unknown',
      },
      latestInsight: latestInsight ? (typeof latestInsight === 'string' ? JSON.parse(latestInsight) : latestInsight) : null,
    });
  } catch (error) {
    return res.status(200).json({ status: 'error', error: error.message });
  }
}

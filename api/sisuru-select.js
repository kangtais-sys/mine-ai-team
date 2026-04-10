import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  // GET: 현재 제안 목록 조회
  if (req.method === 'GET') {
    const proposals = await redis.get('sisuru:proposals');
    const selected = await redis.get('sisuru:selected');
    return res.status(200).json({
      proposals: proposals ? (typeof proposals === 'string' ? JSON.parse(proposals) : proposals) : null,
      selected: selected ? (typeof selected === 'string' ? JSON.parse(selected) : selected) : null,
    });
  }

  // POST: 주제 선택 → 제작 트리거
  if (req.method === 'POST') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required (1~5)' });

    const proposals = await redis.get('sisuru:proposals');
    const data = proposals ? (typeof proposals === 'string' ? JSON.parse(proposals) : proposals) : null;
    if (!data?.proposals) return res.status(200).json({ error: 'No proposals found. Run /api/cron/sisuru-propose first.' });

    const selected = data.proposals.find(p => p.id === Number(id));
    if (!selected) return res.status(400).json({ error: `Proposal ${id} not found` });

    // 선택 저장
    await redis.set('sisuru:selected', JSON.stringify({ ...selected, selectedAt: new Date().toISOString() }), { ex: 86400 });

    console.log(`[Sisuru Select] Selected #${id}: ${selected.topic}`);

    // 제작 트리거 (sisuru-content.js 호출)
    const baseUrl = `https://${req.headers.host || 'mine-ai-team.vercel.app'}`;
    try {
      const triggerRes = await fetch(`${baseUrl}/api/cron/sisuru-content`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json' },
      });
      const triggerData = await triggerRes.json();
      return res.status(200).json({ success: true, selected, production: triggerData });
    } catch (e) {
      return res.status(200).json({ success: true, selected, production: { error: 'Trigger failed: ' + e.message } });
    }
  }

  return res.status(405).json({ error: 'GET or POST' });
}

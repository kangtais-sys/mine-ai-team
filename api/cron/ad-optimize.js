import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { maxDuration: 120 };

const AD_ACCOUNTS = [
  { name: '랄라라운지_한국', id: '855116430496295' },
  { name: '밀리밀리_인하우스', id: '2327868604313508' },
  { name: '밀리밀리_한국', id: '791241442793311' },
  { name: '밀리밀리_한국_올리브영', id: '623851980786807' },
  { name: '엠마워시_오피셜', id: '864303894888410' },
];

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return res.status(200).json({ skipped: true, reason: 'no token' });

  try {
    const lowRoas = [];
    for (const acc of AD_ACCOUNTS) {
      try {
        const url = `https://graph.facebook.com/v19.0/act_${acc.id}/insights?fields=spend,actions,campaign_name&date_preset=last_7d&level=campaign&limit=10&access_token=${token}`;
        const r = await fetch(url);
        const d = await r.json();
        for (const row of d.data || []) {
          const spend = Number(row.spend) || 0;
          if (spend < 10000) continue;
          const purchases = (row.actions || []).filter(a => a.action_type === 'purchase').reduce((s, a) => s + Number(a.value), 0);
          const roas = spend > 0 ? purchases / spend : 0;
          if (roas < 2.0) {
            lowRoas.push({ account: acc.name, campaign: row.campaign_name, spend, roas: roas.toFixed(2) });
          }
        }
      } catch {}
    }

    let suggestion = null;
    if (lowRoas.length > 0 && process.env.ANTHROPIC_API_KEY) {
      try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 300,
            messages: [{ role: 'user', content: `아래 Meta 광고 캠페인들의 ROAS가 2.0 미만입니다. 각 캠페인에 대해 1줄씩 개선 제안을 해주세요.\n\n${lowRoas.map(c => `${c.account} > ${c.campaign}: 광고비 ${c.spend}원, ROAS ${c.roas}`).join('\n')}` }],
          }),
        });
        const data = await claudeRes.json();
        suggestion = data.content?.[0]?.text || '';
      } catch {}
    }

    const result = { lowRoas, suggestion, updatedAt: new Date().toISOString() };
    await redis.set('marketer:suggestions', JSON.stringify(result), { ex: 86400 });

    console.log('[Ad Optimize] low ROAS campaigns:', lowRoas.length);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[Ad Optimize] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

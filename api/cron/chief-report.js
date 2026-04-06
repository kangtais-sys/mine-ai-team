import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    // Gather yesterday's stats
    const [comments, dm, claudeCalls] = await Promise.all([
      redis.get(`stat:comment:instagram:${yesterday}`),
      redis.get(`stat:dm:${yesterday}`),
      redis.get(`stat:claude:calls:${yesterday}`),
    ]);

    const stats = {
      comments: Number(comments) || 0,
      dm: Number(dm) || 0,
      claudeCalls: Number(claudeCalls) || 0,
    };

    // Generate report with Claude
    let report = `어제(${yesterday}) 요약: 댓글 ${stats.comments}건, DM ${stats.dm}건, API호출 ${stats.claudeCalls}건`;
    let priorities = ['댓글 응대 모니터링', '광고 ROAS 점검', '수출 바이어 팔로업'];

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 300,
            messages: [{ role: 'user', content: `MILLI AI 일간 종합 보고를 작성해주세요.
어제(${yesterday}) 데이터:
- 댓글 응대: ${stats.comments}건
- DM 응대: ${stats.dm}건
- Claude API 호출: ${stats.claudeCalls}건

1줄 요약 + 오늘 우선순위 3가지를 번호로 작성해주세요. 간결하게.` }],
          }),
        });
        const data = await claudeRes.json();
        const text = data.content?.[0]?.text || '';
        if (text) report = text;
      } catch {}
    }

    const result = { report, priorities, stats, date: today, updatedAt: new Date().toISOString() };
    await redis.set('chief:daily-report', JSON.stringify(result), { ex: 86400 });

    // Track Claude calls
    await redis.incr(`stat:claude:calls:${today}`);

    console.log('[Chief Report] Generated for', today);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[Chief Report] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

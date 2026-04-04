import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';

const anthropic = new Anthropic();
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { maxDuration: 60 };

// KST 18:00 = UTC 09:00 → 일일 보고
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const [publishLogs, inboxLogs] = await Promise.all([
      redis.get(`publish-log:${today}`) || [],
      redis.get(`inbox-log:${today}`) || [],
    ]);

    const pLogs = Array.isArray(publishLogs) ? publishLogs : [];
    const iLogs = Array.isArray(inboxLogs) ? inboxLogs : [];

    // Aggregate
    const publishCount = pLogs.length;
    const morningPosts = pLogs.filter(l => l.type === 'morning').length;
    const afternoonPosts = pLogs.filter(l => l.type === 'afternoon').length;
    const eveningPosts = pLogs.filter(l => l.type === 'evening').length;

    const totalReplied = iLogs.reduce((s, l) => s + (l.replied || 0), 0);
    const totalSkipped = iLogs.reduce((s, l) => s + (l.skipped || 0), 0);
    const totalDM = iLogs.reduce((s, l) => s + (l.dmReplied || 0), 0);

    // Claude summary
    const summaryRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `오늘(${today}) AI 크리에이터 일일 보고서를 작성해줘.

데이터:
- 콘텐츠 발행: 총 ${publishCount}건 (오전 ${morningPosts} / 오후 ${afternoonPosts} / 저녁 ${eveningPosts})
- 댓글 응대: ${totalReplied}건 답글, ${totalSkipped}건 스킵
- DM 응대: ${totalDM}건

형식:
📊 AI 크리에이터 일일 보고 (${today})
━━━━━━━━━━━━━━━━━━━━

[유민혜] 발행 N건 | 댓글 N건 | DM N건
[밀리밀리] 발행 N건 | 댓글 N건 | DM N건

📝 특이사항/인사이트 1~2줄
━━━━━━━━━━━━━━━━━━━━`
      }],
    });

    const report = summaryRes.content[0]?.text || `📊 일일 보고 (${today})\n발행 ${publishCount}건, 댓글 ${totalReplied}건, DM ${totalDM}건`;

    // Save report to KV
    await redis.set(`daily-report:${today}`, {
      report,
      stats: { publishCount, morningPosts, afternoonPosts, eveningPosts, totalReplied, totalSkipped, totalDM },
      generatedAt: new Date().toISOString(),
    });

    // Also send to Slack if configured
    if (process.env.SLACK_WEBHOOK_URL) {
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: report }),
      }).catch(() => {});
    }

    return res.status(200).json({ success: true, report });
  } catch (error) {
    console.error('[Daily Report]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

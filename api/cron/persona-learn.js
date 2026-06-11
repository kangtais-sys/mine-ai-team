// 주 1회 자동 페르소나 게시물 학습 cron
// 매주 월요일 오전 9시 KST (UTC 0시)

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = {};

  for (const account of ['yuminhye', 'millimilli', 'millimilli_us']) {
    try {
      const r = await fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://mine-ai-team.vercel.app'}/api/channel/learn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, mode: 'posts' }),
      });
      const d = await r.json();
      results[account] = d.success ? `완료 (${d.learnedFrom}개 게시물)` : `스킵: ${d.message}`;
      console.log(`[PersonaLearn][${account}]`, results[account]);
    } catch (e) {
      results[account] = `오류: ${e.message}`;
      console.error(`[PersonaLearn][${account}]`, e.message);
    }
  }

  return res.status(200).json({ success: true, results, runAt: new Date().toISOString() });
}

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const nowKST = new Date(Date.now() + 9 * 3600000);
    const today = nowKST.toISOString().slice(0, 10);

    // 1. 팔로워 수 수집
    const [ymFollowers, mmFollowers] = await Promise.all([
      redis.get('followers:yuminhye:instagram'),
      redis.get('followers:millimilli:instagram'),
    ]);

    // 2. 최근 7일 자동응대 통계
    const [ymCC, mmCC, ymDC, mmDC] = await Promise.all([
      redis.get('channel:auto:count:comment:yuminhye'),
      redis.get('channel:auto:count:comment:millimilli'),
      redis.get('channel:auto:count:dm:yuminhye'),
      redis.get('channel:auto:count:dm:millimilli'),
    ]);

    // 3. 최근 게시물 평균 댓글 수 (캐시에서)
    const [ymPosts, mmPosts] = await Promise.all([
      redis.get('channel:posts:yuminhye'),
      redis.get('channel:posts:millimilli'),
    ]);

    const avgComments = (posts) => {
      if (!posts || posts.length === 0) return 0;
      // 7일 이내 게시물 필터
      const cutoff = new Date(nowKST - 7 * 86400000);
      const recent = posts.filter(p => new Date(p.timestamp) >= cutoff);
      if (recent.length === 0) return 0;
      return Math.round(recent.reduce((s, p) => s + (p.comments_count || 0), 0) / recent.length);
    };

    // 4. 자동응대 설정 상태
    const [ymSettings, mmSettings] = await Promise.all([
      redis.get('channel:settings:yuminhye'),
      redis.get('channel:settings:millimilli'),
    ]);

    const summary = {
      date: today,
      yuminhye: {
        followers: ymFollowers?.count || 0,
        avgComments7d: avgComments(ymPosts),
        autoCommentTotal: ymCC || 0,
        autoDmTotal: ymDC || 0,
        autoCommentOn: ymSettings?.autoComment || false,
        autoDmOn: ymSettings?.autoDm || false,
      },
      millimilli: {
        followers: mmFollowers?.count || 0,
        avgComments7d: avgComments(mmPosts),
        autoCommentTotal: mmCC || 0,
        autoDmTotal: mmDC || 0,
        autoCommentOn: mmSettings?.autoComment || false,
        autoDmOn: mmSettings?.autoDm || false,
      },
      updatedAt: new Date().toISOString(),
    };

    // 5. Claude 보고서 생성
    let report = '';
    if (process.env.ANTHROPIC_API_KEY) {
      const fmt = (n) => (n || 0).toLocaleString('ko-KR');

      const prompt = `당신은 밀리밀리(MILLIMILLI) 브랜드의 AI 채널 매니저입니다.
매일 아침 8시 채널 운영 보고서를 작성해주세요.

[${today} 채널 현황]
■ 유민혜 계정 (@lala_lounge_)
- 팔로워: ${fmt(summary.yuminhye.followers)}명
- 최근 7일 평균 댓글: ${summary.yuminhye.avgComments7d}개/게시물
- 누적 자동 댓글 응대: ${fmt(summary.yuminhye.autoCommentTotal)}건
- 자동댓글: ${summary.yuminhye.autoCommentOn ? 'ON' : 'OFF'} / 자동DM: ${summary.yuminhye.autoDmOn ? 'ON' : 'OFF'}

■ 밀리밀리 계정 (@millimilli_official)
- 팔로워: ${fmt(summary.millimilli.followers)}명
- 최근 7일 평균 댓글: ${summary.millimilli.avgComments7d}개/게시물
- 누적 자동 댓글 응대: ${fmt(summary.millimilli.autoCommentTotal)}건
- 자동댓글: ${summary.millimilli.autoCommentOn ? 'ON' : 'OFF'} / 자동DM: ${summary.millimilli.autoDmOn ? 'ON' : 'OFF'}

다음 형식으로 간결하게 작성해주세요:
1. 핵심 한 줄 요약 (이모지 포함)
2. 채널별 특이사항 (있을 경우)
3. 오늘 채널 운영 제안 2가지

실무적으로 간결하게 작성해주세요.`;

      try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-20250514',
            max_tokens: 400,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        const data = await claudeRes.json();
        report = data.content?.[0]?.text || '';
      } catch (e) {
        console.error('[Channel Report] Claude error:', e.message);
      }
    }

    const result = { report, summary, date: today, updatedAt: new Date().toISOString() };
    await redis.set('channel:daily-report', JSON.stringify(result), { ex: 86400 * 2 });

    console.log('[Channel Report] Generated for', today);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[Channel Report] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

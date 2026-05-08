import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { maxDuration: 30 };

const ACCOUNT_NAMES = {
  yuminhye: '유민혜 (@lala_lounge_ / @yuminhye)',
  millimilli: '밀리밀리 브랜드 (@millimilli_official)',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { account } = req.body || {};
  if (!['yuminhye', 'millimilli'].includes(account)) {
    return res.status(400).json({ error: 'account must be yuminhye or millimilli' });
  }

  try {
    // 1. Get recent posts from cache
    const posts = (await redis.get(`channel:posts:${account}`)) || [];
    if (posts.length === 0) {
      return res.status(200).json({
        success: false,
        message: '게시물 데이터가 없습니다. 먼저 "게시물 불러오기"를 실행하세요.',
      });
    }

    // 2. Get existing persona
    const existing = await redis.get(`channel:persona:${account}`);

    // 3. Build post summary for Claude
    const postSummary = posts.slice(0, 10).map((p, i) => {
      const date = p.timestamp ? p.timestamp.slice(0, 10) : '';
      const caption = (p.caption || '(캡션 없음)').slice(0, 300);
      return `[${i + 1}] ${date} | 좋아요 ${p.like_count || 0}개 · 댓글 ${p.comments_count || 0}개\n캡션: ${caption}`;
    }).join('\n\n');

    const avgLikes = Math.round(posts.reduce((s, p) => s + (p.like_count || 0), 0) / posts.length);
    const avgComments = Math.round(posts.reduce((s, p) => s + (p.comments_count || 0), 0) / posts.length);

    // 4. Claude 분석
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: `당신은 SNS 채널 분석 전문가입니다.
Instagram 게시물을 분석하여 페르소나 특성을 파악합니다.
반드시 JSON만 반환하세요. 마크다운 없이 순수 JSON.`,
        messages: [{
          role: 'user',
          content: `${ACCOUNT_NAMES[account]} 최근 Instagram 게시물 ${posts.length}개를 분석해주세요:

${postSummary}

평균 참여율: 좋아요 ${avgLikes}개, 댓글 ${avgComments}개

다음 JSON 형식으로 분석 결과를 반환하세요:
{
  "mainTopics": ["주요 콘텐츠 주제1", "주제2", "주제3"],
  "toneInsights": "게시물에서 나타나는 말투와 감성 특성 (1-2문장)",
  "hashtagPatterns": "자주 사용하는 해시태그 패턴",
  "highEngagementType": "참여율 높은 콘텐츠 유형",
  "recentFocus": "최근 집중하는 주제 또는 트렌드",
  "commentTriggers": ["댓글을 유발하는 요소1", "요소2"],
  "avgEngagement": { "likes": ${avgLikes}, "comments": ${avgComments} },
  "postFrequency": "게시 빈도 추정",
  "recommendations": ["페르소나 기반 댓글 응대 팁1", "팁2"]
}`
        }],
      }),
    });

    const claudeData = await claudeRes.json();
    let learned = null;

    try {
      const text = claudeData.content?.[0]?.text || '{}';
      learned = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
    } catch {
      learned = { error: 'parse failed', raw: claudeData.content?.[0]?.text };
    }

    // 5. Update persona with learned data (merge, don't overwrite base)
    const updated = {
      ...(existing || {}),
      learnedAt: new Date().toISOString(),
      learnedFrom: posts.length,
      learned,
    };
    await redis.set(`channel:persona:${account}`, updated);

    return res.status(200).json({
      success: true,
      learned,
      learnedFrom: posts.length,
      updatedAt: updated.learnedAt,
    });
  } catch (e) {
    console.error('[Channel Learn]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

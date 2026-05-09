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

async function callClaude(system, userContent) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-20250514',
      max_tokens: 800,
      system,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ────────────────────────────────────────────────
// mode: 'posts' — 게시물 기반 학습 (기존)
// ────────────────────────────────────────────────
async function learnFromPosts(account) {
  const posts = (await redis.get(`channel:posts:${account}`)) || [];
  if (posts.length === 0) {
    return { success: false, message: '게시물 데이터가 없습니다. 먼저 "게시물 불러오기"를 실행하세요.' };
  }

  const postSummary = posts.slice(0, 10).map((p, i) => {
    const date = p.timestamp ? p.timestamp.slice(0, 10) : '';
    const caption = (p.caption || '(캡션 없음)').slice(0, 300);
    return `[${i + 1}] ${date} | 좋아요 ${p.like_count || 0}개 · 댓글 ${p.comments_count || 0}개\n캡션: ${caption}`;
  }).join('\n\n');

  const avgLikes = Math.round(posts.reduce((s, p) => s + (p.like_count || 0), 0) / posts.length);
  const avgComments = Math.round(posts.reduce((s, p) => s + (p.comments_count || 0), 0) / posts.length);

  const raw = await callClaude(
    `당신은 SNS 채널 분석 전문가입니다. Instagram 게시물을 분석하여 페르소나 특성을 파악합니다. 반드시 JSON만 반환하세요. 마크다운 없이 순수 JSON.`,
    `${ACCOUNT_NAMES[account]} 최근 Instagram 게시물 ${posts.length}개를 분석해주세요:

${postSummary}

평균 참여율: 좋아요 ${avgLikes}개, 댓글 ${avgComments}개

다음 JSON 형식으로 반환하세요:
{
  "mainTopics": ["주요 주제1", "주제2", "주제3"],
  "toneInsights": "말투와 감성 특성 (1-2문장)",
  "hashtagPatterns": "자주 사용하는 해시태그 패턴",
  "highEngagementType": "참여율 높은 콘텐츠 유형",
  "recentFocus": "최근 집중 주제",
  "commentTriggers": ["댓글 유발 요소1", "요소2"],
  "avgEngagement": { "likes": ${avgLikes}, "comments": ${avgComments} },
  "postFrequency": "게시 빈도 추정",
  "recommendations": ["댓글 응대 팁1", "팁2"]
}`
  );

  let learned = null;
  try { learned = JSON.parse(raw.replace(/```json\n?|```\n?/g, '').trim()); }
  catch { learned = { error: 'parse failed', raw: raw.slice(0, 200) }; }

  const existing = await redis.get(`channel:persona:${account}`) || {};
  const updated = { ...existing, learnedAt: new Date().toISOString(), learnedFrom: posts.length, learned };
  await redis.set(`channel:persona:${account}`, updated);

  return { success: true, mode: 'posts', learned, learnedFrom: posts.length };
}

// ────────────────────────────────────────────────
// mode: 'replies' — 내 답변 이력 기반 학습 (신규)
// ────────────────────────────────────────────────
async function learnFromReplies(account) {
  // 댓글 + DM 응대 로그 수집
  const [commentLogs, dmLogs] = await Promise.all([
    redis.lrange(`channel:auto:comment:logs:${account}`, 0, 99),
    redis.lrange(`channel:auto:dm:logs:${account}`, 0, 49),
  ]);

  const parseLog = (raw) => {
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { return null; }
  };

  const comments = commentLogs.map(parseLog).filter(l => l && l.reply && l.text);
  const dms = dmLogs.map(parseLog).filter(l => l && l.reply && l.text);

  const allReplies = [...comments, ...dms];

  if (allReplies.length < 3) {
    return {
      success: false,
      message: `응대 기록이 부족합니다 (현재 ${allReplies.length}건). 최소 3건 이상 필요합니다.`,
    };
  }

  // 샘플 구성 (최대 30개)
  const samples = allReplies.slice(0, 30).map((log, i) => (
    `[${i + 1}] ${log.type === 'dm' ? 'DM' : '댓글'}\n원문: "${log.text}"\n내 답변: "${log.reply}"`
  )).join('\n\n');

  const raw = await callClaude(
    `당신은 SNS 응대 스타일 분석 전문가입니다.
실제 댓글/DM 응대 사례를 분석하여 말투·톤·패턴을 추출합니다.
반드시 JSON만 반환하세요. 마크다운 없이 순수 JSON.`,
    `${ACCOUNT_NAMES[account]}의 실제 댓글/DM 응대 사례 ${allReplies.length}건입니다:

${samples}

이 응대 사례들을 분석하여 다음 JSON으로 반환하세요:
{
  "replyTone": "답변의 전반적인 말투·톤 특성 (2-3문장)",
  "commonPhrases": ["자주 사용하는 표현1", "표현2", "표현3"],
  "emojiPattern": "이모지 사용 패턴",
  "avgLength": "답변 평균 길이 (짧음/보통/길음)",
  "handlingPatterns": {
    "praise": "칭찬 댓글 처리 패턴",
    "inquiry": "제품 문의 처리 패턴",
    "complaint": "부정적 댓글 처리 패턴"
  },
  "doList": ["잘하고 있는 응대 패턴1", "패턴2"],
  "dontList": ["개선이 필요한 부분1 (있다면)", "부분2"],
  "learnedStyle": "이 응대 이력에서 학습한 핵심 스타일 요약 (2-3문장, 이후 AI 응대에 직접 활용)"
}`
  );

  let learnedReplies = null;
  try { learnedReplies = JSON.parse(raw.replace(/```json\n?|```\n?/g, '').trim()); }
  catch { learnedReplies = { error: 'parse failed', raw: raw.slice(0, 200) }; }

  const existing = await redis.get(`channel:persona:${account}`) || {};
  const updated = {
    ...existing,
    replyLearnedAt: new Date().toISOString(),
    replyLearnedFrom: allReplies.length,
    learnedReplies,
  };
  await redis.set(`channel:persona:${account}`, updated);

  return {
    success: true,
    mode: 'replies',
    learnedReplies,
    learnedFrom: allReplies.length,
    commentCount: comments.length,
    dmCount: dms.length,
  };
}

// ────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { account, mode = 'posts' } = req.body || {};
  if (!['yuminhye', 'millimilli'].includes(account)) {
    return res.status(400).json({ error: 'account must be yuminhye or millimilli' });
  }

  try {
    let result;
    if (mode === 'replies') {
      result = await learnFromReplies(account);
    } else {
      result = await learnFromPosts(account);
    }
    return res.status(200).json(result);
  } catch (e) {
    console.error(`[Channel Learn][${mode}]`, e.message);
    return res.status(500).json({ error: e.message });
  }
}

import { Redis } from '@upstash/redis';

export const config = { maxDuration: 120 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: `오늘(${today}) 인스타그램 카드뉴스 주제를 5개 제안해줘.

채널: 시수르더쿠 (@sisru_doku) — 솔직한 뷰티/스킨케어 정보
대상: 20~35세 여성, 피부 고민
톤: 친구처럼 솔직, 약간 도발적

## 트렌드 소스 참고
- Reddit r/SkincareAddiction, r/AsianBeauty 인기글
- 올리브영 실시간 랭킹
- 글로우픽 인기 리뷰
- X(트위터) #스킨케어 트렌드

## 각 주제별 포함:
- type: 스킨케어팁/제품비교/성분분석/루틴/트렌드 중 택1
- topic: 구체적 주제
- hook: 1장 후킹 텍스트 (3초 안에 읽히고 충격/호기심/공감 유발, 2줄 이내)
  좋은 예: "이거 모르면 피부과 돈 낭비 🤯" / "세안 후 3분 안에 이거 안 하면 끝" / "피부과 의사가 절대 안 쓰는 성분"
  나쁜 예: "레티놀에 대해 알아보겠습니다" (너무 밋밋)
- summary: 3줄 요약 (어떤 내용을 다룰지)
- engagement_score: 예상 참여도 1~10 (높을수록 좋음)

JSON만 응답:
{
  "date": "${today}",
  "proposals": [
    {
      "id": 1,
      "type": "...",
      "topic": "...",
      "hook": "...",
      "summary": "...",
      "engagement_score": 8
    },
    ...5개
  ]
}` }],
      }),
    });

    const data = await claudeRes.json();
    const text = data.content?.[0]?.text || '{}';
    const match = text.match(/\{[\s\S]*\}/);
    const proposals = match ? JSON.parse(match[0]) : null;

    if (!proposals) return res.status(200).json({ error: 'Proposal generation failed' });

    // KV 저장
    await redis.set('sisuru:proposals', JSON.stringify(proposals), { ex: 86400 });
    await redis.lpush('activity:log', JSON.stringify({
      agent: 'AI 크리에이터', action: '시수르더쿠 주제 5개 제안',
      detail: proposals.proposals?.map(p => p.topic).join(' / '), timestamp: Date.now(),
    }));
    await redis.ltrim('activity:log', 0, 49);

    console.log('[Sisuru Propose]', proposals.proposals?.map(p => `${p.id}. ${p.topic} (${p.engagement_score})`).join(' | '));

    return res.status(200).json({ success: true, ...proposals });
  } catch (error) {
    console.error('[Sisuru Propose] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

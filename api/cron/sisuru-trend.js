import { Redis } from '@upstash/redis';
export const config = { maxDuration: 120 };
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  const isCron = req.method === 'GET';
  if (isCron && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 2000, temperature: 1.0,
        messages: [{ role: 'user', content: `오늘(${today}) 인스타그램 카드뉴스 주제 5개.

채널: 시수르더쿠 — 1년에 1억 쓰는 시술/화장품 중독자의 솔직 후기
대상: 20~35세 여성

## 바이럴 공식 (실제 데이터 기반)
참고: coduck.mag 좋아요 2.6만 '단돈 천원에 노글루' → 가격충격+의외성
바이럴 핵심 = 친구 태그하고 싶은 정보 = 공유욕 자극

주제 유형 (우선순위):
1. 가격 반전: "다이소/편의점에서 OO만원짜리 효과"
2. 장소 반전: 의외의 곳에서 파는 것
3. 소외감: "나만 몰랐던 것"
4. 돈 아까움: "이걸 알았으면 OO만원 아꼈을 텐데"
5. 친구태그: 당장 카톡 보내고 싶은 정보
6. 콜라보/한정판/신제품
7. 시수르더쿠 특화: 1억 써보고 깨달은 것

주제 유형 다양하게 (5개 중 최소 1개는 리스트형):
- 신상/화제: 지금 SNS에서 난리인 것, 신제품, 콜라보
- 저장각: 진짜 저장하고 싶은 꿀팁, 비용 비교, 부작용 정리
- 공유각: 친구한테 바로 보내고 싶은 충격 정보
- 리스트형(1개 필수): "BEST5" / "TOP3" / "VS 비교" 형식
- 경험담: 직접 써보거나 맞아본 솔직 후기
⚠️ 전부 리스트형 ❌ 다양하게! 리스트형은 5개 중 1~2개만.
탈락 기준: 결말 뻔한 것, 전문가용, 누구나 아는 상식, 타겟 너무 좁음

## 트렌드 소스
- X(트위터)/스레드: #스킨케어 #뷰티 #시술 #메이크업 #아이돌메이크업 오늘 실시간 화제
- 올리브영/무신사 랭킹, 글로우픽 리뷰
- Reddit r/SkincareAddiction, r/AsianBeauty
- 강남언니/바비톡 인기 시술
- 인스타/틱톡: 아이돌 뷰티, 셀럽 메이크업, 뷰티 트렌드, 핫한 메이크업 룩
- 유튜브: 뷰티 크리에이터 화제 영상

## 중복 금지
보톡스 가격, 울쎄라vs하이푸, 레티놀 부작용, 나이아신아마이드, 세안 골든타임 → 다뤘으니 제외

## 구성: 반드시 다양한 카테고리 믹스!
⚠️ 스킨케어/시술에만 편중 금지! 아래 배분 필수:
- 시술/스킨케어: 1~2개
- 메이크업/뷰티트렌드: 1~2개 (립, 아이, 베이스, 컨투어링, 퍼스널컬러 등)
- 아이돌/셀럽 뷰티: 1개 (아이돌 메이크업 따라하기, 셀럽 애용템, 화보 메이크업 분석 등)
- 자유 (가격반전/꿀팁/경험담): 1개

점수 기준 (8점 이상만):
- 친구태그 하고 싶나? 0-3점
- 내 돈/시간 아까워지나? 0-3점
- 결말 예측 안 되나? 0-2점
- 누구나 공감 가능? 0-2점
- 정보 수집 가능성? 0-2점 (실제 제품명/가격/후기를 웹에서 찾을 수 있는가? 구체적 제품명·시술명·가격이 있으면 +2)

⚠️ 핵심: 주제 선정 시 반드시 '검증 가능한 팩트'가 있어야 함!
- ✅ 좋은 예: "다이소 1100원 시카크림" → 실제 제품, 실제 가격, 검색 가능
- ✅ 좋은 예: "강남 물광주사 가격 비교" → 실제 시술, 실제 가격대, 후기 있음
- ✅ 좋은 예: "장원영 립 따라하기 3천원으로 가능" → 아이돌+가격반전+메이크업
- ✅ 좋은 예: "올봄 이 립 컬러 안 바르면 손해" → 트렌드+구체적 제품
- ❌ 나쁜 예: "요즘 핫한 스킨케어 루틴" → 뭐가 핫한지 모호, 팩트 없음
- ❌ 나쁜 예: "피부 좋아지는 습관" → 일반 상식, 구체성 없음

JSON만:
{
  "date":"${today}",
  "proposals":[
    {"id":1,"title":"후킹 제목 20자","category":"시술후기/제품후기/가격반전/트렌드","hook":"1장 후킹 2줄","summary":"3줄 요약","hook_score":8,"source":"출처","viral_score":8,"research_keywords":"웹 검색할 키워드 3개"},
    ...5개
  ]
}` }],
      }),
    });
    const data = await claudeRes.json();
    const text = data.content?.[0]?.text || '{}';
    const match = text.match(/\{[\s\S]*\}/);
    const proposals = match ? JSON.parse(match[0]) : null;
    if (!proposals) return res.status(200).json({ error: 'Failed' });

    await redis.set('sisuru:proposals', JSON.stringify(proposals), { ex: 86400 });
    await redis.lpush('activity:log', JSON.stringify({ agent: 'AI 크리에이터', action: '시수르더쿠 주제 5개', detail: proposals.proposals?.map(p => p.title).join(' / '), timestamp: Date.now() }));
    await redis.ltrim('activity:log', 0, 49);
    return res.status(200).json({ success: true, ...proposals });
  } catch (error) {
    console.error('[Trend]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

import { Redis } from '@upstash/redis';

export const config = { maxDuration: 120 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  // cron은 GET + auth, 수동은 POST (다시 찾기 버튼)
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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        temperature: 1.0,
        messages: [{ role: 'user', content: `오늘(${today}) 인스타그램 카드뉴스 주제를 5개 제안해줘.

채널: 시수르더쿠 (@sisru_doku) — 솔직한 뷰티/시술/성형 정보
대상: 20~35세 여성
톤: 친구처럼 솔직, 도발적, 클릭 유발

## 트렌드 소스 (이 소스들에서 지금 핫한 주제 찾아줘)

[해외]
- Reddit: r/SkincareAddiction, r/AsianBeauty, r/MakeupAddiction, r/PlasticSurgery HOT
- Quora: 뷰티/시술 인기 질문

[국내]
- X(트위터): #스킨케어 #뷰티 #피부관리 #시술 #성형
- 스레드: 뷰티/시술 인기
- 올리브영 실시간 랭킹
- 글로우픽 인기 리뷰
- 강남언니 인기 시술
- 바비톡 인기 게시글

## 주제 선정 기준
- 사람들이 '혹' 하고 진짜 궁금해할 것
- 시술/성형 부작용, 비용 비교, 의사가 숨기는 정보
- 피부과 꿀팁, 집에서 할 수 있는 관리
- 충격적 사실, 반전 정보

반드시 아래 구성으로:
- 시술/성형 관련 2개 (시술정보/성형/부작용 중)
- 뷰티/스킨케어 관련 3개 (뷰티팁/제품리뷰/트렌드/성분분석 중)

각 주제:
- id: 1~5
- title: 후킹 제목 (예: "피부과 의사가 절대 안 알려주는 것")
- category: 시술정보/성형/부작용/뷰티팁/제품리뷰/트렌드/성분분석 중 택1
- hook: 1장 후킹 텍스트 (아래 패턴 중 택1, 2줄)
  패턴: 권위+반전("피부과 의사가 절대 안 쓰는 것") / 비용 충격("100만원 시술 = 3만원짜리랑 같은 이유") / 부작용 공포("이거 같이 쓰면 피부 망함") / 내부자 폭로("에스테티션이 직접 말해주는") / 반전 결말("매일 열심히 했는데 오히려 악화된 이유") / 숫자 충격("한국 여자 10명 중 8명이 모르는 것")
  금지 단어: '추천', '좋아요', '효과적인', '놀라운', '완벽한' (광고스러운 표현 절대 금지)
  - 오늘(${today}) 기준 최신 트렌드 반영
  - 이전에 자주 쓴 표현 피하고 매번 다른 패턴 로테이션
  - 시술/성형/부작용/비용 카테고리는 반드시 구체적 수치 포함 (예: "보톡스 20만원 vs 2만원 차이가 뭔지 알아?")
- summary: 3줄 요약
- hook_score: 1-10 (클릭 유발 점수)
- source: 출처 (Reddit/올리브영/강남언니 등)

JSON만:
{
  "date": "${today}",
  "proposals": [
    {"id":1, "title":"...", "category":"...", "hook":"...", "summary":"...", "hook_score":9, "source":"..."},
    ...5개
  ]
}` }],
      }),
    });

    const data = await claudeRes.json();
    const text = data.content?.[0]?.text || '{}';
    const match = text.match(/\{[\s\S]*\}/);
    const proposals = match ? JSON.parse(match[0]) : null;
    if (!proposals) return res.status(200).json({ error: 'Trend research failed' });

    await redis.set('sisuru:proposals', JSON.stringify(proposals), { ex: 86400 });

    // Google Sheets 기록
    if (process.env.CONTENT_LOG_SHEET_ID && process.env.GOOGLE_REFRESH_TOKEN) {
      try {
        const { google } = await import('googleapis');
        const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
        auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        const sheets = google.sheets({ version: 'v4', auth });
        const rows = proposals.proposals.map(p => [today, p.category, p.title, p.hook, p.hook_score, p.source, 'proposed']);
        await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.CONTENT_LOG_SHEET_ID,
          range: 'A1',
          valueInputOption: 'RAW',
          requestBody: { values: rows },
        });
      } catch (e) { console.warn('[Trend] Sheet log failed:', e.message); }
    }

    // Activity log
    await redis.lpush('activity:log', JSON.stringify({
      agent: 'AI 크리에이터', action: '시수르더쿠 트렌드 5개 제안',
      detail: proposals.proposals?.map(p => p.title).join(' / '), timestamp: Date.now(),
    }));
    await redis.ltrim('activity:log', 0, 49);

    console.log('[Trend]', proposals.proposals?.map(p => `${p.id}. ${p.title} (${p.hook_score})`).join(' | '));
    return res.status(200).json({ success: true, ...proposals });
  } catch (error) {
    console.error('[Trend] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

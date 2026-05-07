import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { maxDuration: 120 };

const fmt = (n) => Math.round(n || 0).toLocaleString('ko-KR');

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // KST 기준 전일 날짜
    const nowKST = new Date(Date.now() + 9 * 3600000);
    const yesterday = new Date(nowKST - 86400000).toISOString().slice(0, 10);
    const thisMonth = nowKST.toISOString().slice(0, 7);
    const thisYear = nowKST.getUTCFullYear();

    // === 매출 데이터 수집 ===
    const [naverDaily, cafe24Daily, amazonData] = await Promise.all([
      redis.get('sales:naver:daily'),
      redis.get('sales:cafe24:daily'),
      redis.get(`sales:amazon:${thisMonth}`),
    ]);

    const naverMonthly = naverDaily?.monthly || {};
    const cafe24Monthly = cafe24Daily?.monthly || {};

    // 월별 집계 함수
    const monthRevenue = (data, month) => data[month]?.revenue || 0;
    const yearRevenue = (data) => Object.entries(data)
      .filter(([k]) => k.startsWith(String(thisYear)))
      .reduce((s, [, v]) => s + (v.revenue || 0), 0);

    // 한국 채널
    const krNaver = monthRevenue(naverMonthly, thisMonth);
    const krCafe24 = monthRevenue(cafe24Monthly, thisMonth);
    const krNaverYTD = yearRevenue(naverMonthly);
    const krCafe24YTD = yearRevenue(cafe24Monthly);
    const krTotal = krNaver + krCafe24;
    const krTotalYTD = krNaverYTD + krCafe24YTD;

    // 미국 채널 (Amazon)
    const usAmazon = amazonData?.monthly?.[thisMonth]?.revenue || 0;
    const usAmazonYTD = amazonData ? Object.entries(amazonData.monthly || {})
      .filter(([k]) => k.startsWith(String(thisYear)))
      .reduce((s, [, v]) => s + (v.revenue || 0), 0) : 0;

    // 전월 비교
    const prevMonth = new Date(nowKST.getUTCFullYear(), nowKST.getUTCMonth() - 1, 1).toISOString().slice(0, 7);
    const prevNaver = monthRevenue(naverMonthly, prevMonth);
    const prevCafe24 = monthRevenue(cafe24Monthly, prevMonth);
    const prevKrTotal = prevNaver + prevCafe24;
    const growthRate = prevKrTotal > 0 ? ((krTotal - prevKrTotal) / prevKrTotal * 100).toFixed(1) : null;

    // 5개월 추이 (한국)
    const trend = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(nowKST.getUTCFullYear(), nowKST.getUTCMonth() - 4 + i, 1);
      const m = d.toISOString().slice(0, 7);
      return { month: m, kr: (naverMonthly[m]?.revenue || 0) + (cafe24Monthly[m]?.revenue || 0) };
    });

    const salesSummary = {
      date: yesterday,
      korea: { naver: krNaver, cafe24: krCafe24, total: krTotal, ytd: krTotalYTD },
      usa: { amazon: usAmazon, ytd: usAmazonYTD },
      grandTotalYTD: krTotalYTD + usAmazonYTD,
      prevMonthKr: prevKrTotal,
      growthRate,
      trend,
    };

    // === Claude로 보고서 + 제안 생성 ===
    let report = '';
    if (process.env.ANTHROPIC_API_KEY) {
      const prompt = `당신은 밀리밀리(MILLIMILLI) 브랜드의 AI 커머스MD입니다.
오늘 아침 8시 일일 매출 보고서를 작성해주세요.

[${yesterday} 전일 마감 기준 매출]
■ 한국
- 네이버 스마트스토어: ${fmt(krNaver)}원 (YTD: ${fmt(krNaverYTD)}원)
- 카페24 자사몰: ${fmt(krCafe24)}원 (YTD: ${fmt(krCafe24YTD)}원)
- 한국 합계: ${fmt(krTotal)}원 (YTD: ${fmt(krTotalYTD)}원)
- 전월 동기 대비: ${growthRate !== null ? `${growthRate > 0 ? '+' : ''}${growthRate}%` : '비교불가'}

■ 미국
- Amazon: $${fmt(usAmazon)} (YTD: $${fmt(usAmazonYTD)})

■ 2026년 누적 합계: ${fmt(krTotalYTD)}원 + $${fmt(usAmazonYTD)}

[월별 한국 매출 추이]
${trend.map(t => `${t.month}: ${fmt(t.kr)}원`).join('\n')}

다음 형식으로 작성해주세요:
1. 한 줄 핵심 요약 (이모지 포함)
2. 매출 분석 (2-3문장, 특이사항/추이 분석)
3. 오늘 채널별 프로모션/광고 소재 제안 (한국/미국 각각):
   - 네이버: (오늘 날짜에 맞는 기획전/키워드/프로모션)
   - 카페24: (자사몰 프로모션)
   - Amazon: (미국 마케팅 제안)
   - 인스타그램/틱톡: (콘텐츠 소재 제안)
4. 이번 주 주요 액션 2가지

간결하고 실무적으로 작성해주세요.`;

      try {
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
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        const data = await claudeRes.json();
        report = data.content?.[0]?.text || '';
      } catch (e) {
        console.error('[Chief Report] Claude error:', e.message);
      }
    }

    const result = { report, salesSummary, date: yesterday, updatedAt: new Date().toISOString() };
    await redis.set('chief:daily-report', JSON.stringify(result), { ex: 86400 });

    console.log('[Chief Report] Generated for', yesterday, '| KR:', fmt(krTotal), '| US:', fmt(usAmazon));
    return res.status(200).json(result);
  } catch (error) {
    console.error('[Chief Report] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

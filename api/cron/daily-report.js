import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';

const anthropic = new Anthropic();
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { maxDuration: 120 };

// UTC 23:00 = KST 08:00 — 전 에이전트 일일 아침 보고
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600000);
  const today = kstNow.toISOString().slice(0, 10);

  try {
    const [naverDaily, cafe24Daily, publishLog, inboxLog, commentTotal, dmTotal] = await Promise.all([
      redis.get('sales:naver:daily'),
      redis.get('sales:cafe24:daily'),
      redis.get(`publish-log:${today}`),
      redis.get(`inbox-log:${today}`),
      redis.get('stat:comment:total'),
      redis.get('stat:dm:total'),
    ]);

    const thisMonth = kstNow.toISOString().slice(0, 7);
    const thisYear = String(kstNow.getUTCFullYear());

    const cafe24Month = cafe24Daily?.monthly?.[thisMonth]?.revenue || 0;
    const naverMonth = naverDaily?.monthly?.[thisMonth]?.revenue || 0;
    const cafe24YTD = Object.entries(cafe24Daily?.monthly || {}).filter(([k]) => k.startsWith(thisYear)).reduce((s, [, v]) => s + (v.revenue || 0), 0);
    const naverYTD = Object.entries(naverDaily?.monthly || {}).filter(([k]) => k.startsWith(thisYear)).reduce((s, [, v]) => s + (v.revenue || 0), 0);

    const pLogs = Array.isArray(publishLog) ? publishLog : [];
    const publishCount = pLogs.length;
    const commentCount = Number(commentTotal) || 0;
    const dmCount = Number(dmTotal) || 0;
    const fmt = (n) => Math.round(n || 0).toLocaleString('ko-KR');

    const agentDefs = [
      {
        id: 'creator',
        name: 'AI 크리에이터',
        prompt: `오늘(${today}) AI 크리에이터 일일 보고를 2-3줄로 작성. 발행 ${publishCount}건. 핵심 수치 → 특이사항 순으로.`,
        data: { publishCount },
      },
      {
        id: 'community',
        name: 'AI 커뮤니티',
        prompt: `오늘(${today}) AI 커뮤니티 일일 보고를 2-3줄로 작성. 댓글 응대 ${commentCount}건, DM ${dmCount}건.`,
        data: { commentCount, dmCount },
      },
      {
        id: 'cs',
        name: 'AI CS매니저',
        prompt: `오늘(${today}) AI CS 일일 보고를 2-3줄로 작성. 카카오채널 미연결 상태. 연결 필요성 간결하게 보고.`,
        data: {},
      },
      {
        id: 'marketer',
        name: 'AI 마케터',
        prompt: `오늘(${today}) AI 마케터 일일 보고를 2-3줄로 작성. 네이버/Meta 광고 API 미연결. 연결 시 제공 가능 지표(ROAS, CPA) 안내.`,
        data: {},
      },
      {
        id: 'commerce',
        name: 'AI 커머스MD',
        prompt: `오늘(${today}) AI 커머스MD 일일 보고를 2-3줄로 작성. 카페24 ${thisMonth} 매출 ${fmt(cafe24Month)}원(YTD ${fmt(cafe24YTD)}원), 스마트스토어 ${fmt(naverMonth)}원(YTD ${fmt(naverYTD)}원). 채널별 현황 → 제안.`,
        data: { cafe24Month, naverMonth, cafe24YTD, naverYTD },
      },
      {
        id: 'management',
        name: 'AI 경영지원',
        prompt: `오늘(${today}) AI 경영지원 일일 보고를 2-3줄로 작성. 수출바우처/정부지원 모니터링 이상 없음 기준으로.`,
        data: {},
      },
      {
        id: 'brand',
        name: 'AI 랭킹&리뷰',
        prompt: `오늘(${today}) AI 랭킹&리뷰 일일 보고를 2-3줄로 작성. 올리브영 시트 연동 상태. 랭킹 변동 특이사항 없으면 "변동 없음" 보고.`,
        data: {},
      },
      {
        id: 'export',
        name: 'AI 수출',
        prompt: `오늘(${today}) AI 수출 일일 보고를 2-3줄로 작성. Amazon SP-API 연결됨. 이번달 판매 현황 및 특이사항.`,
        data: {},
      },
      {
        id: 'chief',
        name: 'Chief AI',
        prompt: `오늘(${today}) Chief AI 일일 종합 보고를 3-4줄로 작성. 한국 채널: 카페24 ${fmt(cafe24Month)}원 + 스마트스토어 ${fmt(naverMonth)}원. 콘텐츠 발행 ${publishCount}건, 댓글응대 ${commentCount}건. 형식: 핵심지표 → 주목사항 → 오늘 우선순위.`,
        data: { cafe24Month, naverMonth, publishCount, commentCount },
      },
    ];

    const results = {};
    for (const ag of agentDefs) {
      try {
        const resp = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{ role: 'user', content: ag.prompt }],
        });
        const record = {
          agentId: ag.id,
          name: ag.name,
          report: resp.content[0]?.text || '',
          data: ag.data,
          generatedAt: now.toISOString(),
          date: today,
        };
        await redis.set(`agent:report:${ag.id}:${today}`, record, { ex: 86400 * 2 });
        results[ag.id] = record;
      } catch (e) {
        results[ag.id] = { agentId: ag.id, error: e.message };
      }
    }

    // 기존 chief:daily-report 호환
    if (results.chief?.report) {
      await redis.set('chief:daily-report', {
        date: today,
        report: results.chief.report,
        salesSummary: { korea: { total: cafe24Month + naverMonth }, usa: { amazon: 0 } },
        generatedAt: now.toISOString(),
      }, { ex: 86400 * 2 });
    }

    return res.status(200).json({ success: true, date: today, agents: Object.keys(results) });
  } catch (error) {
    console.error('[Daily Report]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

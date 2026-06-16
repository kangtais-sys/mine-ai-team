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
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://mine-ai-team.vercel.app';

    const [naverDaily, cafe24Daily, publishLog, inboxLog, commentTotal, dmTotal, metaCache, exportData] = await Promise.all([
      redis.get('sales:naver:daily'),
      redis.get('sales:cafe24:daily'),
      redis.get(`publish-log:${today}`),
      redis.get(`inbox-log:${today}`),
      redis.get('stat:comment:total'),
      redis.get('stat:dm:total'),
      // Redis 캐시에서 Meta 데이터 읽기 (marketer.js가 매 조회 시 캐시 갱신)
      redis.get('marketer:meta:cache'),
      // 수출 API — B2B 바이어 데이터
      fetch(`${baseUrl}/api/agents/export`).then(r => r.json()).catch(() => null),
    ]);

    // marketerData 구성: 캐시 신선도 체크 → 2시간 이상 됐거나 오류 상태면 fresh call
    let marketerData = null;
    const parsedMetaCache = metaCache ? (typeof metaCache === 'string' ? JSON.parse(metaCache) : metaCache) : null;
    const cacheAgeMs = parsedMetaCache?.cachedAt ? Date.now() - new Date(parsedMetaCache.cachedAt).getTime() : Infinity;
    const cacheStale = cacheAgeMs > 2 * 3600 * 1000; // 2시간 초과
    const cacheError = parsedMetaCache?.status === 'disconnected' || parsedMetaCache?.status === 'error';

    if (parsedMetaCache && !cacheStale && !cacheError) {
      // 신선하고 정상 캐시 사용
      marketerData = { meta: parsedMetaCache };
    } else {
      // 캐시 없음 / 오래됨 / 오류 → 실시간 조회
      try {
        marketerData = await fetch(`${baseUrl}/api/agents/marketer`).then(r => r.json());
      } catch {
        // 실시간 조회도 실패 → 캐시라도 사용 (오류 명시)
        if (parsedMetaCache) marketerData = { meta: { ...parsedMetaCache, _stale: true } };
      }
    }

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
      (() => {
        const meta = marketerData?.meta;
        const metaConnected = meta?.status === 'connected';
        let marketerPrompt;
        if (metaConnected && meta.totalSpendYesterday > 0) {
          const fmt2 = (n) => Math.round(n || 0).toLocaleString('ko-KR');
          const roasYday = meta.totalRevenueYesterday > 0 && meta.totalSpendYesterday > 0
            ? (meta.totalRevenueYesterday / meta.totalSpendYesterday).toFixed(2) : '-';
          const roasMonth = meta.totalRevenueMonth > 0 && meta.totalSpendMonth > 0
            ? (meta.totalRevenueMonth / meta.totalSpendMonth).toFixed(2) : '-';
          marketerPrompt = `오늘(${today}) AI 마케터 일일 보고를 2-3줄로 작성. Meta 광고 연결됨. 전일 광고비 ${fmt2(meta.totalSpendYesterday)}원, 전일 매출 ${fmt2(meta.totalRevenueYesterday)}원(ROAS ${roasYday}), 당월 광고비 ${fmt2(meta.totalSpendMonth)}원 / 매출 ${fmt2(meta.totalRevenueMonth)}원(ROAS ${roasMonth}). 계정별 특이사항 있으면 언급. 핵심 수치 → 제안 순으로.`;
        } else if (metaConnected) {
          marketerPrompt = `오늘(${today}) AI 마케터 일일 보고를 2-3줄로 작성. Meta 광고 연결됨. 전일 실적 데이터 없음(캠페인 미집행 또는 집계 대기). 당월 누적: 광고비 ${fmt(meta?.totalSpendMonth || 0)}원.`;
        } else {
          // 오류 상태일 때 — 오래된 캐시인지 실제 오류인지 구분해서 보고
          const staleNote = meta?._stale ? '(캐시 기준, 실시간 조회 실패)' : '';
          marketerPrompt = `오늘(${today}) AI 마케터 일일 보고를 2-3줄로 작성. Meta 광고 API 상태 확인 필요${staleNote}. 전일 데이터 미수신. 토큰 만료 또는 API 이슈 가능성 있음 — 직접 Meta 대시보드에서 실적 확인 권장. 재연결 방법: Vercel 환경변수 META_ACCESS_TOKEN 갱신.`;
        }
        return { id: 'marketer', name: 'AI 마케터', prompt: marketerPrompt, data: { metaConnected, spend: meta?.totalSpendYesterday, revenue: meta?.totalRevenueYesterday } };
      })(),
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
      (() => {
        const exp = exportData;
        const pipeline = exp?.buyerPipeline || {};
        const totalExport = exp?.exports?.totalAmount || 0;
        const buyerCount = exp?.byBuyer?.length || 0;
        const exportPrompt = `오늘(${today}) AI 수출(B2B) 일일 보고를 2-3줄로 작성. 수출 총액 ${fmt(totalExport)}원, 거래 바이어 ${buyerCount}개사. 파이프라인: DB ${pipeline.db || 0}→1차메일 ${pipeline.firstMail || 0}→답장 ${pipeline.replied || 0}→샘플 ${pipeline.sample || 0}→제안서 ${pipeline.proposal || 0}→계약 ${pipeline.contract || 0}. 진행 중인 특이사항 있으면 언급.`;
        return { id: 'export', name: 'AI 수출', prompt: exportPrompt, data: { totalExport, buyerCount, pipeline } };
      })(),
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
          model: 'claude-sonnet-4-6',
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

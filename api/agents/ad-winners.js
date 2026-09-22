// GET /api/agents/ad-winners — 소재(광고) 단위 성과. 콘텐츠팀이 "뭐가 팔렸나"를 보는 원천 데이터.
//
// 쿼리: ?market=kr|us|jp|all  ?minSpend=  ?top=  ?preset=last_30d|last_7d|…  ?debug=1
//
// 집계 규칙 (틀리기 쉬운 지점이라 명시):
//   revenue   = action_values 中 purchase 합 (매출)   ← actions(건수) 아님. ad-optimize 가 이걸 틀렸었음
//   purchases = actions 中 purchase 합 (건수)
//   roas      = revenue / spend
//   cvr       = purchases / clicks * 100
//   ⚠️ roas·cvr 은 attribution==='pixel' 계정에서만 의미가 있다. 아마존/트래픽 계정은 구조적으로 0 →
//      measurable:false 로 표시하고 위너 판정에서 제외. 0 을 "나쁜 소재"로 읽으면 안 됨.
//
// 성능: 예전엔 계정마다 /ads 를 12페이지까지 긁어 썸네일 맵을 만들었음(US 계정 광고 643개 → 한없이 느림).
//       지금은 인사이트 먼저 → 상위 N 만 골라 → 그 ad_id 만 배치 조회(1콜). 계정 9개로 늘려도 버팀.
import { resolveAdAccounts } from '../_adAccounts.js';
import { getUsdRates, toUsd } from '../utils/fx.js';

export const config = { maxDuration: 120 };

const GRAPH = 'https://graph.facebook.com/v19.0';
const ROAS_TARGET = Number(process.env.ROAS_TARGET) || 3.0; // 전환 300%

// 우선순위 타입 중 존재하는 첫 타입만 합산(중복 집계 방지)
// 구매를 목표로 하는 캠페인 목표만 ROAS 판정 대상.
// ⚠️ 귀속 여부는 계정 단위로만 정하면 안 된다 — 자사몰 계정(인하우스) 안에도 트래픽 캠페인
//    (협력_올영세일_트래픽 등)이 같이 산다. 이들은 구매를 잡지 않으므로 ROAS 0 이 정상인데
//    계정만 보고 판정하면 "실패한 소재"로 오인된다. (2026-09-22 라이브에서 실제로 발생)
const SALES_OBJECTIVES = new Set([
  'OUTCOME_SALES', 'CONVERSIONS', 'PRODUCT_CATALOG_SALES', 'OUTCOME_LEADS', 'LEAD_GENERATION',
]);

const PURCHASE_TYPES = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'];
function sumPurchase(arr) {
  if (!Array.isArray(arr)) return 0;
  for (const t of PURCHASE_TYPES) {
    const hits = arr.filter(a => a.action_type === t);
    if (hits.length) return hits.reduce((s, a) => s + Number(a.value || 0), 0);
  }
  return 0;
}

// Meta 는 이런 지표를 [{action_type, value}] 배열로 준다. 총합만 필요.
const sumAll = (arr) => Array.isArray(arr) ? arr.reduce((s, a) => s + Number(a.value || 0), 0) : 0;
const pct = (num, den, d = 2) => (den > 0 ? Number((num / den * 100).toFixed(d)) : null);

async function fetchJson(url) {
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d;
}

// Meta 는 지표 필드를 주기적으로 폐기한다(예: video_3_sec_watched_actions 가 v19 에서 제거).
// 필드 하나가 죽으면 요청 전체가 (#100) 으로 거부돼 리포트가 통째로 빈다.
// → 거부된 필드명을 에러에서 뽑아 빼고 재시도. 어떤 지표가 사라졌는지는 droppedFields 로 표면화.
async function fetchInsights(makeUrl, fields, maxDrops = 8) {
  let f = [...fields];
  const dropped = [];
  for (let i = 0; i <= maxDrops; i++) {
    try {
      return { data: await fetchJson(makeUrl(f.join(','))), dropped };
    } catch (e) {
      const m = /\(#100\)\s*([A-Za-z0-9_]+)\s+is not valid for fields param/i.exec(e.message || '');
      const bad = m?.[1];
      if (!bad || !f.includes(bad)) throw e;
      f = f.filter(x => x !== bad);
      dropped.push(bad);
    }
  }
  throw new Error(`유효하지 않은 필드가 너무 많음: ${dropped.join(', ')}`);
}

// 선택된 ad_id 들의 썸네일만 배치 조회. Graph 의 ?ids= 는 50개까지라 청크로 나눔.
async function fetchThumbs(adIds, token) {
  const out = {};
  for (let i = 0; i < adIds.length; i += 50) {
    const chunk = adIds.slice(i, i + 50);
    try {
      const d = await fetchJson(
        `${GRAPH}/?ids=${chunk.join(',')}&fields=creative{thumbnail_url,image_url}&access_token=${token}`
      );
      for (const [id, ad] of Object.entries(d || {})) {
        const c = ad?.creative || {};
        out[id] = c.thumbnail_url || c.image_url || null;
      }
    } catch { /* 썸네일 실패는 성과 데이터를 막지 않는다 */ }
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const token = process.env.META_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return res.status(200).json({ status: 'disconnected', message: 'META_ACCESS_TOKEN 또는 INSTAGRAM_ACCESS_TOKEN 필요', ads: [], winners: [] });

  const q = req.query || {};
  const marketArg = String(q.market || '').toLowerCase();
  const markets = !marketArg || marketArg === 'all' ? undefined : marketArg.split(',').filter(Boolean);
  const minSpend = q.minSpend != null ? Number(q.minSpend) : 10000;
  const topN = Number(q.top) || 30;
  const preset = String(q.preset || 'last_30d');

  const accounts = resolveAdAccounts({ markets });
  // 콘텐츠 지표(노출→클릭 구간 = 소재가 실제로 통제하는 영역)를 함께 수집.
  //   video_play_actions          영상 재생
  //   video_3_sec_watched_actions 3초 시청 → 훅률(3초/노출)의 분자. CLAUDE.md "3초 후킹" 규칙의 실측판
  //   video_thruplay_watched_actions  15초 or 완주 → 유지율(thruplay/3초)의 분자
  //   video_p50/p100_watched_actions  중간·완주 지점 이탈 파악
  //   outbound_clicks / _ctr      외부(아마존·자사몰)로 실제 나간 클릭. 프로필 클릭 등 제외돼 clicks 보다 정확
  //   quality_ranking 등          같은 타겟을 두고 경쟁한 타사 소재 대비 상대 순위 ← 절대선 없이도 판정 가능
  // ⚠️ 3초 시청은 전용 필드(video_3_sec_watched_actions)가 폐기됨 → actions 의 'video_view'
  //    액션 타입이 그 자리를 대신한다(Meta 정의상 3초 재생). 아래 hookRate 가 이걸 쓴다.
  const fields = [
    'ad_id', 'ad_name', 'campaign_name', 'objective', 'account_currency',
    'spend', 'impressions', 'clicks', 'ctr', 'cpc',
    'actions', 'action_values',
    'video_play_actions', 'video_thruplay_watched_actions',
    'video_p50_watched_actions', 'video_p100_watched_actions', 'video_avg_time_watched_actions',
    'outbound_clicks', 'outbound_clicks_ctr',
    'quality_ranking', 'engagement_rate_ranking', 'conversion_rate_ranking',
  ];

  try {
    const [fx, perAccount] = await Promise.all([
      getUsdRates(),
      Promise.all(accounts.map(async (acc) => {
        try {
          const makeUrl = (f) =>
            `${GRAPH}/act_${acc.id}/insights?level=ad&date_preset=${encodeURIComponent(preset)}&fields=${f}&limit=500&access_token=${token}`;
          const { data: ins, dropped } = await fetchInsights(makeUrl, fields);
          return { acc, rows: ins.data || [], dropped };
        } catch (e) {
          return { acc, rows: [], error: e.message };
        }
      })),
    ]);

    const errors = perAccount.filter(p => p.error).map(p => ({ account: p.acc.name, id: p.acc.id, error: p.error }));
    // Meta 가 폐기해 빠진 지표 — 조용히 사라지면 "값이 0" 과 구분이 안 되므로 응답에 드러낸다.
    const droppedFields = [...new Set(perAccount.flatMap(p => p.dropped || []))];

    // 계정 × 소재 평탄화
    const all = [];
    for (const { acc, rows } of perAccount) {
      const acctMeasurable = acc.attribution === 'pixel';
      for (const row of rows) {
        const objective = row.objective || null;
        // 계정이 픽셀 귀속이어도 캠페인 목표가 구매가 아니면 ROAS 판정 불가.
        // objective 를 못 받은 경우(필드 누락)엔 계정 기준을 따른다.
        const measurable = acctMeasurable && (objective ? SALES_OBJECTIVES.has(objective) : true);
        const spend = Number(row.spend) || 0;
        const clicks = Number(row.clicks) || 0;
        const currency = row.account_currency || 'KRW';
        const revenue = sumPurchase(row.action_values);
        const purchases = sumPurchase(row.actions);
        const roas = measurable && spend > 0 ? Number((revenue / spend).toFixed(2)) : null;
        const cpc = row.cpc != null ? Number(Number(row.cpc).toFixed(2)) : (clicks > 0 ? Number((spend / clicks).toFixed(2)) : null);
        all.push({
          accountId: acc.id, account: acc.name, market: acc.market,
          attribution: acc.attribution, dest: acc.dest, measurable,
          ad_id: row.ad_id, ad_name: row.ad_name, campaign: row.campaign_name, objective,
          currency,
          spend: Math.round(spend), spendUsd: toUsd(spend, currency, fx.rates),
          impressions: Number(row.impressions) || 0,
          clicks,
          ctr: row.ctr != null ? Number(Number(row.ctr).toFixed(2)) : null,
          cpc, cpcUsd: cpc != null ? toUsd(cpc, currency, fx.rates) : null,
          revenue: measurable ? Math.round(revenue) : null,
          purchases: measurable ? purchases : null,
          roas,
          cvr: measurable && clicks > 0 ? Number((purchases / clicks * 100).toFixed(2)) : null,
          // 300% 판정. 귀속 안 되는 계정은 '측정불가' — 절대 'lose' 로 찍지 말 것.
          verdict: !measurable ? 'unmeasured' : roas == null ? 'unmeasured' : roas >= ROAS_TARGET ? 'win' : 'lose',

          // ── 콘텐츠 지표 (노출→클릭. 소재가 통제하는 구간) ──
          content: (() => {
            const impressions = Number(row.impressions) || 0;
            // 'video_view' 액션 = Meta 정의상 3초 재생(폐기된 전용 필드의 대체).
            const v3 = (row.actions || []).filter(a => a.action_type === 'video_view')
              .reduce((s, a) => s + Number(a.value || 0), 0);
            const thru = sumAll(row.video_thruplay_watched_actions);
            const p50 = sumAll(row.video_p50_watched_actions);
            const p100 = sumAll(row.video_p100_watched_actions);
            const plays = sumAll(row.video_play_actions);
            // ⚠️ outbound_clicks_ctr 도 [{action_type,value}] 배열이다. Number(배열)=NaN 이 되므로 sumAll 필수.
            const outbound = sumAll(row.outbound_clicks);
            const outboundCtrRaw = sumAll(row.outbound_clicks_ctr);
            const isVideo = plays > 0 || v3 > 0;
            // 분모가 너무 작으면 비율이 폭주한다(실측: 3초시청 10회 · 클릭 50회 → 본→클릭 500%).
            // 그런 값은 "성과가 좋다"가 아니라 "모수가 없다" → null 로 두고 화면에서 —로 표시.
            const MIN_DEN = 100;
            const ratio = (num, den) => (den >= MIN_DEN ? pct(num, den) : null);
            return {
              isVideo,
              hookRate: isVideo ? ratio(v3, impressions) : null, // 3초 시청 / 노출 — 스크롤을 멈췄나
              holdRate: isVideo ? ratio(thru, v3) : null,        // ThruPlay / 3초 — 끝까지 봤나
              midRate: isVideo ? ratio(p50, v3) : null,          // 절반 지점 생존
              finishRate: isVideo ? ratio(p100, v3) : null,      // 완주
              avgWatchSec: isVideo ? Number(sumAll(row.video_avg_time_watched_actions).toFixed(1)) || null : null,
              outboundClicks: outbound || null,
              outboundCtr: outboundCtrRaw > 0 ? Number(outboundCtrRaw.toFixed(2))
                : (outbound ? pct(outbound, impressions) : null),
              clickFromView: isVideo ? ratio(outbound, v3) : null, // 본 사람 중 몇 %가 눌렀나
              lowSample: isVideo && v3 < MIN_DEN,                  // 표본 부족 — 판정 보류 근거
              // Meta 가 같은 타겟 경쟁 소재와 비교해준 상대 순위. 절대선이 없어도 판정 가능.
              qualityRank: row.quality_ranking || null,
              engagementRank: row.engagement_rate_ranking || null,
              conversionRank: row.conversion_rate_ranking || null,
            };
          })(),
        });
      }
    }

    const significant = all.filter(a => a.spend >= minSpend);
    // 측정 가능한 건 ROAS 내림차순, 나머지는 지출 내림차순(클릭 효율은 화면에서 cpc 로 정렬)
    significant.sort((a, b) => {
      if (a.measurable !== b.measurable) return a.measurable ? -1 : 1;
      if (a.measurable) return (b.roas ?? -1) - (a.roas ?? -1);
      return b.spend - a.spend;
    });
    const ads = significant.slice(0, topN);

    // 썸네일은 최종 선별분만
    const thumbs = await fetchThumbs(ads.map(a => a.ad_id).filter(Boolean), token);
    for (const a of ads) a.thumbnail_url = thumbs[a.ad_id] || null;

    // 계정 요약 (통화가 섞이므로 합산은 USD 로만)
    const summary = accounts.map(acc => {
      const rows = all.filter(a => a.accountId === acc.id);
      const spendUsd = rows.reduce((s, r) => s + (r.spendUsd || 0), 0);
      const clicks = rows.reduce((s, r) => s + r.clicks, 0);
      const revenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
      return {
        id: acc.id, name: acc.name, market: acc.market, attribution: acc.attribution, dest: acc.dest,
        currency: rows[0]?.currency || null,
        ads: rows.length,
        measurableAds: rows.filter(r => r.measurable).length, // 계정이 픽셀이어도 트래픽 캠페인은 빠짐
        clicks,
        spendUsd: Number(spendUsd.toFixed(2)),
        cpcUsd: clicks > 0 ? Number((spendUsd / clicks).toFixed(3)) : null,
        revenueNative: acc.attribution === 'pixel' ? Math.round(revenue) : null,
        measurable: acc.attribution === 'pixel',
      };
    });

    const payload = {
      status: 'connected',
      period: preset, minSpend, roasTarget: ROAS_TARGET,
      fx: { source: fx.source, usdKrw: fx.rates?.KRW ?? null, at: fx.at },
      accountsQueried: accounts.length,
      counts: {
        total: all.length,
        significant: significant.length,
        measurable: significant.filter(a => a.measurable).length,
        win: significant.filter(a => a.verdict === 'win').length,
        lose: significant.filter(a => a.verdict === 'lose').length,
        unmeasured: significant.filter(a => a.verdict === 'unmeasured').length,
      },
      summary,
      ads,
      // 하위호환 — 기존 호출부가 기대하던 키(측정 가능한 위너만)
      winners: ads.filter(a => a.verdict === 'win'),
      ...(droppedFields.length ? { droppedFields } : {}),
      ...(errors.length ? { accountErrors: errors } : {}),
    };
    if (q.debug === '1') payload.accountsList = accounts;
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ status: 'error', error: e.message, ads: [], winners: [] });
  }
}

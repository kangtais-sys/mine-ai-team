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

async function fetchJson(url) {
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d;
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
  const fields = 'ad_id,ad_name,campaign_name,objective,account_currency,spend,impressions,clicks,ctr,cpc,actions,action_values';

  try {
    const [fx, perAccount] = await Promise.all([
      getUsdRates(),
      Promise.all(accounts.map(async (acc) => {
        try {
          const url = `${GRAPH}/act_${acc.id}/insights?level=ad&date_preset=${encodeURIComponent(preset)}&fields=${fields}&limit=500&access_token=${token}`;
          const ins = await fetchJson(url);
          return { acc, rows: ins.data || [] };
        } catch (e) {
          return { acc, rows: [], error: e.message };
        }
      })),
    ]);

    const errors = perAccount.filter(p => p.error).map(p => ({ account: p.acc.name, id: p.acc.id, error: p.error }));

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
      ...(errors.length ? { accountErrors: errors } : {}),
    };
    if (q.debug === '1') payload.accountsList = accounts;
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ status: 'error', error: e.message, ads: [], winners: [] });
  }
}

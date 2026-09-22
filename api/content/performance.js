// GET /api/content/performance — 성과 화면 전용. docs/content-team-design.md
//
// ad-winners(원천 지표) 위에 분류(_assetCode)와 판정(gradeContent)을 얹어 화면이 바로 쓸 형태로 낸다.
// 프런트에 판정 규칙을 두지 않는 이유: 기준선이 바뀔 때 화면을 고치면 규칙이 두 군데로 흩어진다.
//
// 쿼리: ?market=kr|us|all  ?preset=last_30d  ?minSpend=

import { Redis } from '@upstash/redis';
import { parseAssetCode, gradeContent, THRESHOLDS, GRADE_META, AXES } from '../_assetCode.js';
import { CACHE_KEY } from './backfill.js';

export const config = { maxDuration: 120 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const avg = (arr) => {
  const v = arr.filter(x => x != null);
  return v.length ? Number((v.reduce((s, x) => s + x, 0) / v.length).toFixed(1)) : null;
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const q = req.query || {};
  const market = String(q.market || 'all');
  const preset = String(q.preset || 'last_30d');
  const minSpend = q.minSpend != null ? Number(q.minSpend) : 10000;

  // 같은 배포 안의 ad-winners 를 HTTP 로 다시 부르면 콜드스타트가 두 번 붙는다 → 핸들러 직접 호출.
  const { default: adWinners } = await import('../agents/ad-winners.js');
  const inner = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  await adWinners({ method: 'GET', query: { market, preset, minSpend: String(minSpend), top: '500' } }, inner);
  const src = inner.body || {};
  if (src.status === 'error' || src.status === 'disconnected') return res.status(200).json({ ...src, ads: [] });

  // LLM 백필 결과를 얹는다. 이름 정규식이 읽어낸 값이 우선 — 명시 토큰(MM-AMP-BA)이 추론보다 확실하다.
  // 백필은 **비어 있는 축만** 채운다.
  let classified = {};
  try { classified = (await redis.hgetall(CACHE_KEY)) || {}; } catch { /* 캐시 없어도 화면은 떠야 함 */ }

  const ads = (src.ads || []).map(a => {
    const parsed = parseAssetCode(a.ad_name, { market: a.market, isVideo: a.content?.isVideo });
    const c = !parsed.coded ? classified[a.ad_id] : null;
    const code = c
      ? {
          ...parsed,
          product: parsed.product ?? c.product ?? null,
          angle: parsed.angle ?? c.angle ?? null,
          hook: parsed.hook ?? c.hook ?? null,
          filledBy: 'llm', confidence: c.confidence ?? null,
        }
      : parsed;
    const g = gradeContent(a.content, a);
    return {
      ...a, code,
      grade: g.grade, gradeReason: g.reason, fix: g.fix || null, parts: g.parts,
      unclassified: !code.coded && (!code.product || !code.angle || !code.hook),
    };
  });

  const video = ads.filter(a => a.content?.isVideo);
  const tally = (key) => ads.reduce((m, a) => (m[a[key] ?? '기타'] = (m[a[key] ?? '기타'] || 0) + 1, m), {});

  // ── 위너 매트릭스: 제품 × 앵글 ──
  // 정적 소재도 CTR 로 판정되므로 영상만 보지 않는다.
  // (MM- 체계 소재 63건 중 영상은 12건뿐 — 영상만 보면 실제 집행분의 80%가 매트릭스에서 빠진다.)
  const cell = new Map();
  for (const a of ads) {
    const p = a.code.product, ang = a.code.angle;
    if (!p || !ang) continue;                       // 미분류는 매트릭스 오염 방지 위해 제외
    const k = `${a.market}|${p}|${ang}`;
    if (!cell.has(k)) cell.set(k, []);
    cell.get(k).push(a);
  }
  const matrix = [...cell.entries()].map(([k, list]) => {
    const [mk, product, angle] = k.split('|');
    const graded = list.filter(a => a.grade !== 'n/a');
    return {
      market: mk, product, angle, n: list.length,
      win: graded.filter(a => a.grade === 'win').length,
      drop: graded.filter(a => a.grade === 'drop').length,
      passRate: graded.length ? Math.round(graded.filter(a => a.grade === 'win').length / graded.length * 100) : null,
      videos: list.filter(a => a.content?.isVideo).length,
      avgHook: avg(list.map(a => a.content?.hookRate)),
      avgHold: avg(list.map(a => a.content?.holdRate)),
      avgClick: avg(list.map(a => a.content?.clickFromView)),
      avgCtr: avg(list.map(a => a.ctr)),          // 정적 소재의 유일한 판정 지표
    };
  }).sort((a, b) => (b.win - a.win) || ((b.avgCtr ?? -1) - (a.avgCtr ?? -1)));

  // ── 시리즈(문법 계열)별 요약 ──
  const bySeries = new Map();
  for (const a of video) {
    const s = a.code.series || '미분류';
    if (!bySeries.has(s)) bySeries.set(s, []);
    bySeries.get(s).push(a);
  }
  const series = [...bySeries.entries()].map(([name, list]) => ({
    name, n: list.length,
    win: list.filter(a => a.grade === 'win').length,
    remix: list.filter(a => a.grade === 'remix').length,
    drop: list.filter(a => a.grade === 'drop').length,
    avgHook: avg(list.map(a => a.content?.hookRate)),
    avgHold: avg(list.map(a => a.content?.holdRate)),
    avgClick: avg(list.map(a => a.content?.clickFromView)),
  })).sort((a, b) => (b.avgHook ?? -1) - (a.avgHook ?? -1));

  // 처방별 작업 큐 — "지금 뭘 손보면 되나"
  const queue = { hook: [], body: [], endcard: [], angle: [] };
  for (const a of ads) if (a.fix) queue[a.fix].push({ ad_id: a.ad_id, ad_name: a.ad_name, market: a.market, thumbnail_url: a.thumbnail_url, reason: a.gradeReason });

  return res.status(200).json({
    status: 'connected',
    period: src.period, minSpend, fx: src.fx,
    thresholds: THRESHOLDS, gradeMeta: GRADE_META, axes: AXES,
    counts: {
      total: ads.length, video: video.length,
      ...tally('grade'),
      unclassified: ads.filter(a => a.unclassified).length,
    },
    queue: Object.fromEntries(Object.entries(queue).map(([k, v]) => [k, { n: v.length, items: v.slice(0, 12) }])),
    matrix, series, ads,
    accountErrors: src.accountErrors || [],
    droppedFields: src.droppedFields || [],
  });
}

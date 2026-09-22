// GET /api/content/types — 이미지형·영상형 × 소재 유형을 한눈에.
//
// 정본은 소재로그 시트다(US 140 · KR 66). 내가 만든 분류가 아니라
// 담당자·Cowork 가 이미 206건을 굴리고 있는 축(대카·소카)을 그대로 쓴다.
//   MM-{시장}-{제품}-{대카}-{소카}-{날짜}-{순번}
//   대카 = 소재 컨셉(BA/GLA/CLI/ING/AUT/PRO/INS…) · 소카 = 샷 타입(CLOSE/WIDE/DRY/MACRO/MIRROR…)
//
// 성과는 Meta 에서 온다. 조인키 = 시트 `Meta광고이름`(= `소재ID`) ↔ Meta `ad_name`.
//
// ⚠️ '미집행' 을 성과 0 으로 읽지 말 것. 실측 206건 중 실제로 도는 건 37건(18%)뿐이다.
//    만들었는데 안 돌린 소재가 82% — 이건 소재 품질 문제가 아니라 운영 문제다.

import { Redis } from '@upstash/redis';
import { readSheet } from '../utils/sheets.js';
import { gradeContent, STATIC_THRESHOLDS, THRESHOLDS } from '../_assetCode.js';

export const config = { maxDuration: 300 };

// 시트 2개 + Meta 700건을 매번 긁으면 35초가 걸린다 — 화면이 못 견딘다.
// 소재로그는 하루 단위로 갱신되고 Meta 성과도 실시간일 필요가 없어 30분 캐시로 충분.
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});
const CACHE_TTL = 1800;

const SHEETS = {
  us: { id: process.env.CREATIVE_LOG_US_SHEET_ID || '1TT130QL2nJbbbpMJrM1pTAAP5TpTgM9n6wXt-ZcKdm4', name: 'MM_소재로그_LIVE' },
  kr: { id: process.env.CREATIVE_LOG_KR_SHEET_ID || '1nE-4IBpl7l6nY1UGwBrFGsfopFdOJY8RUC9pDADPDuk', name: 'MM_소재로그_KR_LIVE' },
};

// 대카 코드 → 사람이 읽는 이름. 시트 실측값 기준(없는 코드는 코드 그대로 노출).
const CONCEPT = {
  BA: '비포&애프터', GLA: '글래스스킨', CLI: '임상 수치', ING: '성분·메커니즘',
  AUT: '권위·랭킹', PRO: '프로모·오퍼', INS: '인서트', MAC: '매크로',
  TOP: '상단 배치', BLK: '블랙 배경', PAN: '패닝', SGL: '단독컷', RAVE: '리뷰 반응',
  OYMST: '올리브영 미스트', OYAMP: '올리브영 앰플', OYSET: '올리브영 세트',
};
const SHOT = {
  CLOSE: '클로즈업', WIDE: '와이드', DRY: '건조 대비', MACRO: '매크로', MIRROR: '미러 분할',
  PORE: '모공', SCAN: '스캔·진단', VALUE: '가격 소구', COUNT: '개수', WET: '수분',
  SMILE: '팔자', FILLER: '필러 대비', GLASSKIN: '글래스스킨',
};

const norm = (s) => String(s || '').replace(/^\[AUTO\]\s*/i, '').trim();
const col = (H, p) => H.findIndex(h => String(h || '').trim().startsWith(p));
const avg = (a) => { const v = a.filter(x => x != null); return v.length ? Number((v.reduce((s, x) => s + x, 0) / v.length).toFixed(1)) : null; };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const q = req.query || {};
  const cacheKey = `content:types:v1:${q.market || 'all'}:${q.preset || 'last_90d'}`;

  try {
    if (q.refresh !== '1') {
      try {
        const hit = await redis.get(cacheKey);
        if (hit) return res.status(200).json({ ...hit, cached: true });
      } catch { /* 캐시 실패는 조회로 폴백 */ }
    }

    // Meta 실측
    const { default: adWinners } = await import('../agents/ad-winners.js');
    const inner = { status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
    await adWinners({ method: 'GET', query: { market: 'all', minSpend: '0', top: '1000', preset: String(q.preset || 'last_90d') } }, inner);
    const ads = inner.body?.ads || [];
    const adBy = new Map();
    for (const a of ads) { adBy.set(a.ad_name, a); adBy.set(norm(a.ad_name), a); }

    // 시트 → 소재 목록
    const items = [];
    const sheetInfo = {};
    for (const [mk, sh] of Object.entries(SHEETS)) {
      if (q.market && q.market !== 'all' && q.market !== mk) continue;
      let rows;
      try { rows = await readSheet(sh.id, 'A1:Z400'); }
      catch (e) { sheetInfo[mk] = { error: e.message }; continue; }
      const H = rows[0] || [];
      const ix = {
        id: col(H, '소재ID'), meta: col(H, 'Meta광고이름'), date: col(H, '생성일'),
        product: col(H, '제품'), concept: col(H, '대카'), shot: col(H, '소카'),
        avatar: col(H, '아바타'), pattern: col(H, '편집패턴'), claim: col(H, '핵심클레임'),
      };
      const data = rows.slice(1).filter(r => r[ix.id]);
      sheetInfo[mk] = { name: sh.name, rows: data.length };

      for (const r of data) {
        const id = String(r[ix.id] || '').trim();
        const ad = adBy.get(id) || adBy.get(norm(String(r[ix.meta] || ''))) || null;
        const g = ad ? gradeContent(ad.content, ad) : null;
        items.push({
          market: mk, id,
          date: r[ix.date] || null,
          product: (r[ix.product] || '').replace(/_KR$/, '') || null,
          concept: (r[ix.concept] || '').trim() || null,
          shot: (r[ix.shot] || '').trim() || null,
          avatar: (r[ix.avatar] || '').trim() || null,
          pattern: (r[ix.pattern] || '').trim() || null,
          claim: (r[ix.claim] || '').trim() || null,
          run: !!ad,
          kind: ad ? (ad.content?.isVideo ? 'video' : 'image') : null,
          spend: ad?.spend ?? null, impressions: ad?.impressions ?? null,
          ctr: ad?.ctr ?? null, cpcUsd: ad?.cpcUsd ?? null,
          hookRate: ad?.content?.hookRate ?? null,
          holdRate: ad?.content?.holdRate ?? null,
          clickFromView: ad?.content?.clickFromView ?? null,
          thumbnail_url: ad?.thumbnail_url ?? null,
          grade: g?.grade ?? null, gradeReason: g?.reason ?? null, fix: g?.fix ?? null,
        });
      }
    }

    // ── 유형 집계: 이미지형/영상형 × 대카 ──
    // 집행된 것만 성과 평균에 넣는다. 미집행을 섞으면 평균이 0으로 끌려간다.
    const group = new Map();
    for (const it of items) {
      const kind = it.kind || 'unrun';
      const key = `${kind}|${it.concept || '미분류'}`;
      if (!group.has(key)) group.set(key, []);
      group.get(key).push(it);
    }
    const types = [...group.entries()].map(([k, list]) => {
      const [kind, concept] = k.split('|');
      const run = list.filter(x => x.run);
      return {
        kind, concept, conceptName: CONCEPT[concept] || concept,
        made: list.length, run: run.length,
        win: run.filter(x => x.grade === 'win').length,
        keep: run.filter(x => x.grade === 'keep').length,
        drop: run.filter(x => x.grade === 'drop').length,
        remix: run.filter(x => x.grade === 'remix').length,
        avgCtr: avg(run.map(x => x.ctr)),
        avgHook: avg(run.map(x => x.hookRate)),
        spend: run.reduce((s, x) => s + (x.spend || 0), 0),
        shots: [...new Set(list.map(x => x.shot).filter(Boolean))],
        // 대표 썸네일 — 그 유형이 어떻게 생겼는지 한눈에
        thumb: run.find(x => x.thumbnail_url)?.thumbnail_url || null,
      };
    }).filter(t => t.kind !== 'unrun')
      .sort((a, b) => (b.win - a.win) || ((b.avgCtr ?? -1) - (a.avgCtr ?? -1)));

    // 미집행은 유형별로 따로 — "만들었는데 안 돌린 것"이 어디 몰려 있나
    const unrun = [...group.entries()].filter(([k]) => k.startsWith('unrun|'))
      .map(([k, list]) => ({ concept: k.split('|')[1], conceptName: CONCEPT[k.split('|')[1]] || k.split('|')[1], n: list.length }))
      .sort((a, b) => b.n - a.n);

    const runItems = items.filter(x => x.run);
    const payload = {
      status: 'connected',
      builtAt: new Date().toISOString(),
      source: sheetInfo,
      thresholds: { video: THRESHOLDS, static: STATIC_THRESHOLDS },
      dict: { concept: CONCEPT, shot: SHOT },
      counts: {
        made: items.length, run: runItems.length,
        runRate: Math.round(runItems.length / Math.max(1, items.length) * 100),
        image: runItems.filter(x => x.kind === 'image').length,
        video: runItems.filter(x => x.kind === 'video').length,
        win: runItems.filter(x => x.grade === 'win').length,
        drop: runItems.filter(x => x.grade === 'drop').length,
      },
      types, unrun, items,
    };
    try { await redis.set(cacheKey, payload, { ex: CACHE_TTL }); } catch { /* 캐시 실패해도 응답은 준다 */ }
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

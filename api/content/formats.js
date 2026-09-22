// 포맷 카탈로그 — 터지는 릴스 유형 / 메타 소재 유형의 단일 목록.
//
// 왜 문서가 아니라 데이터인가:
//   유형은 유한하다(8~12개). 영상을 100개 봐도 결론은 같은 유형들로 수렴한다.
//   매번 처음부터 해석하면 같은 답을 매일 다시 사는 꼴이라, 한 번 확정하고 **참조**한다.
//   매트릭스·블루프린트 생성이 코드로 읽어야 하므로 문서가 아니라 저장소에 둔다.
//
// 갱신 주기: 분기 1회 + 관찰에서 '카탈로그에 없는 유형' 이 나올 때.
//   매일 갱신하지 않는다 — 그게 이 설계의 요점이다.
//
// GET  /api/content/formats            → 카탈로그 + 실성과 대조
// POST /api/content/formats            → 적재/교체 (Bearer CRON_SECRET)

import { Redis } from '@upstash/redis';
import { AXES } from '../_assetCode.js';

export const config = { maxDuration: 120 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const FORMATS_KEY = 'content:formats:v1';

/**
 * 포맷 1개의 모양.
 *   kind      'reel'(영상 유형) | 'static'(메타 소재 유형)
 *   angle     매트릭스의 앵글 축과 연결 — 이게 있어야 성과와 대조된다
 *   hookType  첫 3초가 무엇으로 시작하나
 *   beats     구조. 릴스는 4비트, 정적은 레이아웃 슬롯
 *   hookPatterns  훅 '틀'(문장이 아니라 패턴). 생성 시 여기서 변주
 *   evidence  이 유형이 통한다는 근거(우리 실성과 또는 외부 관찰 출처)
 *   status    'active' | 'cooldown' | 'retired'
 */
export function normalizeFormat(raw = {}) {
  const now = new Date().toISOString();
  const has = (axis, v) => v && Object.prototype.hasOwnProperty.call(AXES[axis], v);
  return {
    id: raw.id || null,
    name: raw.name || null,
    kind: raw.kind === 'static' ? 'static' : 'reel',
    angle: has('angle', raw.angle) ? raw.angle : null,
    hookType: has('hook', raw.hookType) ? raw.hookType : null,
    lever: raw.lever || null,
    summary: raw.summary || null,
    beats: Array.isArray(raw.beats) ? raw.beats : [],
    hookPatterns: Array.isArray(raw.hookPatterns) ? raw.hookPatterns : [],
    products: Array.isArray(raw.products) ? raw.products : [],   // 어느 제품에 맞나
    markets: Array.isArray(raw.markets) ? raw.markets : ['kr', 'us'],
    compliance: raw.compliance || null,                          // 이 유형에서 특히 조심할 것
    evidence: raw.evidence || null,
    status: ['active', 'cooldown', 'retired'].includes(raw.status) ? raw.status : 'active',
    source: raw.source || null,                                  // 어느 문서/자산에서 왔나
    createdAt: raw.createdAt || now,
    updatedAt: now,
  };
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    let catalog = [];
    try { catalog = Object.values((await redis.hgetall(FORMATS_KEY)) || {}).filter(Boolean); } catch { /* 비어도 화면은 떠야 함 */ }

    // 실성과 대조 — 카탈로그가 '우리 생각'으로만 차는 걸 막는다.
    // 예: AUTH(권위 배지)가 문서상 핵심인데 매트릭스에서 훅률 꼴찌면 그게 여기서 보여야 한다.
    let matrix = [];
    if (req.query?.withPerf !== '0') {
      try {
        const { default: perf } = await import('./performance.js');
        const inner = { status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
        await perf({ method: 'GET', query: { market: req.query?.market || 'all' } }, inner);
        matrix = inner.body?.matrix || [];
      } catch { /* 성과 없이도 카탈로그는 반환 */ }
    }

    const withPerf = catalog.map(f => {
      const cells = matrix.filter(m => m.angle === f.angle);
      const n = cells.reduce((s, c) => s + c.n, 0);
      const wins = cells.reduce((s, c) => s + c.win, 0);
      const hooks = cells.map(c => c.avgHook).filter(x => x != null);
      return {
        ...f,
        perf: cells.length
          ? { ads: n, wins, avgHook: Number((hooks.reduce((s, x) => s + x, 0) / hooks.length).toFixed(1)) }
          : null,
      };
    });
    // 근거 있는 것 먼저, 그 중 성과 높은 순. 근거 없는 유형이 위로 올라오면 안 된다.
    withPerf.sort((a, b) => (b.perf?.avgHook ?? -1) - (a.perf?.avgHook ?? -1));

    return res.status(200).json({
      status: 'connected',
      count: catalog.length,
      byKind: catalog.reduce((m, f) => (m[f.kind] = (m[f.kind] || 0) + 1, m), {}),
      unvalidated: withPerf.filter(f => !f.perf).map(f => f.name), // 성과 대조가 안 되는 유형
      formats: withPerf,
    });
  }

  if (req.method === 'POST') {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const body = req.body || {};
    const list = Array.isArray(body.formats) ? body.formats : (body.name ? [body] : []);
    if (!list.length) return res.status(400).json({ error: 'formats 배열 필요' });
    try {
      if (body.replace === true) await redis.del(FORMATS_KEY);
      const write = {}; let invalid = 0;
      for (const raw of list) {
        const f = normalizeFormat(raw);
        if (!f.name || !f.angle) { invalid++; continue; } // 앵글 없으면 성과 대조가 안 된다 → 거부
        f.id = f.id || `${f.kind}_${f.angle}_${f.name}`.replace(/\s+/g, '_').toLowerCase();
        write[f.id] = f;
      }
      if (Object.keys(write).length) await redis.hset(FORMATS_KEY, write);
      return res.status(200).json({ ok: true, saved: Object.keys(write).length, invalid, replaced: body.replace === true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

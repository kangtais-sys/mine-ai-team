// 오늘의 9칸 — 데일리 스튜디오가 읽는 유일한 엔드포인트.
//
// GET    /api/content/daily?market=us[&date=YYYY-MM-DD]   오늘 계획 (없으면 규칙으로 생성 후 저장)
// POST   /api/content/daily?market=us                      { refs: [url,url,url] } 트렌드 레퍼런스 저장 → 재생성
// PATCH  /api/content/daily?market=us&id=<slotId>          { status, blueprint, assetUrl, note } 칸 갱신
//
// 규칙은 api/_daily.js 한 곳에만 있다. 여기는 데이터를 모아 넣고, 결과를 적어둘 뿐이다.
// 한 번 만든 날의 계획은 **고정**한다 — 오전에 본 9칸이 오후에 바뀌면 작업이 날아간다.

import { Redis } from '@upstash/redis';
import { buildDailyPlan, kstDate, DAILY_SPEC, TRACK_META, LANES, PERSONA_POOL } from '../_daily.js';
import { listHooks } from '../_hooks.js';

export const config = { maxDuration: 120 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const key = (date, market) => `content:daily:v2:${market}:${date}`;
const REFS_KEY = (date, market) => `content:daily:refs:${market}:${date}`;

// 같은 배포 안의 핸들러를 HTTP 로 다시 부르면 콜드스타트가 두 번 붙는다 → 직접 호출.
// performance.js 가 쓰는 것과 같은 패턴.
async function callHandler(mod, query) {
  const inner = {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
    setHeader() { return this; },
  };
  try {
    const { default: h } = await import(mod);
    await h({ method: 'GET', query, headers: {} }, inner);
    return inner.body || {};
  } catch (e) {
    return { status: 'error', error: String(e?.message || e) };
  }
}

// 직전 3일에서 쓴 레버·페르소나 — 연속 중복을 막는 입력.
async function recentSignals(date, market) {
  const days = [1, 2, 3].map(n => {
    const d = new Date(Date.parse(`${date}T00:00:00Z`) - n * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const levers = [], personas = [];
  for (const d of days) {
    try {
      const p = await redis.get(key(d, market));
      for (const s of p?.slots || []) {
        if (s.lever) levers.push(s.lever);
        if (s.persona) personas.push(s.persona);
      }
    } catch { /* 과거분이 없어도 오늘은 떠야 한다 */ }
  }
  return { levers: [...new Set(levers)].slice(0, 4), personas };
}

async function generate(date, market) {
  const [formats, types, refs, recent] = await Promise.all([
    callHandler('./formats.js', {}),
    callHandler('./types.js', {}),
    redis.get(REFS_KEY(date, market)).catch(() => null),
    recentSignals(date, market),
  ]);
  let hooks = [];
  try { hooks = await listHooks(); } catch { /* 훅 라이브러리 없어도 동작 */ }

  const plan = buildDailyPlan({
    formats: formats.formats || [],
    types,
    hooks: Array.isArray(hooks) ? hooks : (hooks?.items || []),
    refs: Array.isArray(refs) ? refs : [],
    market, date, recent,
  });

  plan.sources = {
    formats: formats.status === 'connected' ? `포맷 ${formats.count}종` : `포맷 실패(${formats.error || formats.status})`,
    types: types.status === 'connected' ? `소재로그 ${types.items?.length ?? 0}건` : `소재로그 실패(${types.error || types.status})`,
    hooks: `훅 카드 ${Array.isArray(hooks) ? hooks.length : 0}장`,
  };
  plan.builtAt = new Date().toISOString();
  await redis.set(key(date, market), plan, { ex: 60 * 60 * 24 * 60 });
  return plan;
}

export default async function handler(req, res) {
  const q = req.query || {};
  const market = String(q.market || 'us').toLowerCase() === 'kr' ? 'kr' : 'us';
  const date = String(q.date || kstDate());

  try {
    if (req.method === 'GET') {
      let plan = await redis.get(key(date, market)).catch(() => null);
      if (!plan || q.rebuild === '1') plan = await generate(date, market);
      return res.status(200).json({
        status: 'ok', ...plan,
        meta: { spec: DAILY_SPEC, tracks: TRACK_META, lanes: LANES, personas: PERSONA_POOL },
      });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const refs = (Array.isArray(body.refs) ? body.refs : [])
        .map(s => String(s || '').trim())
        .filter(Boolean)
        .slice(0, 3);
      await redis.set(REFS_KEY(date, market), refs, { ex: 60 * 60 * 24 * 14 });

      // 레퍼런스가 바뀌면 트렌드 3칸만 다시 만든다. 고정유형·이미지는 이미 손댔을 수 있어 보존.
      const prev = await redis.get(key(date, market)).catch(() => null);
      const fresh = await generate(date, market);
      if (prev?.slots?.length) {
        const keep = new Map(prev.slots.filter(s => s.track !== 'trend').map(s => [s.id, s]));
        fresh.slots = fresh.slots.map(s => (keep.has(s.id) ? keep.get(s.id) : s));
        await redis.set(key(date, market), fresh, { ex: 60 * 60 * 24 * 60 });
      }
      return res.status(200).json({ status: 'ok', refs, ...fresh });
    }

    if (req.method === 'PATCH') {
      const id = String(q.id || '');
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const plan = await redis.get(key(date, market)).catch(() => null);
      if (!plan) return res.status(404).json({ error: 'no_plan_for_date' });
      const i = (plan.slots || []).findIndex(s => s.id === id);
      if (i < 0) return res.status(404).json({ error: 'slot_not_found', id });

      const allowed = ['status', 'blueprint', 'assetUrl', 'note', 'lane', 'persona', 'sourceUrl'];
      for (const k of allowed) if (k in body) plan.slots[i][k] = body[k];
      plan.slots[i].updatedAt = new Date().toISOString();
      await redis.set(key(date, market), plan, { ex: 60 * 60 * 24 * 60 });
      return res.status(200).json({ status: 'ok', slot: plan.slots[i] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ status: 'error', error: String(e?.message || e) });
  }
}

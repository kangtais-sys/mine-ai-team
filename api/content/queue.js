// 생성 큐 — 뽑기로 정해진 조합이 실제 소재가 될 때까지의 상태를 들고 있다.
//
//   대기 → 생성중 → 검수 → 발행준비 → 발행됨
//
// 왜 필요한가: 지금은 "오늘 뭘 만들지"까지만 정해지고 그 다음이 공중에 뜬다.
//   무한 생성은 만드는 속도가 아니라 **떨어뜨리지 않는 것**이 관건이다.
//
// 조합 선택 규칙은 여기 없다(src/lib/plan.js 한 곳). 여기는 결정된 것만 받아 적는다.
// 규칙을 서버에도 복사하면 두 곳이 서로 다른 답을 내기 시작한다 — 이미 한 번 겪었다.
//
// GET   /api/content/queue              목록 (?status= 로 필터)
// POST  /api/content/queue              추가 (body = { items: [...] } 또는 단건)
// PATCH /api/content/queue?id=...       상태·필드 수정
// DELETE /api/content/queue?id=...      삭제

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = 'content:queue:v1';
export const STATUSES = ['대기', '생성중', '검수', '발행준비', '발행됨', '버림'];
const MAX = 500;   // 큐가 무한히 자라지 않게. 오래된 '발행됨'부터 밀려난다.

const load = async () => {
  try {
    const v = await redis.get(KEY);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
};
const save = (list) => redis.set(KEY, list.slice(0, MAX));

// 소재ID 를 **생성 시점에** 발급한다. 이게 붙어 있어야 나중에 Meta 성과가
// 추론 없이 자동으로 조인된다(캡컷 과거분이 조인 안 되는 이유가 이게 없어서였다).
function makeAssetId({ market, product, angle, hook, kind }, seq) {
  const mk = market === 'kr' ? 'KR-' : '';
  const k = kind === 'video' ? 'VID-' : '';
  const d = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `MM-${mk}${k}${String(product || 'MIST').slice(0, 3).toUpperCase()}-${angle}-${hook}-${d}-${String(seq).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  try {
    const list = await load();
    const id = req.query?.id;

    if (req.method === 'GET') {
      const st = req.query?.status;
      const out = st ? list.filter(x => x.status === st) : list;
      const counts = Object.fromEntries(STATUSES.map(s => [s, list.filter(x => x.status === s).length]));
      return res.status(200).json({ items: out, counts, total: list.length });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const incoming = Array.isArray(body.items) ? body.items : [body];
      if (!incoming.length) return res.status(400).json({ error: 'items 필요' });

      const today = new Date().toISOString().slice(0, 10);
      const todayCount = list.filter(x => x.createdAt === today).length;

      const added = [];
      let seq = todayCount;
      for (const it of incoming) {
        if (!it.angle || !it.hook) continue;
        // 같은 날 같은 조합이 두 번 들어가지 않게 — 실수로 두 번 누르는 일이 잦다.
        const dupe = list.some(x => x.createdAt === today
          && x.market === it.market && x.product === it.product && x.kind === it.kind
          && x.angle === it.angle && x.hook === it.hook && x.skeletonId === (it.skeletonId || null));
        if (dupe) continue;
        seq += 1;
        added.push({
          id: `Q-${Date.now().toString(36)}-${seq}`,
          assetId: makeAssetId(it, seq),
          createdAt: today,
          status: '대기',
          market: it.market || 'us',
          product: it.product || 'MIST',
          kind: it.kind === 'video' ? 'video' : 'image',
          angle: it.angle,
          hook: it.hook,
          mode: it.mode || null,            // 증량 / 변주 / 신규
          skeletonId: it.skeletonId || null,
          personaId: it.personaId || null,  // AI 인플루언서 단계에서 채운다
          claim: it.claim || '',
          note: it.note || '',
          thumb: it.thumb || null,
          assetUrl: null,
          updatedAt: today,
        });
      }
      const next = [...added, ...list];
      await save(next);
      return res.status(200).json({ ok: true, added: added.length, skipped: incoming.length - added.length, items: added });
    }

    if (req.method === 'PATCH') {
      if (!id) return res.status(400).json({ error: 'id 필요' });
      const patch = req.body || {};
      if (patch.status && !STATUSES.includes(patch.status)) {
        return res.status(400).json({ error: `status 는 ${STATUSES.join('/')} 중 하나` });
      }
      const next = list.map(x => (x.id === id
        ? { ...x, ...patch, id: x.id, updatedAt: new Date().toISOString().slice(0, 10) }
        : x));
      await save(next);
      return res.status(200).json({ ok: true, item: next.find(x => x.id === id) });
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id 필요' });
      await save(list.filter(x => x.id !== id));
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'GET/POST/PATCH/DELETE only' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

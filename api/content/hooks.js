// GET  /api/content/hooks — 훅 라이브러리 조회 (화면·생성 파이프라인 공용)
//   ?market=kr|us  ?source=internal|youtube|meta_library|tiktok  ?angle=  ?lever=
//   ?availableOnly=1 (쿨다운 제외)
//
// POST /api/content/hooks — 카드 적재. Authorization: Bearer ${CRON_SECRET}
//   메타 광고 라이브러리·틱톡은 공식 API 가 막혀 코드가 못 긁는다(설계 §4-1).
//   브라우저로 수집한 결과를 여기로 넣는 반자동 경로.
//   body: { cards: [...] }  또는 단일 카드

import { listHooks, saveHooks, available, LEVERS, SOURCES } from '../_hooks.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const q = req.query || {};
    let cards = await listHooks();
    if (q.market) cards = cards.filter(c => c.market === q.market);
    if (q.source) cards = cards.filter(c => c.source === q.source);
    if (q.angle) cards = cards.filter(c => c.angle === q.angle);
    if (q.lever) cards = cards.filter(c => c.lever === q.lever);
    if (q.availableOnly === '1') cards = available(cards);

    // 신선한 것 먼저. 내부 카드(성과 근거 있음)를 같은 조건이면 위로.
    cards.sort((a, b) => {
      if ((a.source === 'internal') !== (b.source === 'internal')) return a.source === 'internal' ? -1 : 1;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });

    const by = (k) => cards.reduce((m, c) => (m[c[k] ?? '미분류'] = (m[c[k] ?? '미분류'] || 0) + 1, m), {});
    return res.status(200).json({
      status: 'connected',
      count: cards.length,
      levers: LEVERS, sources: SOURCES,
      breakdown: { source: by('source'), market: by('market'), angle: by('angle'), lever: by('lever') },
      cards,
    });
  }

  if (req.method === 'POST') {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const body = req.body || {};
    const cards = Array.isArray(body.cards) ? body.cards : (body.source ? [body] : []);
    if (!cards.length) return res.status(400).json({ error: 'cards 배열 또는 단일 카드 필요' });
    try {
      const result = await saveHooks(cards, { overwrite: body.overwrite === true });
      return res.status(200).json({ ok: true, ...result });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

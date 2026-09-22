// 트렌드 수집 계약 — 대시보드 **바깥**에서 분석한 결과를 받는 유일한 문.
//
// POST /api/content/trend-ingest?market=us[&date=YYYY-MM-DD][&dry=1]
//   인증: Authorization: Bearer ${CREATOR_INGEST_SECRET}
//   body: { cards: [ <아래 스키마> ] }
//
// ── 왜 이렇게 갈라놨는가 (MINE 확정 2026-09-23) ──
// 수집·분석은 대시보드가 하지 않는다. 맥에서 도는 실행자(클로드 코드, 안 되면 코덱스)가 한다.
//   · 틱톡은 공개 트렌드 API 가 없다. 영상을 실제로 보려면 브라우저와 파일 시스템이 필요하고,
//     그건 Vercel 서버리스가 못 한다. 맥에서 도는 에이전트는 한다.
//   · 그래서 앱은 "누가 어떻게 가져왔는지"를 묻지 않고 **결과의 모양만** 강제한다.
//     실행자가 바뀌어도(클로드 코드 → 코덱스) 이 문은 그대로다.
//
// ⛔ 이 문의 진짜 역할은 **지어낸 값을 막는 것**이다.
//   영상을 못 본 채로 컷 수·전환·비트를 적어 보내면 그건 관찰이 아니라 창작이다.
//   craft 를 보내려면 confidence.craft 가 high|low 여야 하고, 영상을 못 봤으면 absent + craft 생략.
//   원문(sourceHook)과 우리 문장(adapted)이 같으면 복제다 — 거부한다.
//
// 릴스는 받지 않는다. 인스타그램에는 공개 트렌드 surface 가 없어서
// 로그인 피드를 긁는 것 말고 방법이 없고, 그건 차단·계정 위험이다. 틱톡만.
//
// 계약 전문: docs/trend-ingest-contract.md

import { Redis } from '@upstash/redis';
import { saveHooks, LEVERS } from '../_hooks.js';
import { AXES } from '../_assetCode.js';

export const config = { maxDuration: 120 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const REFS_KEY = (date, market) => `content:daily:refs:${market}:${date}`;
const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

export const CONFIDENCE = ['high', 'low', 'absent'];
export const STRUCTURES = ['A', 'B', 'C', 'D'];

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const norm = (v) => str(v).toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

/**
 * 카드 1장 검증. 통과하면 { ok, card }, 아니면 { ok:false, fails:[...] }.
 * 실패 사유를 뭉뚱그리지 않는다 — 실행자가 무엇을 고쳐야 하는지 알아야 다음 판에 맞춘다.
 */
export function validateCard(raw = {}, i = 0) {
  const f = [];
  const at = (m) => f.push(`cards[${i}] ${m}`);

  const url = str(raw.sourceUrl);
  if (!url) at('sourceUrl 없음');
  else if (!/^https?:\/\/([a-z0-9-]+\.)?tiktok\.com\//i.test(url)) {
    at(`sourceUrl 이 틱톡이 아님 — 릴스·유튜브는 받지 않는다 (${url.slice(0, 60)})`);
  }

  const sourceHook = str(raw.sourceHook);
  if (!sourceHook) at('sourceHook(원문 훅) 없음 — 근거가 없으면 카드가 아니다');

  const kr = str(raw.adapted?.kr);
  const us = str(raw.adapted?.us);
  if (!kr) at('adapted.kr 없음');
  if (!us) at('adapted.us 없음');
  // 복제 차단 — 번역만 해 온 것도 복제다.
  if (kr && norm(kr) === norm(sourceHook)) at('adapted.kr 이 원문과 같다 — 새로 써야 한다');
  if (us && norm(us) === norm(sourceHook)) at('adapted.us 가 원문과 같다 — 새로 써야 한다');

  const lever = str(raw.lever).toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(LEVERS, lever)) {
    at(`lever 가 목록 밖 — ${Object.keys(LEVERS).join('|')}`);
  }
  const angle = str(raw.angle).toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(AXES.angle, angle)) {
    at(`angle 이 목록 밖 — ${Object.keys(AXES.angle).join('|')}`);
  }
  const hookType = str(raw.hookType).toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(AXES.hook, hookType)) {
    at(`hookType 이 목록 밖 — ${Object.keys(AXES.hook).join('|')}`);
  }

  // ── 지어내기 차단 ──
  const conf = str(raw.confidence?.craft) || 'absent';
  if (!CONFIDENCE.includes(conf)) at(`confidence.craft 는 ${CONFIDENCE.join('|')}`);
  const craft = raw.craft;
  const hasCraft = craft && typeof craft === 'object' && Object.keys(craft).length > 0;

  if (hasCraft && conf === 'absent') {
    at('craft 를 보냈는데 confidence.craft=absent — 영상을 못 봤으면 craft 를 비워라');
  }
  if (!hasCraft && conf !== 'absent') {
    at(`confidence.craft=${conf} 인데 craft 가 비었다`);
  }
  if (hasCraft) {
    if (craft.durationSec != null && !(Number(craft.durationSec) > 0)) at('craft.durationSec 이 숫자가 아님');
    if (craft.cuts != null && !Number.isInteger(Number(craft.cuts))) at('craft.cuts 가 정수가 아님');
    if (craft.structure != null && !STRUCTURES.includes(str(craft.structure)[0])) {
      at(`craft.structure 는 ${STRUCTURES.join('|')}`);
    }
    if (craft.beats != null && !Array.isArray(craft.beats)) at('craft.beats 는 배열');
  }
  if (conf === 'absent' && !str(raw.confidence?.note)) {
    at('영상을 못 봤으면 confidence.note 에 무엇만 보고 판단했는지 적어라 (커버·캡션 등)');
  }

  const views = raw.observed?.views;
  if (views != null && !(Number.isFinite(Number(views)) && Number(views) >= 0)) at('observed.views 가 숫자가 아님');

  if (f.length) return { ok: false, fails: f };

  // _hooks.normalizeCard 가 받는 모양으로 맞춘다. 새 축을 만들지 않는다.
  return {
    ok: true,
    card: {
      source: 'tiktok',
      market: raw.market === 'kr' ? 'kr' : 'us',
      product: str(raw.product) || null,
      angle, hookType, lever,
      sourceHook,
      adapted: { kr, us },
      beats: hasCraft && Array.isArray(craft.beats) ? craft.beats.slice(0, 8) : [],
      proof: str(raw.proof) || null,
      why: str(raw.why) || null,
      sourceUrl: url,
      refId: str(raw.refId) || null,
      sourceMeta: {
        ...(raw.observed || {}),
        craft: hasCraft ? craft : null,
        confidence: { craft: conf, note: str(raw.confidence?.note) || null },
        analyzedBy: str(raw.analyzedBy) || null,   // 'claude-code' | 'codex' | …
        ingestedAt: new Date().toISOString(),
      },
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers.authorization !== `Bearer ${process.env.CREATOR_INGEST_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized — CREATOR_INGEST_SECRET' });
  }

  try {
    const q = req.query || {};
    const market = String(q.market || 'us').toLowerCase() === 'kr' ? 'kr' : 'us';
    const date = String(q.date || kstToday());
    const dry = q.dry === '1';

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const input = Array.isArray(body.cards) ? body.cards : [];
    if (!input.length) return res.status(400).json({ error: 'cards 배열이 비었다' });
    if (input.length > 12) return res.status(400).json({ error: '한 번에 12장까지' });

    const results = input.map((c, i) => validateCard({ market, ...c }, i));
    const good = results.filter(r => r.ok).map(r => r.card);
    const fails = results.flatMap(r => (r.ok ? [] : r.fails));

    // 통과분이 3장 미만이면 그날 트렌드 칸이 다 안 찬다 — 숨기지 않고 알린다.
    const shortfall = good.length < 3 ? `통과 ${good.length}장 — 트렌드 3칸을 다 못 채운다` : null;

    if (dry) {
      return res.status(200).json({ status: 'dry', accepted: good.length, rejected: results.length - good.length, fails, shortfall });
    }
    if (!good.length) return res.status(422).json({ error: '통과한 카드 없음', fails });

    const saved = await saveHooks(good);
    const refs = good.slice(0, 3).map(c => c.sourceUrl);
    await redis.set(REFS_KEY(date, market), refs, { ex: 60 * 60 * 24 * 14 });

    return res.status(200).json({
      status: 'ok', market, date,
      accepted: good.length, rejected: results.length - good.length,
      refs, saved, fails, shortfall,
      next: `트렌드 3칸이 이 레퍼런스로 다시 짜인다. GET /api/content/daily?market=${market}&rebuild=1`,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}

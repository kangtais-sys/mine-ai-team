// 일일 9칸 — 오늘 무엇을 만들지 정하는 규칙. **서버 단일 소스.**
//
// MINE 확정 2026-09-22: 하루 = 트렌드 모방 3 + 고정 유형 3 + 이미지 3.
//   기존 docs/daily-production-design.md 의 US5+KR3(8건)을 이 스펙으로 교체한다.
//   증량60/탐색30/리믹스10 의 사고는 버리지 않고 각 트랙 **안에서** 지킨다.
//
// 왜 서버인가: src/lib/plan.js 는 화면이 계산한다. 그러면 크론(자동 생성)이 같은 규칙을
//   한 번 더 구현해야 하고, 두 곳이 갈라진다 — queue.js 주석이 경고한 그 상황이다.
//   그래서 새 일일 엔진은 여기 한 곳에만 둔다. 화면은 받아서 그리기만 한다.
//
// LLM 0콜. 같은 날이면 항상 같은 답이 나온다(dayIndex 결정론).

import { AXES, buildAssetCode } from './_assetCode.js';

// ── 스펙 ──────────────────────────────────────────────────────────
export const DAILY_SPEC = { trend: 3, format: 3, image: 3 };

export const TRACK_META = {
  trend:  { label: '트렌드 모방', hint: '틱톡·릴스에서 지금 터지는 구조를 밀리밀리로 변환' },
  format: { label: '고정 유형',   hint: 'POV·B&A 등 검증된 유형 — 위너 우선 로테이션' },
  image:  { label: '이미지 소재', hint: '대카×소카 조합 — 위너 증량 / 미탐색 탐색' },
};

// 레인 — 무엇이 AI이고 무엇이 실제인가. 표기 의무가 여기서 갈린다.
// docs 및 CLAUDE.md 규칙2(가짜 후기·가짜 증거 금지)와 직결.
export const LANES = {
  a: { label: '실촬',      disclose: false, note: '실제 촬영분 그대로' },
  b: { label: '실촬+AI보정', disclose: true,  note: '실제 경험 기반, AI 후보정 — AI 연출 표기' },
  c: { label: 'AI 합성',    disclose: true,  note: '순수 AI 생성 — AI 연출 표기 필수' },
};

// ── AI 인플루언서 ────────────────────────────────────────────────
// 매일 다른 얼굴은 인플루언서가 아니다. 고정된 소수를 반복해야 인지가 쌓인다.
// Higgsfield Soul ID(22장 학습)로 잠긴 얼굴만 쓴다.
export const PERSONA_POOL = [
  { id: 'glass_kr7', market: 'kr', label: '글래스 KR-7', soul: true },
  { id: 'glass_kr1', market: 'kr', label: '글래스 KR-1', soul: true },
  { id: 'glass2',    market: 'us', label: '글래스 US-2', soul: true },
  { id: 'glass3',    market: 'us', label: '글래스 US-3', soul: true },
];

// ── 공통 유틸 ────────────────────────────────────────────────────
export const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
export const dayIndexOf = (isoDate) => Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 86400000);

const rot = (arr, i) => (arr.length ? arr[((i % arr.length) + arr.length) % arr.length] : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ── ① 트렌드 3칸 ─────────────────────────────────────────────────
// 자동 스크래핑은 하지 않는다. 틱톡·릴스에 공개 API 가 없고, 우회 수집은 차단·법적 위험.
// 대신 레퍼런스 URL 3개를 받아 **구조만** 해부한다.
//
// ⛔ 저작권 선 (api/_hooks.js 와 동일): 원본 영상·오디오·대사·얼굴 1:1 복제 금지.
//    sourceUrl 은 근거·추적용으로만 남기고, 생성에 들어가는 건 adapted 훅뿐이다.
export function buildTrendSlots({ refs = [], hooks = [], dayIndex, market }) {
  // 훅 라이브러리에 쌓인 외부 카드 중 아직 소재가 안 나온 것 — 레퍼 URL 이 비었을 때의 대체 입력.
  const pool = hooks
    .filter(h => h.source && h.source !== 'internal' && !h.usedAt)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  return Array.from({ length: DAILY_SPEC.trend }, (_, i) => {
    const ref = refs[i] || null;
    const card = !ref ? rot(pool, dayIndex + i) : null;

    if (!ref && !card) {
      return {
        track: 'trend', seq: i + 1, state: 'awaiting_ref',
        title: `트렌드 ${i + 1} — 레퍼런스 대기`,
        why: '틱톡·릴스에서 오늘 터진 것 1개를 붙여넣으면 구조를 해부한다',
        note: '공개 API 가 없어 자동 수집은 안 한다. URL 만 주면 나머지는 자동.',
        lane: 'c', market, sourceUrl: null, adaptedFrom: null,
      };
    }
    return {
      track: 'trend', seq: i + 1, state: 'ready',
      title: ref ? `트렌드 ${i + 1} — 레퍼런스 해부` : `트렌드 ${i + 1} — ${card.lever || '훅 카드'}`,
      why: ref
        ? '붙여넣은 레퍼런스의 훅·비트·전환만 뽑아 밀리밀리 소재로 변환'
        : `훅 라이브러리 카드 재사용 — ${card.sourceHook ? `"${String(card.sourceHook).slice(0, 40)}…"` : '외부 관찰분'}`,
      note: '⛔ 원문·오디오·얼굴 복제 금지. 크래프트(구조·타이밍·전환)만 차용.',
      lane: 'c', market,
      sourceUrl: ref || card?.sourceUrl || null,
      adaptedFrom: card ? { id: card.id, lever: card.lever, angle: card.angle, hookType: card.hookType } : null,
      angle: card?.angle || null, hook: card?.hookType || null, lever: card?.lever || null,
    };
  });
}

// ── ② 고정 유형 3칸 ──────────────────────────────────────────────
// formats 카탈로그(릴스)에서 뽑는다. 위너 우선 — 터지는 유형을 계속 반복하는 게 요점.
//
// ⚠️ 정직한 한계: /api/content/formats 의 perf 는 **앵글 단위 집계**다.
//    같은 BA 앵글의 릴스 4종이 전부 {ads:21, wins:9} 로 같은 값을 받는다.
//    → 위너 판별은 앵글까지만 믿고, 그 안에서 어느 포맷인지는 로테이션으로 가른다.
//      포맷 단위 성과는 소재코드(AD-…-REEL-…)가 쌓여야 갈린다.
export function buildFormatSlots({ formats = [], dayIndex, market, recentLevers = [] }) {
  const reels = formats.filter(f => f.kind === 'reel' && f.status === 'active'
    && (!f.markets?.length || f.markets.includes(market)));

  const scored = reels.map(f => ({
    ...f,
    _wins: num(f.perf?.wins) ?? 0,
    _hook: num(f.perf?.avgHook) ?? 0,
    _ads: num(f.perf?.ads) ?? 0,
  })).sort((a, b) => (b._wins - a._wins) || (b._hook - a._hook) || (b._ads - a._ads));

  const out = [];
  const usedLever = new Set(recentLevers);   // 어제 쓴 레버는 오늘 피한다
  const usedAngle = new Set();

  for (let i = 0; out.length < DAILY_SPEC.format && i < scored.length * 3; i++) {
    const f = rot(scored, dayIndex + i);
    if (!f) break;
    if (out.some(o => o.formatId === f.id)) continue;
    // 같은 앵글 2칸 연속 금지 — 하루가 전부 B&A 로 덮이는 걸 막는다.
    if (usedAngle.has(f.angle) && out.length < scored.length) continue;
    if (usedLever.has(f.lever) && out.length < 2) continue;

    usedAngle.add(f.angle); usedLever.add(f.lever);
    const winner = f._wins >= 2;
    out.push({
      track: 'format', seq: out.length + 1, state: 'ready',
      formatId: f.id, title: f.name,
      angle: f.angle, hook: f.hookType, lever: f.lever,
      beats: f.beats || [], hookPatterns: f.hookPatterns || [],
      compliance: f.compliance || null,
      mode: winner ? '증량' : (f._ads > 0 ? '변주' : '신규'),
      tone: winner ? 'win' : (f._ads > 0 ? 'test' : 'new'),
      why: f._ads
        ? `${AXES.angle[f.angle] || f.angle} 앵글 ${f._ads}건 중 위너 ${f._wins} · 평균 훅률 ${f._hook || '—'}%`
        : '집행 이력 없음 — 표본 만들기',
      note: winner ? '터진 유형이다. 얼굴·상황만 바꿔 그대로 한 번 더.' : '앵글 단위 성과만 확실함 — 포맷 판별은 소재코드 누적 후',
      lane: 'c', market,
    });
  }
  return out;
}

// ── ③ 이미지 3칸 ─────────────────────────────────────────────────
// 소재로그 실측(대카×소카)에서. 증량 2 / 탐색 1 을 기본으로 하되 재료가 없으면 증량으로 메운다.
export function buildImageSlots({ items = [], dict = {}, dayIndex, market }) {
  const cells = new Map();
  for (const x of items) {
    if (x.market !== market) continue;
    if ((x.kind || 'image') !== 'image') continue;
    const k = `${x.concept || '미분류'}|${x.shot || '미분류'}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(x);
  }
  const list = [...cells.entries()].map(([k, arr]) => {
    const [concept, shot] = k.split('|');
    const run = arr.filter(x => x.run);
    const ctrs = run.map(x => num(x.ctr)).filter(v => v != null);
    return {
      concept, shot,
      conceptName: dict.concept?.[concept] || concept,
      shotName: dict.shot?.[shot] || shot,
      made: arr.length, run: run.length,
      win: run.filter(x => x.grade === 'win').length,
      avgCtr: ctrs.length ? Number((ctrs.reduce((s, v) => s + v, 0) / ctrs.length).toFixed(2)) : null,
      thumb: run.find(x => x.thumbnail_url)?.thumbnail_url || arr.find(x => x.thumbnail_url)?.thumbnail_url || null,
      product: (run[0] || arr[0])?.product || 'MIST',
    };
  });

  const winners = list.filter(c => c.win > 0).sort((a, b) => b.win - a.win || ((b.avgCtr ?? 0) - (a.avgCtr ?? 0)));
  const best = list.filter(c => c.run > 0).sort((a, b) => (b.avgCtr ?? 0) - (a.avgCtr ?? 0));
  const fresh = list.filter(c => c.run === 0).sort((a, b) => b.made - a.made);
  const base = winners.length ? winners : best;

  const plan = ['증량', '증량', fresh.length ? '탐색' : '증량'];
  return plan.map((mode, i) => {
    const c = mode === '탐색' ? rot(fresh, dayIndex + i) : rot(base, dayIndex + i);
    if (!c) return null;
    return {
      track: 'image', seq: i + 1, state: 'ready', mode,
      title: `${c.conceptName} × ${c.shotName}`,
      concept: c.concept, shot: c.shot, product: c.product, thumb: c.thumb,
      tone: mode === '탐색' ? 'new' : (c.win > 0 ? 'win' : 'test'),
      why: mode === '탐색'
        ? `제작 ${c.made}건 · 집행 0건 — 성과가 없는 칸`
        : `집행 ${c.run}건 · 위너 ${c.win} · 평균 CTR ${c.avgCtr ?? '—'}%`,
      note: mode === '탐색' ? '1건만 태워서 판정 표본을 만든다' : '검증된 조합 — 비주얼만 새로',
      lane: 'c', market,
    };
  }).filter(Boolean);
}

// ── 페르소나 배정 ────────────────────────────────────────────────
// 같은 얼굴 3일 연속 금지. 시장이 맞는 풀 안에서만 돈다.
export function assignPersona(slot, { dayIndex, market, index, recentPersonas = [] }) {
  const pool = PERSONA_POOL.filter(p => p.market === market);
  if (!pool.length) return null;
  const streak = recentPersonas.slice(0, 2);
  for (let i = 0; i < pool.length; i++) {
    const p = rot(pool, dayIndex + index + i);
    if (streak.length === 2 && streak[0] === p.id && streak[1] === p.id) continue;
    return p;
  }
  return rot(pool, dayIndex + index);
}

// ── 조립 ─────────────────────────────────────────────────────────
export function buildDailyPlan({
  formats = [], types = {}, hooks = [], refs = [],
  market = 'us', date = kstDate(), recent = {},
} = {}) {
  const di = dayIndexOf(date);
  const slots = [
    ...buildTrendSlots({ refs, hooks, dayIndex: di, market }),
    ...buildFormatSlots({ formats, dayIndex: di, market, recentLevers: recent.levers || [] }),
    ...buildImageSlots({ items: types.items || [], dict: types.dict || {}, dayIndex: di, market }),
  ];

  const stamp = date.replace(/-/g, '').slice(2);
  return {
    date, market, dayIndex: di,
    spec: DAILY_SPEC,
    slots: slots.map((s, i) => {
      const persona = assignPersona(s, { dayIndex: di, market, index: i, recentPersonas: recent.personas || [] });
      const format = s.track === 'image' ? 'STILL' : 'REEL';
      const angle = s.angle || (s.concept ? conceptToAngle(s.concept) : 'TIP');
      const hook = s.hook || (s.shot ? shotToHook(s.shot) : 'TEXT');
      const product = normProductCode(s.product);
      return {
        ...s,
        id: `${date}-${s.track}-${s.seq}`,
        persona: persona?.id || null,
        personaLabel: persona?.label || null,
        status: '대기',
        assetCode: buildAssetCode({
          track: 'AD', market: market.toUpperCase(), product,
          angle, hook, format, date, variant: i + 1,
        }),
        // 이 코드를 Meta 광고 이름에 그대로 넣어야 성과가 자동 조인된다.
        joinNote: 'Meta 광고 이름 = 이 소재코드 (그대로 복사)',
        disclose: LANES[s.lane]?.disclose ?? true,
        stamp,
      };
    }),
  };
}

// 소재로그 대카(concept) → 소재코드 앵글. 시트 어휘와 코드 어휘를 잇는 유일한 지점.
export function conceptToAngle(c) {
  return ({
    BA: 'BA', GLA: 'TIP', CLI: 'CLI', ING: 'TIP', AUT: 'AUTH', PRO: 'OFFER',
    INS: 'TIP', MAC: 'TIP', RAVE: 'UGC', OYMST: 'AUTH', OYAMP: 'AUTH', OYSET: 'AUTH',
  })[c] || 'TIP';
}
export function shotToHook(s) {
  return ({
    CLOSE: 'FACE', WIDE: 'FACE', DRY: 'SPLIT', MACRO: 'ASMR', MIRROR: 'SPLIT',
    PORE: 'ASMR', SCAN: 'RESULT', VALUE: 'TEXT', COUNT: 'TEXT', WET: 'ASMR',
    SMILE: 'FACE', FILLER: 'RESULT', GLASSKIN: 'RESULT', SPLIT: 'SPLIT', MAKEUP: 'SCENE',
  })[s] || 'TEXT';
}
function normProductCode(p) {
  const s = String(p || '').toUpperCase();
  if (s.includes('AMP')) return 'AMP';
  if (s.includes('MIST') || s === 'MST') return 'MST';
  if (s.includes('DUO') || s.includes('SET') || s.includes('+')) return 'SET';
  return 'MST';
}

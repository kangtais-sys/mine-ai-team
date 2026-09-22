// 소재 선택 규칙 — 여기 한 곳에만 둔다.
//
// 보드와 오늘 화면이 각자 계산하면 서로 다른 답을 낸다(실제로 그랬다).
//
// 업계 표준 60/30/10 을 그대로 쓴다.
//   증량 60%  검증된 조합 그대로 한 장 더
//   변주 30%  앵글은 두고 훅만 교체
//   신규 10%  집행된 적 없는 칸에 1건
// 날짜로 10칸 사이클을 돌려 비중을 장기적으로 지킨다. LLM 을 쓰지 않아 토큰이 0이고,
// 같은 날이면 항상 같은 답이 나온다.
//
// ※ 앵글 쏠림은 허용한다(MINE 확인 2026-09-22). 연속 금지·쿨다운은 넣지 않는다.

export const PRODUCT = { MIST: '미스트', AMPOULE: '앰플', SET: '세트' };
export const MARKET = { kr: '한국', us: '미국' };
export const KIND = { image: '이미지', video: '영상' };

// 시트 제품값 정규화 — 앰플+미스트 / DUO 는 같은 '세트'다.
export function normProduct(p) {
  const s = String(p || '').toUpperCase();
  if (!s) return 'SET';
  if (s.includes('+') || s === 'DUO' || s === 'SET') return 'SET';
  if (s.includes('AMPOULE')) return 'AMPOULE';
  if (s.includes('MIST')) return 'MIST';
  return 'SET';
}

const avg = (a) => { const v = a.filter(x => x != null); return v.length ? Number((v.reduce((s, x) => s + x, 0) / v.length).toFixed(1)) : null; };
const pct = (v) => (v == null ? '—' : `${v}%`);

// 노드 하나의 성적표. 집행된 것만 성과 평균에 넣는다(미집행을 섞으면 0으로 끌려간다).
export function stat(list, kind) {
  const run = list.filter(x => x.run);
  const k = kind || (run.filter(x => x.kind === 'video').length > run.filter(x => x.kind === 'image').length ? 'video' : 'image');
  return {
    made: list.length, run: run.length,
    win: run.filter(x => x.grade === 'win').length,
    drop: run.filter(x => x.grade === 'drop').length,
    remix: run.filter(x => x.grade === 'remix').length,
    // 이미지는 CTR, 영상은 훅률. 성격이 달라 절대 섞지 않는다.
    metric: k === 'video'
      ? { label: '훅률', value: avg(run.map(x => x.hookRate)) }
      : { label: 'CTR', value: avg(run.map(x => x.ctr)) },
    spendUsd: run.reduce((s, x) => s + (x.spendUsd || 0), 0),
    thumb: run.find(x => x.thumbnail_url)?.thumbnail_url || list.find(x => x.thumbnail_url)?.thumbnail_url || null,
  };
}

// 시장·제품·종류·앵글·훅 조합을 평평하게. 이미지와 영상은 다른 칸으로 센다.
export function flatCells(data, { market } = {}) {
  if (!data) return [];
  const g = new Map();
  for (const x of data.items || []) {
    if (market && x.market !== market) continue;
    // 미집행은 종류를 모른다 — 이미지로 본다(정적 소재가 압도적이므로).
    const kind = x.kind || 'image';
    const k = `${x.market}|${normProduct(x.product)}|${kind}|${x.concept || '미분류'}|${x.shot || '미분류'}`;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(x);
  }
  return [...g.entries()].map(([k, list]) => {
    const [mk, pk, kind, ak, hk] = k.split('|');
    return {
      mk, pk, kind, angleKey: ak, hookKey: hk,
      market: MARKET[mk] || mk, product: PRODUCT[pk] || pk,
      angle: data.dict?.concept?.[ak] || ak,
      hook: data.dict?.shot?.[hk] || hk,
      list, s: stat(list, kind),
    };
  });
}

// 그룹(제품×종류)마다 N건을 뽑는다. 제품별·종류별로 따로 뽑아야
// "미스트 영상이 하나도 없는" 상황이 안 생긴다.
function pickForGroup(cells, allCells, shotPool, dayIndex, offset, n) {
  const winners = cells.filter(x => x.s.win > 0)
    .sort((a, b) => b.s.win - a.s.win || ((b.s.metric.value ?? 0) - (a.s.metric.value ?? 0)));
  // 위너가 아직 없는 그룹(영상이 그렇다)은 지표가 가장 높은 집행분을 기준으로 삼는다.
  const best = cells.filter(x => x.s.run > 0)
    .sort((a, b) => ((b.s.metric.value ?? 0) - (a.s.metric.value ?? 0)));
  const base = winners.length ? winners : best;
  const fresh = cells.filter(x => x.s.run === 0).sort((a, b) => b.s.made - a.s.made);

  const out = [];
  for (let i = 0; i < n; i++) {
    const slot = (dayIndex * n + i + offset) % 10;   // 0~5 증량 · 6~8 변주 · 9 신규
    let mode = slot < 6 ? '증량' : slot < 9 ? '변주' : '신규';
    if (mode === '신규' && !fresh.length) mode = '증량';
    if (mode !== '신규' && !base.length) mode = fresh.length ? '신규' : null;
    if (!mode) continue;

    if (mode === '신규') {
      const t = fresh[(dayIndex + i) % fresh.length];
      out.push({ ...t, mode, tone: 'new',
        why: `제작 ${t.s.made}건 · 집행 0건 — 성과 데이터가 없는 칸`,
        note: '1건 태워서 판정 표본을 만든다', shotNew: null });
      continue;
    }
    const t = base[(dayIndex + i) % base.length];
    if (mode === '증량') {
      out.push({ ...t, mode, tone: winners.length ? 'win' : 'test', shotNew: null,
        why: winners.length
          ? `위너 ${t.s.win}건 · ${t.s.metric.label} ${pct(t.s.metric.value)}`
          : `아직 위너 없음 · 이 그룹 최고 ${t.s.metric.label} ${pct(t.s.metric.value)}`,
        note: '검증된 조합 그대로 한 장 더. 소재만 새로' });
    } else {
      // 같은 앵글에서 아직 안 쓴 훅으로. 앵글은 검증됐으니 건드리지 않는다.
      const used = new Set(allCells.filter(x => x.angleKey === t.angleKey).map(x => x.hookKey));
      const unused = shotPool.filter(x => !used.has(x));
      const shotNew = unused.length ? unused[(dayIndex + i + offset) % unused.length] : null;
      out.push({ ...t, mode, tone: 'remix', shotNew,
        why: `${t.angle} 앵글은 검증됨 · ${t.hook} 훅은 이미 씀`,
        note: shotNew ? `앵글은 두고 훅만 ${shotNew} 로 교체` : '훅 문구만 새로 씀' });
    }
  }
  return out;
}

// 오늘 뽑을 것 — 시장 → 제품 → 종류(이미지/영상) 별로 각 N건.
// 반환: [{ productKey, product, image: [...], video: [...] }]
export function buildPicks(data, { market = 'us', perKind = 3, today = new Date() } = {}) {
  const cells = flatCells(data, { market });
  if (!cells.length) return [];
  const shotPool = Object.keys(data.dict?.shot || {});
  const dayIndex = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);

  const products = [...new Set(cells.map(c => c.pk))]
    .sort((a, b) => {
      const sa = cells.filter(c => c.pk === a).reduce((s, c) => s + c.s.run, 0);
      const sb = cells.filter(c => c.pk === b).reduce((s, c) => s + c.s.run, 0);
      return sb - sa;
    })
    .filter(p => p !== 'SET');   // 세트는 아직 집행 이력이 없다 — 나오면 그때 넣는다

  return products.map((pk, pi) => ({
    productKey: pk, product: PRODUCT[pk] || pk,
    image: pickForGroup(cells.filter(c => c.pk === pk && c.kind === 'image'), cells, shotPool, dayIndex, pi * 3, perKind),
    video: pickForGroup(cells.filter(c => c.pk === pk && c.kind === 'video'), cells, shotPool, dayIndex, pi * 3 + 1, perKind),
  }));
}

import { useState, useEffect, useMemo } from 'react';
import { flatCells, buildPicks, MARKET, PRODUCT, KIND } from '../lib/plan';

// 콘텐츠 보드 — 한 장짜리 표.
//
// 처음엔 가지를 눌러 내려가는 나무였는데, 보려면 매번 눌러야 해서 답답했다.
// 앵글 × 훅은 어차피 닫힌 목록이라 **격자로 펴면 한 화면에 다 들어간다.**
//   세로 = 앵글(대카)   가로 = 훅(소카)   칸 = 평균 지표 + 집행 건수
// 클릭은 "그 칸의 실물이 궁금할 때"만 한다.
//
// 색: 진한 초록일수록 잘 됨 · 빨강은 폐기 · 옅은 회색은 만들고 안 돌린 칸 · 빈칸은 없음

const C = {
  bg: '#F5F5F7', card: '#FFFFFF', line: '#E5E5EA',
  text: '#1D1D1F', sub: '#6E6E73', faint: '#AEAEB2',
  win: '#0A7D32', remix: '#B26A00', drop: '#C0392B',
};
const TONE = { win: C.win, remix: C.remix, new: C.text, test: C.sub };
const pct = (v) => (v == null ? '—' : `${v}%`);
const money = (v, cur) => (v == null ? '—' : `${cur === 'USD' ? '$' : '₩'}${Math.round(v).toLocaleString()}`);

// 칸 색 — 합격선 대비 얼마나 되는지로 진하기를 정한다.
function cellStyle(s, pass) {
  if (!s) return { background: 'transparent', color: C.faint };
  if (s.run === 0) return { background: '#F7F7F9', color: C.faint };
  const v = s.metric.value;
  if (v == null) return { background: '#F2F2F5', color: C.sub };
  if (s.drop > 0 && s.win === 0) return { background: '#FBEAE8', color: C.drop };
  const r = pass ? v / pass : 0;
  if (r >= 1.2) return { background: '#0A7D32', color: '#FFF' };
  if (r >= 1.0) return { background: '#BFE3C8', color: '#0A5223' };
  if (r >= 0.8) return { background: '#EAF4EC', color: '#2C5F3A' };
  return { background: '#F2F2F5', color: C.sub };
}

function Matrix({ cells, pass, onPick, picked }) {
  // 값이 있는 앵글·훅만 축으로 쓴다(빈 줄을 만들지 않는다).
  const angles = useMemo(() => {
    const m = new Map();
    for (const c of cells) {
      if (!m.has(c.angleKey)) m.set(c.angleKey, { key: c.angleKey, name: c.angle, run: 0, made: 0, win: 0 });
      const a = m.get(c.angleKey);
      a.run += c.s.run; a.made += c.s.made; a.win += c.s.win;
    }
    return [...m.values()].sort((a, b) => b.win - a.win || b.run - a.run || b.made - a.made);
  }, [cells]);
  const hooks = useMemo(() => {
    const m = new Map();
    for (const c of cells) {
      if (!m.has(c.hookKey)) m.set(c.hookKey, { key: c.hookKey, name: c.hook, run: 0, win: 0 });
      const h = m.get(c.hookKey);
      h.run += c.s.run; h.win += c.s.win;
    }
    return [...m.values()].sort((a, b) => b.win - a.win || b.run - a.run);
  }, [cells]);
  const byKey = useMemo(() => {
    const m = new Map();
    for (const c of cells) m.set(`${c.angleKey}|${c.hookKey}`, c);
    return m;
  }, [cells]);

  if (!angles.length) return <div style={{ fontSize: 12.5, color: C.faint, padding: '10px 2px' }}>해당 소재가 없습니다.</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontSize: 11.5 }}>
        <thead>
          <tr>
            <th style={{ position: 'sticky', left: 0, background: C.card, textAlign: 'left', padding: '4px 8px', fontWeight: 500, color: C.faint, fontSize: 10.5, minWidth: 112 }}>
              앵글 \ 훅
            </th>
            {hooks.map(h => (
              <th key={h.key} style={{ padding: '4px 6px', fontWeight: 500, color: h.win ? C.text : C.faint, fontSize: 10, minWidth: 58, whiteSpace: 'nowrap' }}>
                {h.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {angles.map(a => (
            <tr key={a.key}>
              <td style={{ position: 'sticky', left: 0, background: C.card, padding: '4px 8px', whiteSpace: 'nowrap' }}>
                <span style={{ color: C.text, fontWeight: a.win ? 600 : 400 }}>{a.name}</span>
                <span style={{ color: C.faint, fontSize: 10 }}> {a.run}/{a.made}</span>
              </td>
              {hooks.map(h => {
                const c = byKey.get(`${a.key}|${h.key}`);
                const st = cellStyle(c?.s, pass);
                const on = picked === `${a.key}|${h.key}`;
                return (
                  <td key={h.key} style={{ padding: 0 }}>
                    <div
                      onClick={() => c && onPick(on ? null : `${a.key}|${h.key}`)}
                      title={c ? `${a.name} · ${h.name} — 제작 ${c.s.made} 집행 ${c.s.run} 위너 ${c.s.win}` : ''}
                      style={{
                        ...st, minWidth: 58, height: 36, borderRadius: 5, cursor: c ? 'pointer' : 'default',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        boxShadow: on ? `0 0 0 2px ${C.text}` : 'none', lineHeight: 1.15,
                      }}
                    >
                      {c ? <>
                        <span style={{ fontWeight: 600, fontSize: 11.5 }}>{c.s.run ? pct(c.s.metric.value) : '—'}</span>
                        <span style={{ fontSize: 9, opacity: 0.8 }}>{c.s.run ? `${c.s.run}건${c.s.win ? ` ·${c.s.win}승` : ''}` : `제작${c.s.made}`}</span>
                      </> : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Leaves({ list }) {
  const GRADE = { win: ['위너', C.win], keep: ['유지', C.sub], remix: ['부분수정', C.remix], drop: ['폐기', C.drop] };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
      {list.slice(0, 12).map(x => {
        const g = GRADE[x.grade] || [x.run ? '측정중' : '미집행', C.faint];
        return (
          <div key={x.id} style={{ width: 96 }} title={x.claim || x.id}>
            <div style={{ width: 96, height: 96, borderRadius: 6, background: '#F0F0F3', overflow: 'hidden', border: `1px solid ${C.line}` }}>
              {x.thumbnail_url
                ? <img src={x.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, color: C.faint }}>
                    {x.kind === 'video' ? '영상' : '미집행'}
                  </div>}
            </div>
            <div style={{ fontSize: 10, color: g[1], fontWeight: 600, marginTop: 3 }}>{g[0]}</div>
            <div style={{ fontSize: 10, color: C.sub }}>
              {x.run ? `${pct(x.kind === 'video' ? x.hookRate : x.ctr)} · ${money(x.spend, x.currency)}` : (x.date || '')}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PickCard({ p, onQueue, queued }) {
  return (
    <div style={{ background: '#FAFAFB', border: `1px solid ${C.line}`, borderRadius: 8, padding: 9, display: 'flex', gap: 9 }}>
      <div style={{ width: 42, height: 42, borderRadius: 5, background: '#F0F0F3', flexShrink: 0, overflow: 'hidden' }}>
        {p.s?.thumb
          ? <img src={p.s.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: C.faint }}>신규</div>}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#FFF', background: TONE[p.tone] || C.text, padding: '1px 5px', borderRadius: 3 }}>{p.mode}</span>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.angleKey}-{p.shotNew || p.hookKey}
        </div>
        <div style={{ fontSize: 10, color: C.faint, marginTop: 3, lineHeight: 1.4 }}>{p.why}</div>
        <button
          onClick={() => !queued && onQueue(p)}
          disabled={queued}
          style={{
            marginTop: 6, padding: '3px 9px', fontSize: 10.5, borderRadius: 5, fontFamily: 'inherit',
            cursor: queued ? 'default' : 'pointer',
            border: `1px solid ${queued ? C.line : C.text}`,
            background: queued ? '#F2F2F5' : C.text, color: queued ? C.faint : '#FFF', fontWeight: 600,
          }}
        >
          {queued ? '큐에 있음' : '큐에 넣기'}
        </button>
      </div>
    </div>
  );
}

export default function BoardView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [market, setMarket] = useState('us');      // 미국 먼저 — MINE 확인(2026-09-22)
  const [product, setProduct] = useState('MIST');
  const [picked, setPicked] = useState(null);
  // 기본은 집행분만. 미집행 234건을 다 펴면 격자가 가로로 넘쳐 읽을 수 없다.
  const [onlyRun, setOnlyRun] = useState(true);
  const [queued, setQueued] = useState(new Set());   // 이번 세션에서 큐에 넣은 조합
  const [skeletons, setSkeletons] = useState([]);
  const [skeletonId, setSkeletonId] = useState('');

  useEffect(() => {
    let alive = true;
    const t0 = performance.now();
    fetch('/api/content/types?market=all')
      .then(r => r.json())
      .then(d => { if (!alive) return; d.error ? setErr(d.error) : setData({ ...d, _ms: Math.round(performance.now() - t0) }); })
      .catch(e => alive && setErr(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  // 골격 목록 — 큐에 넣을 때 어느 구조로 만들지 같이 넘긴다.
  useEffect(() => {
    fetch('/api/content/skeletons').then(r => r.json())
      .then(d => { const l = d.skeletons || []; setSkeletons(l); if (l[0]) setSkeletonId(l[0].id); })
      .catch(() => {});
  }, []);

  const sendToQueue = async (p) => {
    const key = `${p.mk}|${p.pk}|${p.kind}|${p.angleKey}|${p.shotNew || p.hookKey}`;
    const body = {
      market: p.mk, product: p.pk, kind: p.kind,
      angle: p.angleKey, hook: p.shotNew || p.hookKey,
      mode: p.mode, skeletonId: skeletonId || null,
      note: p.note, thumb: p.s?.thumb || null,
    };
    const r = await fetch('/api/content/queue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!d.error) setQueued(s => new Set(s).add(key));
  };
  const isQueued = (p) => queued.has(`${p.mk}|${p.pk}|${p.kind}|${p.angleKey}|${p.shotNew || p.hookKey}`);

  const cells = useMemo(
    () => flatCells(data, { market }).filter(c => c.pk === product && (!onlyRun || c.s.run > 0)),
    [data, market, product, onlyRun]);
  const picks = useMemo(() => buildPicks(data, { market, perKind: 3 }), [data, market]);
  const mine = picks.find(p => p.productKey === product);
  const pass = (kind) => kind === 'video'
    ? data?.thresholds?.video?.hookRate?.pass
    : (data?.thresholds?.static?.[market]?.ctr?.pass ?? data?.thresholds?.static?.default?.ctr?.pass);

  const leafList = useMemo(() => {
    if (!picked) return null;
    const [a, h] = picked.split('|');
    return cells.filter(c => c.angleKey === a && c.hookKey === h).flatMap(c => c.list)
      .sort((x, y) => (y.spendUsd || 0) - (x.spendUsd || 0));
  }, [picked, cells]);

  const products = useMemo(() => {
    const set = new Set(flatCells(data, { market }).map(c => c.pk));
    return ['MIST', 'AMPOULE', 'SET'].filter(p => set.has(p));
  }, [data, market]);

  const box = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 14 };
  const tab = (a) => ({
    padding: '5px 12px', fontSize: 12.5, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
    border: `1px solid ${a ? C.text : C.line}`, background: a ? C.text : C.card,
    color: a ? '#FFF' : C.sub, fontWeight: a ? 600 : 400,
  });

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg }}>
      <div style={{ padding: '20px 26px 60px', maxWidth: 1340, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: C.text, margin: 0 }}>콘텐츠 보드</h1>
          <p style={{ fontSize: 12.5, color: C.sub, margin: '5px 0 0' }}>
            세로가 앵글, 가로가 훅입니다. 진한 초록일수록 잘 되는 칸이고, 칸을 누르면 실제 소재가 아래에 뜹니다.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          {['us', 'kr'].map(v => <button key={v} style={tab(market === v)} onClick={() => { setMarket(v); setPicked(null); }}>{MARKET[v]}</button>)}
          <span style={{ width: 8 }} />
          {products.map(v => <button key={v} style={tab(product === v)} onClick={() => { setProduct(v); setPicked(null); }}>{PRODUCT[v] || v}</button>)}
          <span style={{ width: 8 }} />
          <button style={tab(!onlyRun)} onClick={() => { setOnlyRun(v => !v); setPicked(null); }}>미집행까지</button>
          {skeletons.length > 0 && (
            <select
              value={skeletonId} onChange={e => setSkeletonId(e.target.value)}
              style={{ padding: '5px 9px', fontSize: 12, borderRadius: 6, border: `1px solid ${C.line}`, background: C.card, color: C.sub, fontFamily: 'inherit' }}
            >
              {skeletons.map(s => <option key={s.id} value={s.id}>골격: {s.name}</option>)}
            </select>
          )}
          {data?._ms != null && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: C.faint }}>
              {data._ms}ms{data.cached ? ` · ${data.ageMin ?? 0}분 전 집계` : ' · 새로 집계'}
            </span>
          )}
        </div>

        {loading && <div style={{ ...box, color: C.sub, fontSize: 13 }}>불러오는 중…</div>}
        {err && <div style={{ ...box, color: C.drop, fontSize: 13 }}>오류: {err}</div>}

        {data && !loading && (
          <>
            {['image', 'video'].map(kind => (
              <div key={kind} style={box}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600, color: C.text }}>{KIND[kind]}형</span>
                  <span style={{ fontSize: 11, color: C.faint }}>
                    {kind === 'video' ? '훅률' : 'CTR'} 합격 ≥{pass(kind)}% · 칸 위 숫자는 평균 지표, 아래는 집행 건수
                  </span>
                </div>
                <Matrix cells={cells.filter(c => c.kind === kind)} pass={pass(kind)} onPick={setPicked} picked={picked} />
                {mine && mine[kind]?.length > 0 && (
                  <div style={{ marginTop: 13, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>
                      오늘 뽑을 {KIND[kind]} {mine[kind].length}건
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(215px,1fr))', gap: 8 }}>
                      {mine[kind].map((p, i) => <PickCard key={i} p={p} onQueue={sendToQueue} queued={isQueued(p)} />)}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {leafList && (
              <div style={box}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                  {picked.split('|').join(' · ')} <span style={{ fontWeight: 400, color: C.faint, fontSize: 11.5 }}>{leafList.length}건</span>
                </div>
                <Leaves list={leafList} />
              </div>
            )}

            <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.6 }}>
              출처: {Object.entries(data.source || {}).map(([k, v]) => v.error ? `${k.toUpperCase()} 오류` : `${v.name} ${v.rows}행`).join(' · ')}
              {' · '}Meta 최근 90일 {data.fetched?.ads != null && `· 광고 ${data.fetched.ads}건`}
              {data.fetched?.empty?.length > 0 && <span style={{ color: C.remix }}> · 응답 없음: {data.fetched.empty.join(', ')}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

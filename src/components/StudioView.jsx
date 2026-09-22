import { useState, useEffect } from 'react';
import { PRODUCT, MARKET, KIND } from '../lib/plan';

// 생성 스튜디오 — 뽑힌 조합이 실제 소재가 될 때까지.
//
//   대기 → 생성중 → 검수 → 발행준비 → 발행됨
//
// 무한 생성의 관건은 만드는 속도가 아니라 **떨어뜨리지 않는 것**이다.
// 어디서 막혀 있는지가 한눈에 보여야 한다.
//
// 소재ID 는 큐에 들어올 때 이미 발급돼 있다. 담당자가 그 이름으로 Meta 에 올리면
// 성과가 추론 없이 자동으로 붙는다.

const C = {
  bg: '#F5F5F7', card: '#FFFFFF', line: '#E5E5EA',
  text: '#1D1D1F', sub: '#6E6E73', faint: '#AEAEB2',
  win: '#0A7D32', remix: '#B26A00', drop: '#C0392B',
};
const LANES = ['대기', '생성중', '검수', '발행준비', '발행됨'];
const LANE_COLOR = { 대기: C.faint, 생성중: '#2F6FED', 검수: C.remix, 발행준비: '#7A4DD1', 발행됨: C.win };
const MODE_COLOR = { 증량: C.win, 변주: C.remix, 신규: C.text };

export default function StudioView({ onNavigate }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);

  const reload = () => fetch('/api/content/queue')
    .then(r => r.json())
    .then(d => (d.error ? setErr(d.error) : setData(d)))
    .catch(e => setErr(e.message));

  useEffect(() => { reload(); }, []);

  const move = async (id, status) => {
    setBusy(id);
    try {
      await fetch(`/api/content/queue?id=${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      });
      await reload();
    } finally { setBusy(null); }
  };
  const drop = async (id) => {
    setBusy(id);
    try { await fetch(`/api/content/queue?id=${id}`, { method: 'DELETE' }); await reload(); }
    finally { setBusy(null); }
  };

  const box = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 14 };
  const items = data?.items || [];
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = items.filter(x => x.createdAt === today).length;

  const Card = ({ x }) => {
    const li = LANES.indexOf(x.status);
    const next = LANES[li + 1];
    const prev = LANES[li - 1];
    return (
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, opacity: busy === x.id ? 0.5 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {x.mode && (
            <span style={{ fontSize: 9, fontWeight: 700, color: '#FFF', background: MODE_COLOR[x.mode] || C.sub, padding: '1px 5px', borderRadius: 3 }}>{x.mode}</span>
          )}
          <span style={{ fontSize: 9.5, color: C.faint }}>{KIND[x.kind]}</span>
          <span style={{ fontSize: 9.5, color: C.faint, marginLeft: 'auto' }}>{MARKET[x.market] || x.market} · {PRODUCT[x.product] || x.product}</span>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginTop: 5 }}>{x.angle}-{x.hook}</div>
        {/* 소재ID 가 이 카드의 존재 이유다 — 이게 있어야 나중에 성과가 붙는다 */}
        <div style={{ fontSize: 9.5, color: C.sub, marginTop: 3, wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace' }}>{x.assetId}</div>
        {x.skeletonId && <div style={{ fontSize: 10, color: C.faint, marginTop: 3 }}>골격 {x.skeletonId}</div>}
        {x.note && <div style={{ fontSize: 10.5, color: C.sub, marginTop: 5, lineHeight: 1.45 }}>{x.note}</div>}
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          {prev && <button onClick={() => move(x.id, prev)} title={`${prev}로`} style={miniBtn}>←</button>}
          {next && <button onClick={() => move(x.id, next)} style={{ ...miniBtn, borderColor: C.text, color: C.text, fontWeight: 600 }}>{next} →</button>}
          <button onClick={() => drop(x.id)} title="버림" style={{ ...miniBtn, marginLeft: 'auto', color: C.drop, borderColor: '#F0D5D2' }}>버림</button>
        </div>
      </div>
    );
  };

  const miniBtn = {
    padding: '3px 8px', fontSize: 10.5, borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
    border: `1px solid ${C.line}`, background: C.card, color: C.sub,
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg }}>
      <div style={{ padding: '20px 26px 60px', maxWidth: 1440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: C.text, margin: 0 }}>생성 스튜디오</h1>
          <p style={{ fontSize: 12.5, color: C.sub, margin: '5px 0 0' }}>
            보드에서 뽑은 조합이 발행될 때까지 여기서 흘러갑니다. 오늘 들어온 건 {todayCount}건입니다.
          </p>
        </div>

        {err && <div style={{ ...box, color: C.drop, fontSize: 13 }}>오류: {err}</div>}
        {!data && !err && <div style={{ ...box, color: C.sub, fontSize: 13 }}>불러오는 중…</div>}

        {data && items.length === 0 && (
          <div style={{ ...box, fontSize: 13, color: C.sub, lineHeight: 1.7 }}>
            큐가 비어 있습니다. <b style={{ color: C.text }}>콘텐츠 보드</b>에서 오늘 뽑을 조합을 <b>큐에 넣기</b> 하면 여기로 들어옵니다.
            <div style={{ marginTop: 10 }}>
              <button onClick={() => onNavigate?.('board')} style={{ ...miniBtn, padding: '6px 14px', fontSize: 12.5, borderColor: C.text, color: '#FFF', background: C.text, fontWeight: 600 }}>
                보드로 가기
              </button>
            </div>
          </div>
        )}

        {data && items.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${LANES.length},minmax(190px,1fr))`, gap: 11, alignItems: 'start' }}>
            {LANES.map(lane => {
              const mine = items.filter(x => x.status === lane);
              return (
                <div key={lane} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 2px' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: LANE_COLOR[lane] }} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{lane}</span>
                    <span style={{ fontSize: 11, color: C.faint }}>{mine.length}</span>
                  </div>
                  {mine.length === 0
                    ? <div style={{ border: `1px dashed ${C.line}`, borderRadius: 8, padding: '14px 8px', fontSize: 11, color: C.faint, textAlign: 'center' }}>비어 있음</div>
                    : mine.map(x => <Card key={x.id} x={x} />)}
                </div>
              );
            })}
          </div>
        )}

        {data && items.length > 0 && (
          <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.6 }}>
            소재ID는 큐에 들어올 때 발급됩니다. 담당자가 <b>그 이름 그대로</b> Meta에 올려야 성과가 자동으로 붙습니다.
            <br />총 {data.total}건 · {LANES.map(l => `${l} ${data.counts?.[l] ?? 0}`).join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}

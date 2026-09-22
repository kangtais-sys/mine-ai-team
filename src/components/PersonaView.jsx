import { useState, useEffect } from 'react';

// 페르소나 — 트랙 B(AI 인플루언서).
// 트랙 A(소재 무한 생성)와 **같은 골격**을 쓴다. 얼굴만 페르소나로 바뀐다.

const C = {
  bg: '#F5F5F7', card: '#FFFFFF', line: '#E5E5EA',
  text: '#1D1D1F', sub: '#6E6E73', faint: '#AEAEB2',
  win: '#0A7D32', remix: '#B26A00', drop: '#C0392B',
};
const EMPTY = { name: '', handle: '', market: 'us', look: '', voice: '', tone: '', disclosure: 'AI로 제작된 영상입니다', note: '' };

export default function PersonaView() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = () => fetch('/api/content/personas')
    .then(r => r.json())
    .then(d => (d.error ? setErr(d.error) : setData(d)))
    .catch(e => setErr(e.message));
  useEffect(() => { reload(); }, []);

  const submit = async () => {
    if (!form?.name) return;
    setBusy(true);
    try {
      const r = await fetch('/api/content/personas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const d = await r.json();
      if (d.error) setErr(d.error); else { setForm(null); reload(); }
    } finally { setBusy(false); }
  };

  const move = async (id, stage) => {
    const r = await fetch(`/api/content/personas?id=${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage }),
    });
    const d = await r.json();
    if (d.error) setErr(d.error); else { setErr(null); reload(); }
  };

  const stages = data?.stages || [];
  const box = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 14 };
  const input = { width: '100%', padding: '7px 9px', fontSize: 12.5, border: `1px solid ${C.line}`, borderRadius: 6, fontFamily: 'inherit', color: C.text, background: '#FFF' };
  const label = { fontSize: 11, color: C.sub, display: 'block', marginBottom: 4 };
  const btn = (primary) => ({
    padding: '6px 14px', fontSize: 12.5, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
    border: `1px solid ${primary ? C.text : C.line}`, background: primary ? C.text : C.card,
    color: primary ? '#FFF' : C.sub, fontWeight: primary ? 600 : 400,
  });

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg }}>
      <div style={{ padding: '20px 26px 60px', maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: C.text, margin: 0 }}>페르소나</h1>
            <p style={{ fontSize: 12.5, color: C.sub, margin: '5px 0 0' }}>
              AI 인플루언서 계정의 정체입니다. 트랙 A와 <b>같은 골격</b>을 쓰고 얼굴만 바뀝니다.
            </p>
          </div>
          <button style={btn(true)} onClick={() => setForm(form ? null : { ...EMPTY })}>{form ? '닫기' : '페르소나 추가'}</button>
        </div>

        <div style={{ ...box, borderColor: '#F0D9A0', background: '#FFFBF2', fontSize: 12, color: C.sub, lineHeight: 1.7 }}>
          <b style={{ color: C.remix }}>두 가지는 지키고 갑니다</b><br />
          ① 페르소나는 <b>브랜드 진행자</b>입니다. 본인이 써봤다고 증언하지 않습니다 — 증거 자리에는 실제 후기 스크린샷을 씁니다.<br />
          ② <b>AI 연출 표기</b>가 없으면 운영중으로 못 올라갑니다(서버에서 막습니다).<br />
          <span style={{ color: C.faint }}>계정은 3~5개로 시작해 생존율을 보고 늘립니다. 대량 계정은 플랫폼이 탐지해 한 번에 막습니다.</span>
        </div>

        {err && <div style={{ ...box, color: C.drop, fontSize: 13 }}>오류: {err}</div>}

        {form && (
          <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 10 }}>
              <div><span style={label}>이름</span><input style={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div><span style={label}>핸들</span><input style={input} value={form.handle} placeholder="@..." onChange={e => setForm({ ...form, handle: e.target.value })} /></div>
              <div><span style={label}>시장</span>
                <select style={input} value={form.market} onChange={e => setForm({ ...form, market: e.target.value })}>
                  <option value="us">미국</option><option value="kr">한국</option>
                </select>
              </div>
            </div>
            <div><span style={label}>외형 — Higgsfield 캐릭터 고정용</span><input style={input} value={form.look} placeholder="30대 후반 한국계 여성, 단발, 뉴트럴 톤 니트" onChange={e => setForm({ ...form, look: e.target.value })} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><span style={label}>목소리</span><input style={input} value={form.voice} onChange={e => setForm({ ...form, voice: e.target.value })} /></div>
              <div><span style={label}>말투</span><input style={input} value={form.tone} onChange={e => setForm({ ...form, tone: e.target.value })} /></div>
            </div>
            <div><span style={label}>AI 연출 표기 (필수 — 없으면 운영중 불가)</span><input style={input} value={form.disclosure} onChange={e => setForm({ ...form, disclosure: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn(true)} disabled={busy} onClick={submit}>{busy ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        )}

        {!data && !err && <div style={{ ...box, color: C.sub, fontSize: 13 }}>불러오는 중…</div>}

        {data && data.total === 0 && (
          <div style={{ ...box, fontSize: 12.5, color: C.sub, lineHeight: 1.8 }}>
            아직 페르소나가 없습니다. 트랙 B는 이 순서로 갑니다.
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {stages.filter(s => s !== '중단').map((s, i) => (
                <span key={s} style={{ fontSize: 11.5, color: C.sub, background: '#F2F2F5', padding: '4px 9px', borderRadius: 5 }}>
                  {i + 1}. {s}
                </span>
              ))}
            </div>
            <div style={{ marginTop: 10, color: C.faint, fontSize: 11.5 }}>
              트랙 A(소재 무한 생성)가 먼저입니다. 골격이 쌓여야 페르소나가 쓸 재료가 생깁니다.
            </div>
          </div>
        )}

        {data && data.total > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
            {data.personas.map(p => (
              <div key={p.id} style={{ ...box, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: C.faint }}>{p.handle}</span>
                  <span style={{ fontSize: 10, color: '#FFF', background: p.stage === '운영중' ? C.win : C.faint, padding: '1.5px 6px', borderRadius: 4, fontWeight: 700, marginLeft: 'auto' }}>{p.stage}</span>
                </div>
                <div style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.6 }}>
                  {p.look && <>{p.look}<br /></>}
                  {p.voice && <>목소리 {p.voice} · </>}{p.tone}
                </div>
                <div style={{ fontSize: 10.5, color: p.disclosure ? C.sub : C.drop }}>
                  {p.disclosure ? `표기: ${p.disclosure}` : 'AI 연출 표기 없음 — 운영 불가'}
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 4 }}>
                  {stages.filter(s => s !== p.stage).slice(0, 4).map(s => (
                    <button key={s} style={{ ...btn(false), padding: '3px 8px', fontSize: 10.5 }} onClick={() => move(p.id, s)}>{s}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

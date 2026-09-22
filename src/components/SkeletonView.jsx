import { useState, useEffect } from 'react';

// 골격 라이브러리 — 무한 생성의 연료.
//
// 골격은 **구조**다. 컷 타이밍·카메라·자막 위치·BGM 타입만 담는다.
// 얼굴·제품·워딩은 이식 단계에서 우리 것으로 갈아끼운다.
//
// 상태: 후보 → (우리 성과로 합격하면) 검증 → (안 먹히면) 보류
// '검증'은 우리가 돌려서 위너가 나온 골격만 붙는다. 남이 터졌다고 검증이 아니다.

const C = {
  bg: '#F5F5F7', card: '#FFFFFF', line: '#E5E5EA',
  text: '#1D1D1F', sub: '#6E6E73', faint: '#AEAEB2',
  win: '#0A7D32', remix: '#B26A00', drop: '#C0392B',
};
const STATUS = { 검증: C.win, 후보: C.remix, 보류: C.faint };
const KIND = { video: '영상', image: '이미지' };

const EMPTY = { name: '', kind: 'video', source: '', sourceNote: '', captionPattern: '', bgm: '', ratio: '9:16', beatsText: '', fitsText: '' };

export default function SkeletonView() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(null);      // null = 폼 닫힘
  const [busy, setBusy] = useState(false);

  const reload = () => fetch('/api/content/skeletons')
    .then(r => r.json())
    .then(d => (d.error ? setErr(d.error) : setList(d.skeletons)))
    .catch(e => setErr(e.message));

  useEffect(() => { reload(); }, []);

  const submit = async () => {
    if (!form?.name) return;
    setBusy(true);
    try {
      // 구간은 "0~1.8초 | 팟캐스트 2샷" 한 줄에 하나로 받는다. 표 입력은 과하다.
      const beats = form.beatsText.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
        const [at, ...rest] = l.split('|');
        return { at: (at || '').trim(), what: rest.join('|').trim() };
      });
      const body = { ...form, beats, fits: form.fitsText.split(/[,\s]+/).filter(Boolean).map(s => s.toUpperCase()) };
      delete body.beatsText; delete body.fitsText;
      const r = await fetch('/api/content/skeletons', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.error) setErr(d.error); else { setForm(null); reload(); }
    } finally { setBusy(false); }
  };

  const setStatus = async (id, status) => {
    await fetch(`/api/content/skeletons?id=${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    });
    reload();
  };

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
            <h1 style={{ fontSize: 20, fontWeight: 600, color: C.text, margin: 0 }}>골격 라이브러리</h1>
            <p style={{ fontSize: 12.5, color: C.sub, margin: '5px 0 0' }}>
              터진 소재에서 <b>구조만</b> 뽑아 모아둡니다. 얼굴·제품·워딩은 이식 단계에서 우리 걸로 바꿉니다.
              골격이 쌓일수록 만들 수 있는 조합이 곱해집니다.
            </p>
          </div>
          <button style={btn(true)} onClick={() => setForm(form ? null : { ...EMPTY })}>
            {form ? '닫기' : '골격 추가'}
          </button>
        </div>

        {err && <div style={{ ...box, color: C.drop, fontSize: 13 }}>오류: {err}</div>}

        {form && (
          <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
              <div><span style={label}>이름</span><input style={input} value={form.name} placeholder="팟캐스트 폭로형" onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div><span style={label}>종류</span>
                <select style={input} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
                  <option value="video">영상</option><option value="image">이미지</option>
                </select>
              </div>
              <div><span style={label}>비율</span><input style={input} value={form.ratio} onChange={e => setForm({ ...form, ratio: e.target.value })} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><span style={label}>출처</span><input style={input} value={form.source} placeholder="Threads @계정 / TikTok URL" onChange={e => setForm({ ...form, source: e.target.value })} /></div>
              <div><span style={label}>출처 메모 (조회수 등)</span><input style={input} value={form.sourceNote} onChange={e => setForm({ ...form, sourceNote: e.target.value })} /></div>
            </div>
            <div>
              <span style={label}>구간 — 한 줄에 하나. <code>0~1.8초 | 무엇이 보이는가</code></span>
              <textarea style={{ ...input, minHeight: 92, lineHeight: 1.6 }} value={form.beatsText}
                placeholder={'0~1.8초 | 2샷 세팅 · 듣는 쪽 리액션 · 상단 텍스트 1줄\n1.8~7초 | 말하는 쪽 클로즈업 3컷 · 대문자 자막'}
                onChange={e => setForm({ ...form, beatsText: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
              <div><span style={label}>자막 문법</span><input style={input} value={form.captionPattern} placeholder="The {나라} secret to {결과} is finally OUT" onChange={e => setForm({ ...form, captionPattern: e.target.value })} /></div>
              <div><span style={label}>BGM</span><input style={input} value={form.bgm} onChange={e => setForm({ ...form, bgm: e.target.value })} /></div>
              <div><span style={label}>맞는 앵글 (BA GLA ING)</span><input style={input} value={form.fitsText} onChange={e => setForm({ ...form, fitsText: e.target.value })} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn(true)} disabled={busy} onClick={submit}>{busy ? '저장 중…' : '저장'}</button>
              <span style={{ fontSize: 11, color: C.faint, alignSelf: 'center' }}>새 골격은 항상 <b>후보</b>로 들어갑니다. 우리 성과로 위너가 나와야 검증이 됩니다.</span>
            </div>
          </div>
        )}

        {!list && !err && <div style={{ ...box, color: C.sub, fontSize: 13 }}>불러오는 중…</div>}

        {list && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: 12 }}>
            {list.map(s => (
              <div key={s.id} style={{ ...box, display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{s.name}</span>
                  <span style={{ fontSize: 10, color: '#FFF', background: STATUS[s.status] || C.faint, padding: '1.5px 6px', borderRadius: 4, fontWeight: 700 }}>{s.status}</span>
                  <span style={{ fontSize: 10.5, color: C.faint, marginLeft: 'auto' }}>{KIND[s.kind]} · {s.ratio}</span>
                </div>
                <div style={{ fontSize: 10.5, color: C.faint }}>{s.id}</div>

                <div style={{ borderLeft: `2px solid ${C.line}`, paddingLeft: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {(s.beats || []).map((b, i) => (
                    <div key={i} style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                      <span style={{ color: C.faint, marginRight: 6 }}>{b.at}</span>
                      <span style={{ color: C.text }}>{b.what}</span>
                    </div>
                  ))}
                </div>

                {s.captionPattern && (
                  <div style={{ fontSize: 11.5, color: C.text, background: '#F7F7F9', padding: '6px 8px', borderRadius: 5 }}>
                    “{s.captionPattern}”
                  </div>
                )}
                <div style={{ fontSize: 10.5, color: C.sub, lineHeight: 1.5 }}>
                  {s.bgm && <>BGM {s.bgm}<br /></>}
                  {s.source && <>출처 {s.source}</>}
                  {s.sourceNote && <><br /><span style={{ color: C.faint }}>{s.sourceNote}</span></>}
                </div>
                {s.fits?.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {s.fits.map(f => <span key={f} style={{ fontSize: 9.5, color: C.sub, background: '#F2F2F5', padding: '2px 6px', borderRadius: 3 }}>{f}</span>)}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 5, marginTop: 'auto', paddingTop: 4 }}>
                  {['검증', '후보', '보류'].filter(st => st !== s.status).map(st => (
                    <button key={st} style={{ ...btn(false), padding: '4px 9px', fontSize: 11 }} onClick={() => setStatus(s.id, st)}>{st}로</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {list?.length > 0 && (
          <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.6 }}>
            골격 {list.length}개 · 앵글 6 × 훅 13 과 곱하면 지금 만들 수 있는 조합은 약 {list.length * 6 * 13}가지입니다.
            <br />실제로 뽑는 양은 보드의 규칙(증량 60% · 변주 30% · 신규 10%)이 정합니다.
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';

// 소재 유형 화면 — 이미지형·영상형 × 유형을 한눈에.
// 정본은 소재로그 시트. 판정 규칙은 서버(_assetCode)에 있고 여기서 다시 쓰지 않는다.

const C = {
  bg: '#F5F5F7', card: '#FFFFFF', line: '#E5E5EA',
  text: '#1D1D1F', sub: '#6E6E73', faint: '#AEAEB2',
  win: '#0A7D32', keep: '#6E6E73', remix: '#B26A00', drop: '#C0392B',
};
const GRADE = { win: ['위너', C.win], keep: ['유지', C.keep], remix: ['부분수정', C.remix], drop: ['폐기', C.drop] };
const pct = (v) => (v == null ? '—' : `${v}%`);

function Bar({ parts, total }) {
  if (!total) return <div style={{ height: 6, background: C.line, borderRadius: 3 }} />;
  return (
    <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: C.line }}>
      {parts.filter(p => p.n > 0).map((p, i) => (
        <div key={i} style={{ width: `${p.n / total * 100}%`, background: p.color }} title={`${p.label} ${p.n}`} />
      ))}
    </div>
  );
}

function TypeCard({ t }) {
  const parts = [
    { label: '위너', n: t.win, color: C.win },
    { label: '유지', n: t.keep, color: C.keep },
    { label: '부분수정', n: t.remix, color: C.remix },
    { label: '폐기', n: t.drop, color: C.drop },
  ];
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 11, padding: 12 }}>
        <div style={{ width: 62, height: 62, borderRadius: 7, background: '#F0F0F3', flexShrink: 0, overflow: 'hidden' }}>
          {t.thumb
            ? <img src={t.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: C.faint }}>없음</div>}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{t.conceptName}</div>
          <div style={{ fontSize: 10.5, color: C.faint, marginTop: 1 }}>{t.concept}</div>
          <div style={{ fontSize: 11.5, color: C.sub, marginTop: 5 }}>
            제작 {t.made} · 집행 <b style={{ color: t.run ? C.text : C.drop }}>{t.run}</b>
            {t.win > 0 && <span style={{ color: C.win, fontWeight: 600 }}> · 위너 {t.win}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 600, color: C.text, lineHeight: 1.1 }}>
            {t.kind === 'video' ? pct(t.avgHook) : pct(t.avgCtr)}
          </div>
          <div style={{ fontSize: 9.5, color: C.faint }}>{t.kind === 'video' ? '평균 훅률' : '평균 CTR'}</div>
        </div>
      </div>
      <div style={{ padding: '0 12px 11px' }}>
        <Bar parts={parts} total={t.run} />
        {t.shots.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
            {t.shots.slice(0, 6).map(s => (
              <span key={s} style={{ fontSize: 9.5, color: C.sub, background: '#F2F2F5', padding: '2px 6px', borderRadius: 3 }}>{s}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TypesView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [market, setMarket] = useState('all');

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    fetch(`/api/content/types?market=${market}`)
      .then(r => r.json())
      .then(d => { if (!alive) return; d.error ? setErr(d.error) : setData(d); })
      .catch(e => alive && setErr(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [market]);

  const box = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 14 };
  const tab = (a) => ({
    padding: '5px 12px', fontSize: 12.5, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
    border: `1px solid ${a ? C.text : C.line}`, background: a ? C.text : C.card,
    color: a ? '#FFF' : C.sub, fontWeight: a ? 600 : 400,
  });

  const image = (data?.types || []).filter(t => t.kind === 'image');
  const video = (data?.types || []).filter(t => t.kind === 'video');

  const Section = ({ title, hint, list }) => (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{title}</span>
        <span style={{ fontSize: 11.5, color: C.faint }}>{hint}</span>
        <span style={{ fontSize: 11.5, color: C.sub, marginLeft: 'auto' }}>{list.length}종</span>
      </div>
      {list.length === 0
        ? <div style={{ ...box, color: C.sub, fontSize: 12.5 }}>집행된 소재가 없습니다.</div>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(310px,1fr))', gap: 11 }}>
            {list.map(t => <TypeCard key={t.kind + t.concept} t={t} />)}
          </div>}
    </div>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg }}>
      <div style={{ padding: '22px 26px', maxWidth: 1440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: C.text, margin: 0 }}>소재 유형</h1>
          <p style={{ fontSize: 12.5, color: C.sub, margin: '5px 0 0' }}>
            소재로그 시트가 정본입니다. 이미지형은 CTR로, 영상형은 훅률·유지율·본→클릭으로 판정합니다.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 7 }}>
          {[['all', '전체'], ['kr', '한국'], ['us', '미국']].map(([v, l]) => (
            <button key={v} style={tab(market === v)} onClick={() => setMarket(v)}>{l}</button>
          ))}
        </div>

        {loading && <div style={{ ...box, color: C.sub, fontSize: 13 }}>불러오는 중… (시트 + Meta 조회라 20초쯤 걸립니다)</div>}
        {err && <div style={{ ...box, color: C.drop, fontSize: 13 }}>오류: {err}</div>}

        {data && !loading && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
              {[
                ['제작', data.counts.made, C.text],
                ['집행', `${data.counts.run} (${data.counts.runRate}%)`, data.counts.runRate < 50 ? C.drop : C.text],
                ['이미지형', data.counts.image, C.text],
                ['영상형', data.counts.video, C.text],
                ['위너', data.counts.win, C.win],
                ['폐기', data.counts.drop, C.drop],
              ].map(([l, v, color]) => (
                <div key={l} style={box}>
                  <div style={{ fontSize: 11.5, color: C.sub }}>{l}</div>
                  <div style={{ fontSize: 23, fontWeight: 600, color, lineHeight: 1.2, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>

            {data.counts.runRate < 50 && (
              <div style={{ ...box, borderColor: '#F0D9A0', background: '#FFFBF2' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.remix }}>
                  만든 소재의 {100 - data.counts.runRate}%가 집행되지 않았습니다
                </div>
                <div style={{ fontSize: 11.5, color: C.sub, marginTop: 4, lineHeight: 1.5 }}>
                  제작 {data.counts.made}건 중 {data.counts.run}건만 Meta에서 돌고 있습니다.
                  성과가 없는 게 아니라 <b>집행이 안 된 것</b>이라, 유형 판정의 표본이 그만큼 줄어듭니다.
                </div>
                {data.unrun?.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 9 }}>
                    {data.unrun.slice(0, 10).map(u => (
                      <span key={u.concept} style={{ fontSize: 10.5, color: C.sub, background: '#FFF', border: `1px solid ${C.line}`, padding: '2px 7px', borderRadius: 4 }}>
                        {u.conceptName} {u.n}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Section title="이미지형" hint={`CTR 합격 ≥${data.thresholds.static.ctr.pass}% · 교체 <${data.thresholds.static.ctr.replace}%`} list={image} />
            <Section title="영상형" hint={`훅률 ≥${data.thresholds.video.hookRate.pass}% · 유지율 ≥${data.thresholds.video.holdRate.pass}% · 본→클릭 ≥${data.thresholds.video.clickFromView.pass}%`} list={video} />

            <div style={{ fontSize: 11, color: C.faint }}>
              출처: {Object.entries(data.source || {}).map(([k, v]) => v.error ? `${k.toUpperCase()} 오류` : `${v.name} ${v.rows}행`).join(' · ')}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

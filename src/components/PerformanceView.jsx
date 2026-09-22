import { useState, useEffect } from 'react';

// 소재 성과 화면 — docs/content-team-design.md
// 원칙: 판정은 서버(_assetCode.gradeContent)가 한다. 여기서 규칙을 다시 쓰지 않는다.
// 보는 사람이 알아야 할 것 3가지: ① 뭐가 이겼나 ② 뭘 손봐야 하나 ③ 어떤 문법이 통하나

const C = {
  bg: '#F5F5F7', card: '#FFFFFF', line: '#E5E5EA',
  text: '#1D1D1F', sub: '#6E6E73', faint: '#AEAEB2',
  win: '#0A7D32', remix: '#B26A00', drop: '#C0392B', keep: '#6E6E73', na: '#AEAEB2',
};
const GRADE_C = { win: C.win, remix: C.remix, drop: C.drop, keep: C.keep, 'n/a': C.na };
const GRADE_LABEL = { win: '위너', keep: '유지', remix: '부분수정', drop: '폐기', 'n/a': '측정불가' };
const FIX_LABEL = { hook: '앞 3초 교체', body: '중간 재편집', endcard: '엔드카드 교체', angle: '앵글 교체' };
const METRICS = [
  { key: 'hookRate', label: '훅률', hint: '3초 시청 ÷ 노출' },
  { key: 'holdRate', label: '유지율', hint: 'ThruPlay ÷ 3초' },
  { key: 'clickFromView', label: '본→클릭', hint: '클릭 ÷ 3초 시청' },
];

const fmt = (v) => (v == null ? '—' : `${v}%`);

function Bar({ value, thr }) {
  if (value == null || !thr) return <div style={{ height: 4, background: C.line, borderRadius: 2 }} />;
  const grade = value >= thr.pass ? 'win' : value < thr.replace ? 'drop' : 'remix';
  // 합격선을 100%가 아니라 눈금으로 두어야 "얼마나 모자란지"가 보인다.
  const scale = Math.max(thr.pass * 1.4, value);
  return (
    <div style={{ position: 'relative', height: 4, background: C.line, borderRadius: 2 }}>
      <div style={{ width: `${Math.min(100, value / scale * 100)}%`, height: '100%', background: GRADE_C[grade], borderRadius: 2 }} />
      <div style={{ position: 'absolute', left: `${thr.pass / scale * 100}%`, top: -2, width: 1, height: 8, background: C.faint }} />
    </div>
  );
}

function Badge({ grade }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: '#FFF', background: GRADE_C[grade] || C.na,
      padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap',
    }}>{GRADE_LABEL[grade] || grade}</span>
  );
}

function AdCard({ ad, thresholds }) {
  const c = ad.content || {};
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', aspectRatio: '1/1', background: '#F0F0F3' }}>
        {ad.thumbnail_url
          ? <img src={ad.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint, fontSize: 11 }}>썸네일 없음</div>}
        <div style={{ position: 'absolute', top: 8, left: 8 }}><Badge grade={ad.grade} /></div>
        {ad.content?.isVideo && (
          <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.6)', color: '#FFF', fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4 }}>영상</div>
        )}
      </div>

      <div style={{ padding: 11, display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, lineHeight: 1.35, wordBreak: 'break-all' }}>{ad.ad_name}</div>
          <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
            {[ad.code?.market, ad.code?.product, ad.code?.angle, ad.code?.hook].filter(Boolean).map((t, i) => (
              <span key={i} style={{ fontSize: 9.5, color: C.sub, background: '#F2F2F5', padding: '2px 5px', borderRadius: 3 }}>{t}</span>
            ))}
            {ad.unclassified && <span style={{ fontSize: 9.5, color: C.remix, background: '#FFF4E5', padding: '2px 5px', borderRadius: 3 }}>미분류</span>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {METRICS.map(m => (
            <div key={m.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 3 }}>
                <span style={{ color: C.sub }}>{m.label}</span>
                <span style={{ color: GRADE_C[ad.parts?.[m.key] === 'pass' ? 'win' : ad.parts?.[m.key] === 'replace' ? 'drop' : ad.parts?.[m.key] ? 'remix' : 'n/a'], fontWeight: 600 }}>
                  {fmt(c[m.key])}
                </span>
              </div>
              <Bar value={c[m.key]} thr={thresholds?.[m.key]} />
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
          {ad.fix && (
            <div style={{ fontSize: 10.5, fontWeight: 600, color: GRADE_C[ad.grade], marginBottom: 3 }}>→ {FIX_LABEL[ad.fix]}</div>
          )}
          <div style={{ fontSize: 10, color: C.sub, lineHeight: 1.4 }}>{ad.gradeReason}</div>
          <div style={{ fontSize: 9.5, color: C.faint, marginTop: 5 }}>
            참고 · CPC ${ad.cpcUsd ?? '—'}{ad.roas != null ? ` · ROAS ${ad.roas}` : ''}{c.engagementRank ? ` · Meta ${c.engagementRank === 'ABOVE_AVERAGE' ? '참여 상위' : c.engagementRank === 'AVERAGE' ? '참여 평균' : '참여 하위'}` : ''}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PerformanceView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [market, setMarket] = useState('all');
  const [filter, setFilter] = useState('all');   // all | win | remix | drop
  const [sort, setSort] = useState('hookRate');

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    fetch(`/api/content/performance?market=${market}`)
      .then(r => r.json())
      .then(d => { if (!alive) return; d.error ? setErr(d.error) : setData(d); })
      .catch(e => alive && setErr(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [market]);

  const box = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 14 };
  const tab = (active) => ({
    padding: '5px 12px', fontSize: 12.5, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
    border: `1px solid ${active ? C.text : C.line}`, background: active ? C.text : C.card,
    color: active ? '#FFF' : C.sub, fontWeight: active ? 600 : 400,
  });

  let ads = data?.ads || [];
  if (filter !== 'all') ads = ads.filter(a => a.grade === filter);
  ads = [...ads].sort((a, b) => {
    if (sort === 'spend') return b.spend - a.spend;
    return (b.content?.[sort] ?? -1) - (a.content?.[sort] ?? -1);
  });

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg }}>
      <div style={{ padding: '22px 26px', maxWidth: 1440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: C.text, margin: 0 }}>소재 성과</h1>
          <p style={{ fontSize: 12.5, color: C.sub, margin: '5px 0 0' }}>
            콘텐츠가 통제하는 구간(노출 → 클릭)만 판정합니다. 구매는 오퍼·랜딩이 결정하므로 ROAS·CPC는 참고로만 표시합니다.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['all', '전체'], ['kr', '한국'], ['us', '미국']].map(([v, l]) => (
            <button key={v} style={tab(market === v)} onClick={() => setMarket(v)}>{l}</button>
          ))}
          <div style={{ width: 1, height: 18, background: C.line, margin: '0 4px' }} />
          {[['all', '전체'], ['win', '위너'], ['remix', '부분수정'], ['drop', '폐기']].map(([v, l]) => (
            <button key={v} style={tab(filter === v)} onClick={() => setFilter(v)}>{l}</button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 7, alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, color: C.faint }}>정렬</span>
            {[['hookRate', '훅률'], ['holdRate', '유지율'], ['clickFromView', '본→클릭'], ['spend', '지출']].map(([v, l]) => (
              <button key={v} style={tab(sort === v)} onClick={() => setSort(v)}>{l}</button>
            ))}
          </div>
        </div>

        {loading && <div style={{ ...box, color: C.sub, fontSize: 13 }}>불러오는 중…</div>}
        {err && <div style={{ ...box, color: C.drop, fontSize: 13 }}>오류: {err}</div>}

        {data && !loading && (
          <>
            {/* 판정 요약 + 기준선 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
              {[
                ['영상 소재', data.counts.video, C.text],
                ['위너', data.counts.win || 0, C.win],
                ['부분수정', data.counts.remix || 0, C.remix],
                ['폐기', data.counts.drop || 0, C.drop],
                ['미분류', data.counts.unclassified || 0, C.faint],
              ].map(([label, n, color]) => (
                <div key={label} style={box}>
                  <div style={{ fontSize: 11.5, color: C.sub }}>{label}</div>
                  <div style={{ fontSize: 26, fontWeight: 600, color, lineHeight: 1.2, marginTop: 2 }}>{n}</div>
                </div>
              ))}
            </div>

            <div style={{ ...box, display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, color: C.faint, fontWeight: 600 }}>판정 기준</span>
              {METRICS.map(m => (
                <div key={m.key} style={{ fontSize: 11.5, color: C.sub }}>
                  <b style={{ color: C.text }}>{m.label}</b> <span style={{ color: C.faint }}>({m.hint})</span>{' '}
                  <span style={{ color: C.win }}>합격 ≥{data.thresholds[m.key].pass}%</span>{' · '}
                  <span style={{ color: C.drop }}>교체 &lt;{data.thresholds[m.key].replace}%</span>
                </div>
              ))}
            </div>

            {/* 처방 큐 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}>
              {Object.entries(FIX_LABEL).map(([k, label]) => (
                <div key={k} style={{ ...box, opacity: data.queue?.[k]?.n ? 1 : 0.5 }}>
                  <div style={{ fontSize: 11.5, color: C.sub }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: k === 'angle' ? C.drop : C.remix, marginTop: 2 }}>
                    {data.queue?.[k]?.n || 0}<span style={{ fontSize: 12, color: C.faint, fontWeight: 400 }}> 건</span>
                  </div>
                </div>
              ))}
            </div>

            {/* 문법 계열별 — 어떤 결이 통하나 */}
            {data.series?.length > 0 && (
              <div style={{ ...box, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.line}` }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>문법 계열별 성과</div>
                  <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>이름 계열로 묶은 결과입니다. 정식 소재코드를 붙이면 제품·앵글·훅 단위로 쪼개집니다.</div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: C.faint, fontSize: 11 }}>
                        {['계열', '개수', '위너', '수정', '폐기', '평균 훅률', '평균 유지율', '평균 본→클릭'].map((h, i) => (
                          <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '8px 14px', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.series.map(s => (
                        <tr key={s.name} style={{ borderTop: `1px solid ${C.line}` }}>
                          <td style={{ padding: '8px 14px', fontWeight: 600, color: C.text }}>{s.name}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', color: C.sub }}>{s.n}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', color: s.win ? C.win : C.faint, fontWeight: s.win ? 600 : 400 }}>{s.win}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', color: s.remix ? C.remix : C.faint }}>{s.remix}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', color: s.drop ? C.drop : C.faint }}>{s.drop}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', color: C.text, fontWeight: 600 }}>{fmt(s.avgHook)}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', color: C.sub }}>{fmt(s.avgHold)}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', color: C.sub }}>{fmt(s.avgClick)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 위너 매트릭스 */}
            {data.matrix?.length > 0 && (
              <div style={{ ...box }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>제품 × 앵글 매트릭스</div>
                <div style={{ fontSize: 11, color: C.sub, margin: '2px 0 12px' }}>다음에 뭘 만들지가 여기서 나옵니다. 높은 칸은 증량, 낮은 칸은 쿨다운, 없는 칸은 미탐색.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8 }}>
                  {data.matrix.map(m => (
                    <div key={`${m.market}-${m.product}-${m.angle}`} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: C.text }}>{m.product} · {m.angle}</div>
                      <div style={{ fontSize: 10, color: C.faint, marginTop: 1 }}>{m.market.toUpperCase()} · 소재 {m.n}개</div>
                      <div style={{ fontSize: 19, fontWeight: 600, color: (m.avgHook ?? 0) >= 34 ? C.win : (m.avgHook ?? 0) < 14 ? C.drop : C.remix, marginTop: 6 }}>
                        {fmt(m.avgHook)}
                      </div>
                      <div style={{ fontSize: 10, color: C.sub }}>평균 훅률 · 위너 {m.win}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 소재 격자 */}
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, marginBottom: 10 }}>
                소재 {ads.length}개
                {data.counts.unclassified > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 400, color: C.remix, marginLeft: 8 }}>
                    · 미분류 {data.counts.unclassified}개는 레거시 이름이라 축을 못 읽습니다 (백필 대상)
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(232px,1fr))', gap: 12 }}>
                {ads.map(a => <AdCard key={a.ad_id} ad={a} thresholds={data.thresholds} />)}
              </div>
              {ads.length === 0 && <div style={{ ...box, color: C.sub, fontSize: 13 }}>조건에 맞는 소재가 없습니다.</div>}
            </div>

            {data.accountErrors?.length > 0 && (
              <div style={{ ...box, borderColor: '#F0D9A0', background: '#FFFBF2' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.remix, marginBottom: 5 }}>조회 못 한 광고 계정 {data.accountErrors.length}개</div>
                {data.accountErrors.map(e => (
                  <div key={e.id} style={{ fontSize: 11, color: C.sub }}>{e.account} — 토큰에 ads_read 권한 없음</div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

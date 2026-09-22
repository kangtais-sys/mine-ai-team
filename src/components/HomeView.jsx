import { useState, useEffect } from 'react';

// 홈 — 두 트랙을 한 화면에.
//
//   트랙 A  소재 무한 생성   골격 → 조합 → 큐 → 발행 → 판정
//   트랙 B  AI 인플루언서    페르소나 → 계정 → 발행 → 판정
//
// 둘은 **같은 골격 라이브러리**를 쓴다. 얼굴만 다르다. 그래서 한 화면에 둔다.
// 지금 우선순위는 A. B 는 자리를 잡아두고 진행도만 본다.

const C = {
  bg: '#F5F5F7', card: '#FFFFFF', line: '#E5E5EA',
  text: '#1D1D1F', sub: '#6E6E73', faint: '#AEAEB2',
  win: '#0A7D32', remix: '#B26A00', drop: '#C0392B', blue: '#2F6FED',
};

const num = (v) => (v == null ? '—' : v.toLocaleString());

function Step({ n, label, value, unit, tone, onClick, last }) {
  return (
    <>
      <div
        onClick={onClick}
        style={{
          flex: 1, minWidth: 96, padding: '11px 12px', borderRadius: 9, cursor: onClick ? 'pointer' : 'default',
          background: tone === 'off' ? '#F7F7F9' : C.card, border: `1px solid ${C.line}`,
        }}
      >
        <div style={{ fontSize: 10, color: C.faint }}>{n}. {label}</div>
        <div style={{ fontSize: 21, fontWeight: 600, color: tone === 'off' ? C.faint : C.text, lineHeight: 1.25, marginTop: 2 }}>
          {value}<span style={{ fontSize: 11, fontWeight: 400, color: C.faint, marginLeft: 3 }}>{unit}</span>
        </div>
      </div>
      {!last && <span style={{ color: C.faint, fontSize: 13, alignSelf: 'center', flexShrink: 0 }}>→</span>}
    </>
  );
}

export default function HomeView({ onNavigate }) {
  const [types, setTypes] = useState(null);
  const [sk, setSk] = useState(null);
  const [q, setQ] = useState(null);
  const [pp, setPp] = useState(null);

  useEffect(() => {
    const j = (u) => fetch(u).then(r => r.json()).catch(() => null);
    j('/api/content/types?market=all').then(setTypes);
    j('/api/content/skeletons').then(setSk);
    j('/api/content/queue').then(setQ);
    j('/api/content/personas').then(setPp);
  }, []);

  const box = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 11, padding: 16 };
  const today = new Date().toISOString().slice(0, 10);
  const items = q?.items || [];
  const todayQ = items.filter(x => x.createdAt === today).length;
  const inFlight = items.filter(x => ['대기', '생성중', '검수', '발행준비'].includes(x.status)).length;
  const published = q?.counts?.['발행됨'] ?? 0;

  const skCount = sk?.count ?? null;
  // 조합 = 골격 × 앵글 × 훅. '무한'의 실체는 이 곱셈이다.
  const angles = types ? new Set((types.items || []).map(x => x.concept).filter(Boolean)).size : 0;
  const hooks = types ? new Set((types.items || []).map(x => x.shot).filter(Boolean)).size : 0;
  const combos = skCount != null && angles && hooks ? skCount * angles * hooks : null;

  const run = types?.counts?.run ?? null;
  const win = types?.counts?.win ?? null;

  const Track = ({ tag, tagColor, title, desc, children, footer }) => (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#FFF', background: tagColor, padding: '2px 7px', borderRadius: 4 }}>{tag}</span>
        <span style={{ fontSize: 15.5, fontWeight: 600, color: C.text }}>{title}</span>
      </div>
      <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>{desc}</div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{children}</div>
      {footer && <div style={{ fontSize: 11, color: C.faint, marginTop: 11, lineHeight: 1.6 }}>{footer}</div>}
    </div>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg }}>
      <div style={{ padding: '20px 26px 60px', maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: C.text, margin: 0 }}>MILLI AI 콘텐츠</h1>
          <p style={{ fontSize: 12.5, color: C.sub, margin: '5px 0 0' }}>
            두 트랙이 <b>같은 골격 라이브러리</b>를 씁니다. 얼굴만 다릅니다.
          </p>
        </div>

        <Track
          tag="트랙 A" tagColor={C.text} title="소재 무한 생성"
          desc="터진 구조를 가져와 우리 앵글·훅 격자를 채웁니다. 지금 우선순위입니다."
          footer={<>
            조합 {combos != null ? `${num(combos)}가지` : '—'} = 골격 {skCount ?? '—'} × 앵글 {angles || '—'} × 훅 {hooks || '—'}.
            실제로 뽑는 양은 규칙(증량 60% · 변주 30% · 신규 10%)이 정합니다.
          </>}
        >
          <Step n="1" label="골격" value={num(skCount)} unit="개" onClick={() => onNavigate('skeletons')} />
          <Step n="2" label="조합 가능" value={combos != null ? num(combos) : '—'} unit="가지" onClick={() => onNavigate('board')} />
          <Step n="3" label="오늘 큐" value={num(todayQ)} unit="건" onClick={() => onNavigate('studio')} />
          <Step n="4" label="진행중" value={num(inFlight)} unit="건" onClick={() => onNavigate('studio')} />
          <Step n="5" label="집행" value={num(run)} unit="건" onClick={() => onNavigate('board')} />
          <Step n="6" label="위너" value={num(win)} unit="건" onClick={() => onNavigate('performance')} last />
        </Track>

        <Track
          tag="트랙 B" tagColor={C.faint} title="AI 인플루언서"
          desc="같은 골격에 페르소나 얼굴을 얹어 자체 계정으로 발행합니다. 트랙 A 다음입니다."
          footer={<>
            페르소나는 브랜드 진행자입니다 — 사용자인 척 증언하지 않고, AI 연출 표기가 없으면 운영중으로 못 올라갑니다.
            <br />3~5개로 시작해 생존율을 보고 늘립니다.
          </>}
        >
          <Step n="1" label="페르소나" value={num(pp?.total ?? null)} unit="명" tone={pp?.total ? undefined : 'off'} onClick={() => onNavigate('personas')} />
          <Step n="2" label="얼굴 고정" value={num(pp?.counts?.['얼굴·목소리 고정'] ?? null)} unit="명" tone="off" onClick={() => onNavigate('personas')} />
          <Step n="3" label="계정 개설" value={num(pp?.counts?.['계정 개설'] ?? null)} unit="개" tone="off" onClick={() => onNavigate('personas')} />
          <Step n="4" label="운영중" value={num(pp?.counts?.['운영중'] ?? null)} unit="명" tone="off" onClick={() => onNavigate('personas')} />
          <Step n="5" label="발행" value={num(published)} unit="건" tone="off" onClick={() => onNavigate('studio')} last />
        </Track>

        <div style={{ ...box, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 7 }}>지금 막혀 있는 곳</div>
          <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.75 }}>
            {skCount === 2 && <>· 골격이 <b>2개(둘 다 후보)</b>뿐입니다. 우리가 돌려서 위너가 나와야 <b>검증</b>이 붙습니다.<br /></>}
            {todayQ === 0 && <>· 오늘 큐가 비었습니다 — 보드에서 조합을 <b>큐에 넣기</b> 하세요.<br /></>}
            {(pp?.total ?? 0) === 0 && <>· 페르소나 0명. 트랙 B는 트랙 A가 돌기 시작한 뒤에 엽니다.<br /></>}
            {types?.fetched?.empty?.length > 0 && (
              <span style={{ color: C.remix }}>· Meta 응답 없는 계정: {types.fetched.empty.join(', ')}<br /></span>
            )}
          </div>
        </div>

        <div style={{ fontSize: 11, color: C.faint }}>
          {types && <>Meta 최근 90일 · 광고 {types.fetched?.ads ?? '—'}건 조회 · {types.cached ? `${types.ageMin ?? 0}분 전 집계` : '새로 집계'}</>}
        </div>
      </div>
    </div>
  );
}

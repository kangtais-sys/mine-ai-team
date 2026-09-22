import { useEffect, useState, useCallback } from 'react';
import {
  Flame, Repeat2, Image as ImageIcon, Link2, Sparkles, Copy, Check,
  AlertTriangle, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';

// 데일리 스튜디오 — 이 앱에서 매일 여는 단 하나의 화면.
//
// 설계 원칙 (MINE): 3초 안에 "오늘 뭘 만들지"가 보여야 한다.
//   위로 갈수록 결정, 아래로 갈수록 작업. 스크롤 없이 9칸이 다 보이는 게 기본값.
//   규칙은 서버(api/_daily.js)에 있다 — 여기서 다시 계산하지 않는다.

const C = {
  ink: '#1D1D1F', sub: '#6E6E73', mute: '#AEAEB2',
  line: '#E5E5EA', bg: '#FFFFFF', soft: '#F7F7F9', softer: '#FAFAFC',
  win: '#0A7D32', keep: '#6E6E73', remix: '#B26A00', drop: '#C0392B',
  lime: '#ECF400',
};

const TRACK = {
  trend:  { icon: Flame,      label: '트렌드 모방', hint: '틱톡·릴스에서 지금 터지는 구조' },
  format: { icon: Repeat2,    label: '고정 유형',   hint: '검증된 유형 — 위너 반복' },
  image:  { icon: ImageIcon,  label: '이미지 소재', hint: '대카×소카 — 증량 / 탐색' },
};

const TONE = {
  win:  { bg: '#EAF6EE', fg: C.win,   label: '위너 증량' },
  test: { bg: '#F2F2F5', fg: C.sub,   label: '검증 중' },
  new:  { bg: '#FFF4E5', fg: C.remix, label: '미탐색' },
};

const STATUSES = ['대기', '생성중', '검수', '발행준비', '발행됨', '버림'];

// ── 작은 부품들 ───────────────────────────────────────────────────
function Pill({ children, bg = C.soft, fg = C.sub, bold }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px',
      borderRadius: 5, background: bg, color: fg, fontSize: 11,
      fontWeight: bold ? 600 : 500, lineHeight: 1.6, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function CopyBtn({ text, label = '복사' }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true); setTimeout(() => setDone(false), 1400);
      }}
      title={text}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px',
        borderRadius: 6, border: `1px solid ${C.line}`, background: done ? '#EAF6EE' : C.bg,
        color: done ? C.win : C.sub, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      {done ? <Check size={11} /> : <Copy size={11} />}{done ? '복사됨' : label}
    </button>
  );
}

function Btn({ children, onClick, disabled, primary, small }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: small ? '5px 10px' : '7px 14px', borderRadius: 7,
        border: primary ? 'none' : `1px solid ${C.line}`,
        background: disabled ? C.soft : primary ? C.ink : C.bg,
        color: disabled ? C.mute : primary ? '#FFF' : C.ink,
        fontSize: small ? 12 : 13, fontWeight: 500,
        cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
      }}
    >{children}</button>
  );
}

// ── 어제 성과 요약 — 피드백 루프의 입구 ──────────────────────────
function PerfStrip({ market }) {
  const [p, setP] = useState(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/content/performance?market=${market}&preset=last_30d`)
      .then(r => r.json()).then(d => { if (live) setP(d); }).catch(() => {});
    return () => { live = false; };
  }, [market]);

  const c = p?.counts;
  const cell = (n, label, color) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ fontSize: 17, fontWeight: 650, color, letterSpacing: '-0.02em' }}>{n ?? '—'}</span>
      <span style={{ fontSize: 11.5, color: C.sub }}>{label}</span>
    </div>
  );

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      padding: '10px 14px', borderRadius: 9, background: C.softer, border: `1px solid ${C.line}`,
    }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: C.mute, letterSpacing: '0.04em' }}>
        최근 30일 집행 성과
      </span>
      {cell(c?.win, '위너', C.win)}
      {cell(c?.remix, '부분수정', C.remix)}
      {cell(c?.keep, '유지', C.keep)}
      {cell(c?.drop, '폐기', C.drop)}
      <span style={{ marginLeft: 'auto', fontSize: 11, color: C.mute }}>
        {p?.status === 'connected'
          ? `판정 기준 훅률 ${p.thresholds?.hookRate?.pass}% · 유지율 ${p.thresholds?.holdRate?.pass}% · 본→클릭 ${p.thresholds?.clickFromView?.pass}%`
          : p ? `Meta 연결 안 됨 (${p.status})` : '불러오는 중…'}
      </span>
    </div>
  );
}

// ── 트렌드 레퍼런스 입력 ─────────────────────────────────────────
function RefInput({ market, date, refs, onSaved }) {
  const [v, setV] = useState(['', '', '']);
  const [busy, setBusy] = useState(false);
  const refKey = (refs || []).join('|');
  useEffect(() => {
    const r = refKey ? refKey.split('|') : [];
    setV([r[0] || '', r[1] || '', r[2] || '']);
  }, [refKey]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/content/daily?market=${market}&date=${date}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refs: v }),
      });
      onSaved(await r.json());
    } finally { setBusy(false); }
  };

  return (
    <div style={{ padding: '12px 14px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
        <Link2 size={14} strokeWidth={1.9} color={C.sub} />
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>오늘의 트렌드 레퍼런스 3개</span>
      </div>
      <div style={{ fontSize: 11.5, color: C.mute, marginBottom: 10, lineHeight: 1.5 }}>
        틱톡·릴스에 공개 API 가 없어 자동 수집은 하지 않는다(우회 수집은 차단·법적 위험).
        URL 만 붙여넣으면 구조를 해부해 밀리밀리 버전으로 바꾼다 — 문장은 100% 새로 쓴다.
        {' '}<a href="https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en"
             target="_blank" rel="noreferrer"
             style={{ color: C.ink, textDecoration: 'underline' }}>TikTok Creative Center 열기 ↗</a>
      </div>
      {v.map((val, i) => (
        <input
          key={i} value={val} placeholder={`레퍼런스 ${i + 1} — 틱톡/릴스 URL`}
          onChange={e => setV(prev => prev.map((x, j) => (j === i ? e.target.value : x)))}
          style={{
            width: '100%', boxSizing: 'border-box', marginBottom: 6, padding: '7px 10px',
            borderRadius: 7, border: `1px solid ${C.line}`, fontSize: 12.5,
            color: C.ink, fontFamily: 'inherit', outline: 'none', background: C.softer,
          }}
        />
      ))}
      <Btn onClick={save} disabled={busy} primary small>
        {busy ? <RefreshCw size={12} className="spin" /> : <Sparkles size={12} />}
        {busy ? '반영 중…' : '트렌드 3칸 다시 짜기'}
      </Btn>
    </div>
  );
}

// ── 블루프린트 결과 ──────────────────────────────────────────────
function Blueprint({ bp, gate, engine }) {
  const row = (k, val) => val ? (
    <div style={{ display: 'flex', gap: 10, padding: '5px 0', borderTop: `1px solid ${C.line}` }}>
      <span style={{ width: 74, flexShrink: 0, fontSize: 11, color: C.mute, paddingTop: 1 }}>{k}</span>
      <span style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.55, wordBreak: 'break-word' }}>{val}</span>
    </div>
  ) : null;

  return (
    <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: C.softer, border: `1px solid ${C.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        {gate?.pass
          ? <Pill bg="#EAF6EE" fg={C.win} bold><Check size={11} />KPI 게이트 통과</Pill>
          : <Pill bg="#FDECEA" fg={C.drop} bold><AlertTriangle size={11} />게이트 미통과</Pill>}
        <Pill>{engine}</Pill>
        <span style={{ marginLeft: 'auto' }}>
          <CopyBtn text={bp.visualPrompt || ''} label="비주얼 프롬프트" />
        </span>
      </div>

      {!gate?.pass && (
        <div style={{ marginBottom: 8, padding: '6px 9px', borderRadius: 6, background: '#FDECEA', color: C.drop, fontSize: 11.5, lineHeight: 1.6 }}>
          {gate.fails.map((f, i) => <div key={i}>· {f}</div>)}
          <div style={{ marginTop: 3, color: C.sub }}>발행 금지. 다시 생성하거나 해당 항목을 직접 채운다.</div>
        </div>
      )}

      {row('훅 KR', bp.hookKr)}
      {row('훅 US', bp.hookUs)}
      {row('궁금증', bp.curiosity)}
      {row('대세감', bp.momentum)}
      {row('편집패턴', bp.editPattern)}
      {row('핵심클레임', bp.claim)}
      {row('비트', (bp.beats || []).join('  →  '))}
      {row('댓글', bp.comment)}
      {row('저장', bp.save)}
      {row('공유', bp.share)}
      {row('자막', (bp.captions || []).join(' / '))}
      {row('주의', bp.complianceNote)}
    </div>
  );
}

// ── 칸 하나 ──────────────────────────────────────────────────────
function SlotCard({ slot, market, date, onPatch }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const tone = TONE[slot.tone] || TONE.test;

  const generate = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/content/blueprint', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, market, date }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || '생성 실패'); return; }
      setOpen(true);
      await onPatch(slot.id, { blueprint: { ...d.blueprint, _gate: d.gate, _engine: `${d.engine} · ${d.model}` }, status: '검수' });
    } catch (e) { setErr(String(e.message)); }
    finally { setBusy(false); }
  };

  const bp = slot.blueprint;

  return (
    <div style={{
      border: `1px solid ${C.line}`, borderRadius: 10, background: C.bg,
      padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 7,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>
            {slot.title}
          </div>
          <div style={{ fontSize: 11.5, color: C.sub, marginTop: 3, lineHeight: 1.5 }}>{slot.why}</div>
        </div>
        {slot.thumb && (
          <img src={slot.thumb} alt="" style={{ width: 44, height: 44, borderRadius: 7, objectFit: 'cover', border: `1px solid ${C.line}`, flexShrink: 0 }} />
        )}
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <Pill bg={tone.bg} fg={tone.fg} bold>{slot.mode || tone.label}</Pill>
        {slot.personaLabel && <Pill>👤 {slot.personaLabel}</Pill>}
        {slot.lever && <Pill>{slot.lever}</Pill>}
        {slot.disclose && <Pill bg="#FFF4E5" fg={C.remix}>AI 연출 표기</Pill>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <code style={{
          fontSize: 10.5, color: C.sub, background: C.soft, padding: '3px 6px',
          borderRadius: 5, fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        }}>{slot.assetCode}</code>
        <CopyBtn text={slot.assetCode} label="광고이름" />
        <select
          value={slot.status || '대기'}
          onChange={e => onPatch(slot.id, { status: e.target.value })}
          style={{
            marginLeft: 'auto', padding: '3px 6px', borderRadius: 6, fontSize: 11,
            border: `1px solid ${C.line}`, color: C.sub, background: C.bg, fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {slot.note && (
        <div style={{ fontSize: 11, color: C.mute, lineHeight: 1.5 }}>{slot.note}</div>
      )}

      {slot.state === 'awaiting_ref' ? (
        <div style={{ fontSize: 11.5, color: C.remix, background: '#FFF4E5', padding: '6px 9px', borderRadius: 6 }}>
          위 입력칸에 레퍼런스 URL 을 넣으면 이 칸이 채워진다.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Btn onClick={generate} disabled={busy} small primary={!bp}>
            <Sparkles size={12} />{busy ? '쓰는 중…' : bp ? '다시 쓰기' : '카피·훅 생성'}
          </Btn>
          {bp && (
            <Btn onClick={() => setOpen(v => !v)} small>
              {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}{open ? '접기' : '블루프린트'}
            </Btn>
          )}
          {bp?._gate && !bp._gate.pass && (
            <Pill bg="#FDECEA" fg={C.drop} bold><AlertTriangle size={11} />게이트 {bp._gate.fails.length}건</Pill>
          )}
        </div>
      )}

      {err && <div style={{ fontSize: 11.5, color: C.drop }}>{err}</div>}
      {open && bp && <Blueprint bp={bp} gate={bp._gate} engine={bp._engine} />}
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────────
export default function DailyStudio() {
  const [market, setMarket] = useState('us');
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const date = plan?.date || new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

  const load = useCallback(async (rebuild = false) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/content/daily?market=${market}${rebuild ? '&rebuild=1' : ''}`);
      const d = await r.json();
      if (!r.ok || d.status === 'error') setError(d.error || '불러오기 실패');
      else setPlan(d);
    } catch (e) { setError(String(e.message)); }
    finally { setLoading(false); }
  }, [market]);

  useEffect(() => { load(); }, [load]);

  const patch = async (id, body) => {
    setPlan(p => p && ({ ...p, slots: p.slots.map(s => (s.id === id ? { ...s, ...body } : s)) }));
    try {
      await fetch(`/api/content/daily?market=${market}&date=${date}&id=${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } catch { /* 화면은 이미 반영됨 — 다음 로드에서 동기화된다 */ }
  };

  const slots = plan?.slots || [];
  const by = (t) => slots.filter(s => s.track === t);
  const done = slots.filter(s => ['발행준비', '발행됨'].includes(s.status)).length;

  return (
    <div style={{ height: '100vh', overflowY: 'auto', background: C.bg, fontFamily: 'inherit' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '22px 26px 60px' }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 650, color: C.ink, letterSpacing: '-0.02em' }}>
              오늘의 9칸
            </div>
            <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>
              {date} · 트렌드 3 + 고정 유형 3 + 이미지 3 · 완료 {done}/{slots.length}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            {['us', 'kr'].map(m => (
              <button key={m} onClick={() => setMarket(m)}
                style={{
                  padding: '5px 12px', borderRadius: 7, fontSize: 12.5, fontWeight: market === m ? 600 : 400,
                  border: `1px solid ${market === m ? C.ink : C.line}`,
                  background: market === m ? C.ink : C.bg, color: market === m ? '#FFF' : C.sub,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{m === 'us' ? '미국' : '한국'}</button>
            ))}
            <Btn onClick={() => load(true)} small><RefreshCw size={12} />다시 뽑기</Btn>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}><PerfStrip market={market} /></div>

        <div style={{ marginBottom: 16 }}>
          <RefInput market={market} date={date} refs={plan?.refs} onSaved={d => setPlan(p => ({ ...p, ...d }))} />
        </div>

        {loading && <div style={{ color: C.mute, fontSize: 13, padding: 24 }}>불러오는 중…</div>}
        {error && (
          <div style={{ padding: 14, borderRadius: 9, background: '#FDECEA', color: C.drop, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* 3트랙 */}
        {['trend', 'format', 'image'].map(t => {
          const meta = TRACK[t]; const Icon = meta.icon; const list = by(t);
          if (!list.length) return null;
          return (
            <div key={t} style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                <Icon size={15} strokeWidth={1.9} color={C.ink} />
                <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{meta.label}</span>
                <span style={{ fontSize: 11.5, color: C.mute }}>{meta.hint}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11.5, color: C.mute }}>{list.length}칸</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 10 }}>
                {list.map(s => (
                  <SlotCard key={s.id} slot={s} market={market} date={date} onPatch={patch} />
                ))}
              </div>
            </div>
          );
        })}

        {/* 근거 — 이 계획이 무엇을 보고 나왔는지 */}
        {plan?.sources && (
          <div style={{ marginTop: 26, paddingTop: 14, borderTop: `1px solid ${C.line}`, fontSize: 11.5, color: C.mute, lineHeight: 1.7 }}>
            <div style={{ fontWeight: 600, color: C.sub, marginBottom: 3 }}>이 계획의 근거</div>
            <div>{Object.values(plan.sources).join(' · ')} · 생성 {plan.builtAt?.slice(0, 16).replace('T', ' ')} UTC</div>
            <div style={{ marginTop: 5 }}>
              규칙은 <code>api/_daily.js</code> 한 곳. LLM 은 칸당 카피 1콜만 쓴다 — 조합 선택은 룰이라 토큰 0.
            </div>
            <div style={{ marginTop: 5, color: C.remix }}>
              ⚠️ 포맷 성과(perf)는 앵글 단위 집계다. 같은 앵글의 릴스 여러 종이 같은 값을 받는다 —
              포맷 단위 판별은 소재코드가 쌓여야 갈린다.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

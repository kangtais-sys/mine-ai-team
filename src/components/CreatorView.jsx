import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles, Film, Layers, Video, CheckCircle2,
  Send, Loader2, RefreshCw, Trash2, Edit3, Calendar, ChevronDown,
  ChevronUp, AlertCircle, Plus, User, FlaskConical, MessageSquareQuote,
  Camera, BookImage, Save, ArrowRight, X,
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────
const PILLARS = [
  { key: 'ingredient', label: '🧪 성분정보', desc: '원료·효능·주의사항' },
  { key: 'treatment',  label: '💉 시술정보', desc: '피부과·홈케어 루틴' },
  { key: 'behind',     label: '🔬 개발 비하인드', desc: 'R&D 과정·에피소드' },
  { key: 'collab',     label: '👨‍⚕️ 전문가 콜라보', desc: '의사·약사 협업' },
  { key: 'trend',      label: '✨ 뷰티 트렌드', desc: '트렌드·글로벌 동향' },
];

const FORMATS = [
  { key: 'reel',     label: 'Reels',   icon: Film,   desc: '인스타 세로 영상 (15-30초)' },
  { key: 'shorts',   label: 'Shorts',  icon: Video,  desc: '유튜브/틱톡 숏츠 (15-60초)' },
  { key: 'cardnews', label: '카드뉴스', icon: Layers, desc: '인스타 슬라이드 (5-7장)' },
];

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram', color: '#E1306C' },
  { key: 'tiktok',    label: 'TikTok',    color: '#010101' },
  { key: 'youtube',   label: 'YouTube',   color: '#FF0000' },
];

// Ssobi 카드뉴스 템플릿 4종 (clean/bold/mag/noir)
const CARD_TEMPLATES = [
  { key: 'clean', label: '클린',   bg: '#FFFFFF', text: '#1A1A1A', accent: '#1A1A1A', border: '#E0E0E0', emoji: '⬜' },
  { key: 'bold',  label: '팝',     bg: '#D55A35', text: '#1A1A1A', accent: '#0E1B2C', border: '#D55A35', emoji: '🟧' },
  { key: 'mag',   label: '매거진', bg: '#F5EDE0', text: '#1A1A1A', accent: '#E8FF4D', border: '#DDD0BC', emoji: '🟫' },
  { key: 'noir',  label: '감성',   bg: '#1A1A1A', text: '#FFFFFF', accent: '#FFFFFF', border: '#333333', emoji: '⬛' },
];

const STATUS_LABELS = {
  draft:      { label: '초안',       color: '#AEAEB2', bg: '#F2F2F7' },
  generating: { label: '영상 생성 중', color: '#FF9500', bg: '#FFF5E6' },
  review:     { label: '검토 대기',   color: '#5E6AD2', bg: '#F0F0FF' },
  scheduled:  { label: '예약됨',      color: '#34C759', bg: '#F0FFF4' },
  publishing: { label: '발행 중',     color: '#FF9500', bg: '#FFF5E6' },
  published:  { label: '발행 완료',   color: '#34C759', bg: '#F0FFF4' },
  failed:     { label: '실패',        color: '#FF3B30', bg: '#FFF5F5' },
};

const TABS = [
  { key: 'persona',   label: '페르소나', icon: User },
  { key: 'create',    label: '새 콘텐츠', icon: Sparkles },
  { key: 'review',    label: '검토 대기' },
  { key: 'scheduled', label: '예약됨' },
  { key: 'published', label: '발행 완료' },
];

const PERSONALITY_OPTIONS = [
  '호기심 왕성', '팩트충', '완벽주의자', '따뜻한 언니', '직접 해봐야 직성 풀림',
  '솔직함', '유머감각', '끈기 있음', '공감 잘함', '논리적',
];
const SCENARIO_OPTIONS = [
  '연구실 (비커·피펫 소품)', '피부과/클리닉 콜라보', 'R&D 현장 (신제품 개발)',
  '홈 스튜디오 데일리 루틴', '야외 강연/세미나', '원료 공장 방문', '약국·마트 성분 비교',
];

const CARD = { background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '18px 20px' };

// ─── Helpers ────────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return '';
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function formatScheduled(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Shared UI ──────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: '#F2F2F7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={14} color="#5E6AD2" />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: '#AEAEB2', marginTop: 1 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {children}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, style = {} }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13, fontFamily: 'inherit', outline: 'none', ...style }}
    />
  );
}

function TextArea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13, lineHeight: 1.55, resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
    />
  );
}

function ChipToggle({ options, selected, onChange, color = '#5E6AD2' }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(opt => {
        const active = Array.isArray(selected) ? selected.includes(opt) : selected === opt;
        return (
          <button key={opt} onClick={() => {
            if (Array.isArray(selected)) {
              onChange(active ? selected.filter(s => s !== opt) : [...selected, opt]);
            } else {
              onChange(opt);
            }
          }} style={{
            padding: '6px 12px', borderRadius: 16, border: `1.5px solid ${active ? color : '#E5E5EA'}`,
            background: active ? `${color}12` : '#FFF',
            fontSize: 12.5, fontWeight: active ? 600 : 400,
            color: active ? color : '#6E6E73',
            cursor: 'pointer', transition: 'all 0.12s',
          }}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function TagList({ items, onChange, placeholder }) {
  const [input, setInput] = useState('');
  const inputRef = useRef(null);

  const add = () => {
    const v = input.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setInput('');
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: items.length ? 8 : 0 }}>
        {items.map((item, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F2F2F7', borderRadius: 8, padding: '4px 8px 4px 10px', fontSize: 12.5, color: '#1D1D1F' }}>
            "{item}"
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#AEAEB2', padding: 0, display: 'flex', alignItems: 'center' }}>
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={placeholder}
          style={{ flex: 1, padding: '8px 11px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
        />
        <button onClick={add} disabled={!input.trim()} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#5E6AD2', color: '#FFF', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: !input.trim() ? 0.5 : 1 }}>
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

function ImageUrlList({ items, onChange }) {
  const [input, setInput] = useState('');
  return (
    <div>
      {items.map((url, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <img src={url} alt="" style={{ width: 52, height: 52, borderRadius: 6, objectFit: 'cover', flexShrink: 0, background: '#F2F2F7' }} onError={e => { e.target.style.display = 'none'; }} />
          <span style={{ flex: 1, fontSize: 11.5, color: '#6E6E73', wordBreak: 'break-all', lineHeight: 1.3 }}>{url}</span>
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#FF3B30', flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && input.trim() && (onChange([...items, input.trim()]), setInput(''))}
          placeholder="이미지 URL 입력 후 Enter (레퍼런스 사진, AI 생성 이미지 등)"
          style={{ flex: 1, padding: '8px 11px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 12.5, fontFamily: 'inherit', outline: 'none' }}
        />
        <button onClick={() => { if (input.trim()) { onChange([...items, input.trim()]); setInput(''); } }} disabled={!input.trim()} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#1D1D1F', color: '#FFF', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: !input.trim() ? 0.5 : 1 }}>
          추가
        </button>
      </div>
    </div>
  );
}

// ─── Persona Setup Page ──────────────────────────────────────
function PersonaSetup({ onGoCreate }) {
  const [persona, setPersona] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Right panel — character image
  const [charImage, setCharImage] = useState(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imageError, setImageError] = useState('');

  // Right panel — content preview
  const [previewPillar, setPreviewPillar] = useState('ingredient');
  const [previewFormat, setPreviewFormat] = useState('reel');
  const [preview, setPreview] = useState(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);

  useEffect(() => {
    fetch('/api/creator/persona')
      .then(r => r.json())
      .then(d => { if (d.persona) setPersona(d.persona); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (field, value) => setPersona(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/creator/persona', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(persona),
      });
      const data = await res.json();
      if (data.persona) setPersona(data.persona);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {}
    setSaving(false);
  };

  const handleGenerateImage = async () => {
    setGeneratingImage(true);
    setImageError('');
    try {
      const res = await fetch('/api/creator/persona-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona }),
      });
      const data = await res.json();
      if (data.imageUrl) {
        setCharImage(data.imageUrl);
      } else {
        setImageError(data.error || '이미지 생성 실패');
      }
    } catch (e) {
      setImageError(e.message);
    }
    setGeneratingImage(false);
  };

  const handleGeneratePreview = async () => {
    setGeneratingPreview(true);
    setPreview(null);
    try {
      const res = await fetch('/api/creator/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pillar: previewPillar, format: previewFormat }),
      });
      const data = await res.json();
      if (data.success) setPreview(data);
    } catch {}
    setGeneratingPreview(false);
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
      <Loader2 size={22} color="#AEAEB2" style={{ animation: 'spin 1s linear infinite' }} />
    </div>
  );

  if (!persona) return null;

  const PREVIEW_PILLARS = [
    { key: 'ingredient', label: '🧪 성분' },
    { key: 'treatment', label: '💉 시술' },
    { key: 'behind', label: '🔬 비하인드' },
    { key: 'trend', label: '✨ 트렌드' },
  ];
  const PREVIEW_FORMATS = [
    { key: 'reel', label: 'Reels' },
    { key: 'shorts', label: 'Shorts' },
    { key: 'cardnews', label: '카드뉴스' },
  ];

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', maxWidth: 734 }}>

      {/* ── Left: Form ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Persona Preview Card */}
        <div style={{ ...CARD, marginBottom: 20, background: 'linear-gradient(135deg, #F5F5FF 0%, #EEF0FF 100%)', borderColor: '#D4D7FF' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#5E6AD2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0, overflow: 'hidden' }}>
              {charImage
                ? <img src={charImage} alt="캐릭터" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : '🧬'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1D1D1F' }}>{persona.name}</div>
              <div style={{ fontSize: 12.5, color: '#5E6AD2', fontWeight: 500, marginTop: 2 }}>@{persona.handle}</div>
              <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 4, lineHeight: 1.4 }}>{persona.occupation} · {persona.age}</div>
            </div>
            <button
              onClick={onGoCreate}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 9, border: 'none', background: '#5E6AD2', color: '#FFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
            >
              콘텐츠 만들기 <ArrowRight size={14} />
            </button>
          </div>
          {persona.bio && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.6)', borderRadius: 8, fontSize: 12.5, color: '#1D1D1F', lineHeight: 1.5, fontStyle: 'italic' }}>
              "{persona.bio}"
            </div>
          )}
        </div>

        {/* Section 1: 기본 프로필 */}
        <div style={{ ...CARD, marginBottom: 16 }}>
          <SectionHeader icon={User} title="기본 프로필" subtitle="페르소나의 정체성을 정의하는 핵심 정보" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <FieldLabel>이름</FieldLabel>
              <TextInput value={persona.name || ''} onChange={v => set('name', v)} placeholder="밀리 (Milli)" />
            </div>
            <div>
              <FieldLabel>SNS 핸들</FieldLabel>
              <TextInput value={persona.handle || ''} onChange={v => set('handle', v)} placeholder="millimilli.kr" />
            </div>
            <div>
              <FieldLabel>나이</FieldLabel>
              <TextInput value={persona.age || ''} onChange={v => set('age', v)} placeholder="29세" />
            </div>
            <div>
              <FieldLabel>직업</FieldLabel>
              <TextInput value={persona.occupation || ''} onChange={v => set('occupation', v)} placeholder="화장품 연구원 / 창업자" />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <FieldLabel>배경 스토리</FieldLabel>
            <TextArea value={persona.background || ''} onChange={v => set('background', v)} placeholder="어떻게 이 페르소나가 만들어졌나요? 학력, 경력, 창업 계기 등" rows={3} />
          </div>
          <div>
            <FieldLabel>한 줄 자기소개 (콘텐츠 바이오)</FieldLabel>
            <TextInput value={persona.bio || ''} onChange={v => set('bio', v)} placeholder="팔로워에게 가장 인상적으로 남는 한 문장" />
          </div>
        </div>

        {/* Section 2: 외모 & 스타일 */}
        <div style={{ ...CARD, marginBottom: 16 }}>
          <SectionHeader icon={BookImage} title="외모 & 스타일" subtitle="AI 영상·이미지 생성 시 비주얼 프롬프트로 활용" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <FieldLabel>피부 타입 & 특징</FieldLabel>
              <TextInput value={persona.skinType || ''} onChange={v => set('skinType', v)} placeholder="건성 민감성, 약간 어두운 톤" />
            </div>
            <div>
              <FieldLabel>헤어스타일</FieldLabel>
              <TextInput value={persona.hairStyle || ''} onChange={v => set('hairStyle', v)} placeholder="자연스러운 단발, 연구 중엔 번" />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <FieldLabel>시그니처 룩 (AI 이미지 생성 기준 설명)</FieldLabel>
            <TextArea value={persona.signatureLook || ''} onChange={v => set('signatureLook', v)} placeholder="흰 가운, 내추럴 피부, 최소한의 메이크업 — AI 비주얼 프롬프트에 그대로 반영됩니다" rows={2} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <FieldLabel>평소 착장</FieldLabel>
            <TextArea value={persona.typicalOutfit || ''} onChange={v => set('typicalOutfit', v)} placeholder="연구실: 흰 가운 / 촬영: 오프화이트·베이지 니트 + 슬랙스" rows={2} />
          </div>
          <div>
            <FieldLabel>시그니처 소품 & 액세서리</FieldLabel>
            <TextInput value={persona.accessories || ''} onChange={v => set('accessories', v)} placeholder="얇은 금 귀걸이, 항상 스킨케어 제품을 손에" />
          </div>
        </div>

        {/* Section 3: 성격 & 커뮤니케이션 */}
        <div style={{ ...CARD, marginBottom: 16 }}>
          <SectionHeader icon={User} title="성격 & 커뮤니케이션 스타일" subtitle="콘텐츠 톤·댓글 응대·캡션 스타일에 자동 반영" />
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>성격 특성 (복수 선택)</FieldLabel>
            <ChipToggle options={PERSONALITY_OPTIONS} selected={persona.personality || []} onChange={v => set('personality', v)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <FieldLabel>핵심 가치관 / 철학</FieldLabel>
            <TextArea value={Array.isArray(persona.values) ? persona.values.join(', ') : (persona.values || '')} onChange={v => set('values', v.split(',').map(s => s.trim()).filter(Boolean))} placeholder="과학 근거 기반, 소비자 솔직 정보, 커뮤니티 신뢰" rows={2} />
          </div>
          <div>
            <FieldLabel>커뮤니케이션 톤</FieldLabel>
            <TextArea value={persona.communicationTone || ''} onChange={v => set('communicationTone', v)} placeholder="전문적이되 쉽게. 강의 말고 대화. 어려운 성분도 비유로 설명." rows={2} />
          </div>
        </div>

        {/* Section 4: 시그니처 행동 패턴 */}
        <div style={{ ...CARD, marginBottom: 16 }}>
          <SectionHeader icon={FlaskConical} title="시그니처 행동 패턴" subtitle="영상 연출 방향·스크립트 생성에 활용" />
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>반복 행동 패턴 (줄바꿈으로 구분)</FieldLabel>
            <TextArea value={persona.signatureActions || ''} onChange={v => set('signatureActions', v)} placeholder={"성분 이름 들으면 분자 구조부터 찾아봄\n신제품 받으면 성분표 먼저 스캔\n손가락으로 가리키며 설명하는 버릇"} rows={4} />
          </div>
          <div>
            <FieldLabel>시그니처 콘텐츠 시나리오 (자주 찍는 상황)</FieldLabel>
            <ChipToggle options={SCENARIO_OPTIONS} selected={persona.scenarios || []} onChange={v => set('scenarios', v)} />
          </div>
        </div>

        {/* Section 5: 후킹 문구 */}
        <div style={{ ...CARD, marginBottom: 16 }}>
          <SectionHeader icon={MessageSquareQuote} title="후킹 문구 & 캐치프레이즈" subtitle="오프닝 후킹·캡션 생성 시 우선 참고" />
          <FieldLabel>자주 쓰는 표현 (한 줄씩 입력)</FieldLabel>
          <TagList
            items={typeof persona.catchphrases === 'string'
              ? persona.catchphrases.split('\n').filter(Boolean)
              : (persona.catchphrases || [])}
            onChange={v => set('catchphrases', v)}
            placeholder="예: 이거 진짜 아무도 안 알려줘요 — Enter로 추가"
          />
        </div>

        {/* Section 6: 레퍼런스 이미지 */}
        <div style={{ ...CARD, marginBottom: 20 }}>
          <SectionHeader icon={Camera} title="비주얼 레퍼런스 이미지" subtitle="AI 영상·카드뉴스 스타일 가이드로 활용 (URL 입력)" />
          <ImageUrlList
            items={persona.referenceImages || []}
            onChange={v => set('referenceImages', v)}
          />
        </div>

        {/* Save + CTA */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingBottom: 40 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 22px', borderRadius: 10, border: 'none', background: saving ? '#E5E5EA' : '#1D1D1F', color: saving ? '#AEAEB2' : '#FFF', fontSize: 14, fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}
          >
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />}
            {saving ? '저장 중...' : '페르소나 저장'}
          </button>
          {saved && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#34C759' }}>
              <CheckCircle2 size={14} /> 저장 완료
            </div>
          )}
          <button
            onClick={onGoCreate}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 20px', borderRadius: 10, border: '1.5px solid #5E6AD2', background: '#F0F0FF', color: '#5E6AD2', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}
          >
            콘텐츠 만들기 <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* ── Right: Sticky Panel ── */}
      <div style={{ width: 220, flexShrink: 0, position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 'calc(100vh - 160px)', overflowY: 'auto', paddingRight: 2 }}>

        {/* Character Image */}
        <div style={{ ...CARD, padding: '16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>AI 캐릭터 이미지</div>
          {charImage ? (
            <div style={{ marginBottom: 10 }}>
              <img
                src={charImage}
                alt="AI 캐릭터"
                style={{ width: '100%', borderRadius: 10, objectFit: 'cover', aspectRatio: '3/4', background: '#F2F2F7' }}
              />
            </div>
          ) : (
            <div style={{
              width: '100%', aspectRatio: '3/4', borderRadius: 10, background: 'linear-gradient(135deg, #F0F0FF 0%, #E8E8FF 100%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              marginBottom: 10, border: '1px dashed #D4D7FF',
            }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🧬</div>
              <div style={{ fontSize: 11.5, color: '#AEAEB2', textAlign: 'center', padding: '0 16px' }}>외모 정보를 입력하고<br />AI로 캐릭터를 생성하세요</div>
            </div>
          )}
          {imageError && (
            <div style={{ fontSize: 11, color: '#FF3B30', marginBottom: 8, padding: '6px 10px', background: '#FFF5F5', borderRadius: 6 }}>{imageError}</div>
          )}
          <button
            onClick={handleGenerateImage}
            disabled={generatingImage}
            style={{
              width: '100%', padding: '9px', borderRadius: 8, border: 'none',
              background: generatingImage ? '#E5E5EA' : '#5E6AD2',
              color: generatingImage ? '#AEAEB2' : '#FFF',
              fontSize: 12.5, fontWeight: 600, cursor: generatingImage ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {generatingImage
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> 생성 중 (20-30초)...</>
              : <><Sparkles size={13} /> {charImage ? '다시 생성' : 'AI 캐릭터 생성'}</>}
          </button>
          <div style={{ fontSize: 10.5, color: '#AEAEB2', marginTop: 6, textAlign: 'center' }}>Gemini Imagen 3 · 외모 섹션 기반</div>
        </div>

        {/* Content Preview */}
        <div style={{ ...CARD, padding: '16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>콘텐츠 샘플 미리보기</div>

          {/* Pillar chips */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10.5, color: '#AEAEB2', fontWeight: 600, marginBottom: 5 }}>기둥</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {PREVIEW_PILLARS.map(p => (
                <button key={p.key} onClick={() => { setPreviewPillar(p.key); setPreview(null); }} style={{
                  padding: '4px 8px', borderRadius: 12, border: `1px solid ${previewPillar === p.key ? '#5E6AD2' : '#E5E5EA'}`,
                  background: previewPillar === p.key ? '#F0F0FF' : '#FFF',
                  fontSize: 11, fontWeight: previewPillar === p.key ? 600 : 400,
                  color: previewPillar === p.key ? '#5E6AD2' : '#6E6E73', cursor: 'pointer',
                }}>{p.label}</button>
              ))}
            </div>
          </div>

          {/* Format chips */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, color: '#AEAEB2', fontWeight: 600, marginBottom: 5 }}>포맷</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {PREVIEW_FORMATS.map(f => (
                <button key={f.key} onClick={() => { setPreviewFormat(f.key); setPreview(null); }} style={{
                  padding: '4px 8px', borderRadius: 12, border: `1px solid ${previewFormat === f.key ? '#1D1D1F' : '#E5E5EA'}`,
                  background: previewFormat === f.key ? '#F2F2F7' : '#FFF',
                  fontSize: 11, fontWeight: previewFormat === f.key ? 600 : 400,
                  color: previewFormat === f.key ? '#1D1D1F' : '#6E6E73', cursor: 'pointer',
                }}>{f.label}</button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGeneratePreview}
            disabled={generatingPreview}
            style={{
              width: '100%', padding: '8px', borderRadius: 8, border: 'none',
              background: generatingPreview ? '#E5E5EA' : '#1D1D1F',
              color: generatingPreview ? '#AEAEB2' : '#FFF',
              fontSize: 12.5, fontWeight: 600, cursor: generatingPreview ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 10,
            }}
          >
            {generatingPreview
              ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> 생성 중...</>
              : <><Sparkles size={12} /> 샘플 생성</>}
          </button>

          {preview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ background: '#F8F8FA', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#5E6AD2', marginBottom: 4 }}>HOOK</div>
                <div style={{ fontSize: 11.5, color: '#1D1D1F', lineHeight: 1.55 }}>{preview.hook}</div>
              </div>
              {preview.script && (
                <div style={{ background: '#F8F8FA', borderRadius: 8, padding: '8px 10px', maxHeight: 160, overflowY: 'auto' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#AEAEB2', marginBottom: 4 }}>SCRIPT</div>
                  <div style={{ fontSize: 11, color: '#1D1D1F', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{preview.script}</div>
                </div>
              )}
              {preview.caption && (
                <div style={{ background: '#FFF9EE', borderRadius: 8, padding: '7px 10px', border: '1px solid #FDEDB0' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#FF9500', marginBottom: 3 }}>CAPTION</div>
                  <div style={{ fontSize: 11, color: '#1D1D1F', lineHeight: 1.5 }}>{preview.caption}</div>
                </div>
              )}
            </div>
          )}
          <div style={{ fontSize: 10.5, color: '#AEAEB2', marginTop: preview ? 8 : 0, textAlign: 'center' }}>Claude Haiku · 저장 없이 빠른 미리보기</div>
        </div>
      </div>

    </div>
  );
}

// ─── Tab Bar ─────────────────────────────────────────────────
function TabBar({ active, onChange, counts }) {
  return (
    <div style={{ display: 'flex', gap: 2, padding: '0 24px', borderBottom: '1px solid #E5E5EA', background: '#FFF' }}>
      {TABS.map(t => {
        const cnt = counts[t.key] ?? null;
        const Icon = t.icon;
        return (
          <button key={t.key} onClick={() => onChange(t.key)} style={{
            padding: '12px 16px', border: 'none', background: 'transparent',
            fontSize: 13.5, fontWeight: active === t.key ? 600 : 400,
            color: active === t.key ? '#1D1D1F' : '#6E6E73',
            borderBottom: active === t.key ? '2px solid #1D1D1F' : '2px solid transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            transition: 'color 0.15s',
          }}>
            {Icon && <Icon size={13} strokeWidth={1.8} />}
            {t.label}
            {cnt != null && cnt > 0 && (
              <span style={{ background: '#5E6AD2', color: '#FFF', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8 }}>
                {cnt}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────
function StatusBadge({ status }) {
  const s = STATUS_LABELS[status] || STATUS_LABELS.draft;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, padding: '3px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {status === 'generating' && <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />}
      {s.label}
    </span>
  );
}

function PlatformChips({ platforms }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {(platforms || []).map(p => {
        const pl = PLATFORMS.find(x => x.key === p);
        return (
          <span key={p} style={{ fontSize: 10, fontWeight: 600, color: pl?.color || '#6E6E73', background: '#F2F2F7', padding: '2px 7px', borderRadius: 5 }}>
            {pl?.label || p}
          </span>
        );
      })}
    </div>
  );
}

// ─── Draft Card ──────────────────────────────────────────────
function DraftCard({ draft, onUpdate, onPublish, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [caption, setCaption] = useState(draft.caption || '');
  const [hashtags, setHashtags] = useState(draft.hashtags || '');
  const [scheduledAt, setScheduledAt] = useState(draft.scheduledAt
    ? new Date(draft.scheduledAt).toISOString().slice(0, 16) : '');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const fmt = FORMATS.find(f => f.key === draft.format);
  const FmtIcon = fmt?.icon || Film;
  const pillar = PILLARS.find(p => p.key === draft.pillar);

  const handleSave = async () => { setSaving(true); await onUpdate(draft.id, { caption, hashtags }); setSaving(false); };
  const handleSchedule = async () => {
    if (!scheduledAt) return;
    setSaving(true);
    await onUpdate(draft.id, { caption, hashtags, scheduledAt: new Date(scheduledAt).toISOString(), status: 'scheduled' });
    setSaving(false);
  };
  const handlePublishNow = async () => { setPublishing(true); await onPublish(draft.id); setPublishing(false); };

  return (
    <div style={{ ...CARD, marginBottom: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F2F2F7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FmtIcon size={15} color="#1D1D1F" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>{pillar?.label || draft.pillar}</span>
            <span style={{ fontSize: 11, color: '#AEAEB2' }}>·</span>
            <span style={{ fontSize: 11.5, color: '#6E6E73' }}>{fmt?.label || draft.format}</span>
          </div>
          <PlatformChips platforms={draft.platforms} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <StatusBadge status={draft.status} />
          <span style={{ fontSize: 11, color: '#AEAEB2' }}>{timeAgo(draft.createdAt)}</span>
          <button onClick={() => setExpanded(!expanded)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6E6E73', padding: 2 }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Hook preview */}
      {draft.hook && (
        <div style={{ background: '#F8F8FA', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
          <span style={{ fontSize: 10.5, color: '#AEAEB2', fontWeight: 600 }}>HOOK</span>
          <p style={{ fontSize: 13, color: '#1D1D1F', margin: '3px 0 0', lineHeight: 1.5 }}>{draft.hook}</p>
        </div>
      )}

      {/* Media */}
      {draft.mediaUrl && (
        <div style={{ marginBottom: 8, borderRadius: 8, overflow: 'hidden', background: '#000', maxHeight: 200, display: 'flex', justifyContent: 'center' }}>
          <video src={draft.mediaUrl} controls style={{ maxHeight: 200, borderRadius: 8 }} />
        </div>
      )}
      {draft.mediaUrls?.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8, paddingBottom: 4 }}>
          {draft.mediaUrls.map((url, i) => (
            <img key={i} src={url} alt={`슬라이드 ${i + 1}`} style={{ height: 80, borderRadius: 6, flexShrink: 0 }} />
          ))}
        </div>
      )}

      {/* 카드뉴스 슬라이드 템플릿 썸네일 (미디어 이미지 없을 때) */}
      {draft.format === 'cardnews' && !draft.mediaUrls?.length && draft.slides?.length > 0 && (() => {
        const tpl = CARD_TEMPLATES.find(t => t.key === draft.cardnewsTemplate) || CARD_TEMPLATES[0];
        return (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8, paddingBottom: 4 }}>
            {draft.slides.slice(0, 5).map((s, i) => (
              <div key={i} style={{
                flexShrink: 0, width: 64, height: 80, borderRadius: 6,
                background: tpl.bg, border: `1px solid ${tpl.border}`,
                padding: '7px 6px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
              }}>
                <div style={{ width: 12, height: 1.5, background: tpl.accent, borderRadius: 1, marginBottom: 4, opacity: 0.8 }} />
                <div style={{ fontSize: 8, fontWeight: 700, color: tpl.text, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                  {s.title}
                </div>
              </div>
            ))}
            {draft.slides.length > 5 && (
              <div style={{ flexShrink: 0, width: 64, height: 80, borderRadius: 6, background: '#F2F2F7', border: '1px solid #E5E5EA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 10, color: '#AEAEB2', fontWeight: 600 }}>+{draft.slides.length - 5}</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Expanded content */}
      {expanded && (
        <div style={{ marginTop: 10 }}>
          {draft.script && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', display: 'block', marginBottom: 4 }}>스크립트</label>
              <div style={{ background: '#F8F8FA', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: '#1D1D1F', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {draft.script}
              </div>
            </div>
          )}
          {draft.slides?.length > 0 && !draft.mediaUrls?.length && (() => {
            const tpl = CARD_TEMPLATES.find(t => t.key === draft.cardnewsTemplate) || CARD_TEMPLATES[0];
            return (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2' }}>슬라이드 ({draft.slides.length}장)</label>
                  <span style={{ fontSize: 10, fontWeight: 600, color: tpl.key === 'noir' ? '#FFF' : '#1D1D1F', background: tpl.bg, border: `1px solid ${tpl.border}`, padding: '1px 7px', borderRadius: 4 }}>{tpl.label}</span>
                </div>
                {draft.slides.map((s, i) => (
                  <div key={i} style={{ background: tpl.bg, border: `1px solid ${tpl.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 16, height: 2, background: tpl.accent, borderRadius: 1 }} />
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: tpl.text, opacity: 0.45 }}>#{s.num || i + 1}</span>
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: tpl.text, lineHeight: 1.4 }}>{s.title}</div>
                    <div style={{ fontSize: 11.5, color: tpl.text, opacity: 0.65, marginTop: 4, lineHeight: 1.5 }}>{s.body}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', display: 'block', marginBottom: 4 }}>캡션</label>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={4}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', display: 'block', marginBottom: 4 }}>해시태그</label>
            <textarea value={hashtags} onChange={e => setHashtags(e.target.value)} rows={2}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit', color: '#5E6AD2' }} />
          </div>

          {(draft.status === 'review' || draft.status === 'scheduled') && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={handleSave} disabled={saving} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #E5E5EA', background: '#FFF', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: '#1D1D1F', display: 'flex', alignItems: 'center', gap: 5 }}>
                {saving ? <Loader2 size={13} /> : <Edit3 size={13} />} 저장
              </button>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 12.5, fontFamily: 'inherit' }} />
                <button onClick={handleSchedule} disabled={saving || !scheduledAt}
                  style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#5E6AD2', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: '#FFF', display: 'flex', alignItems: 'center', gap: 5, opacity: !scheduledAt ? 0.5 : 1 }}>
                  <Calendar size={13} /> 예약
                </button>
              </div>
              <button onClick={handlePublishNow} disabled={publishing}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1D1D1F', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#FFF', display: 'flex', alignItems: 'center', gap: 5, opacity: publishing ? 0.6 : 1 }}>
                {publishing ? <Loader2 size={13} /> : <Send size={13} />} 지금 발행
              </button>
            </div>
          )}
          {draft.status === 'published' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#34C759' }}>
              <CheckCircle2 size={14} /> {formatScheduled(draft.publishedAt)} 발행 완료
            </div>
          )}
          {draft.status === 'failed' && draft.error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#FF3B30', background: '#FFF5F5', padding: '8px 12px', borderRadius: 8 }}>
              <AlertCircle size={13} /> {draft.error}
            </div>
          )}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F2F2F7', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => onDelete(draft.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#FF3B30', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Trash2 size={12} /> 삭제
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create Form ─────────────────────────────────────────────
function CreateForm({ onGenerated }) {
  const [pillar, setPillar] = useState('');
  const [format, setFormat] = useState('reel');
  const [platforms, setPlatforms] = useState(['instagram', 'tiktok']);
  const [notes, setNotes] = useState('');
  const [cardnewsTemplate, setCardnewsTemplate] = useState('clean');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('idle');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);
  const [generateMedia, setGenerateMedia] = useState(true);
  const [persona, setPersona] = useState(null);

  useEffect(() => {
    fetch('/api/creator/persona').then(r => r.json()).then(d => { if (d.persona) setPersona(d.persona); }).catch(() => {});
  }, []);

  const togglePlatform = (key) => setPlatforms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);

  const handleGenerate = async () => {
    if (!pillar) return;
    setLoading(true); setStep('generating'); setError('');
    try {
      const genRes = await fetch('/api/creator/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pillar, format, platforms, notes, cardnewsTemplate }),
      });
      const genData = await genRes.json();
      if (!genData.success) throw new Error(genData.error || '생성 실패');
      setDraft(genData.draft);

      if (generateMedia) {
        setStep('media');
        const mediaRes = await fetch('/api/creator/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: genData.draft.id }),
        });
        const mediaData = await mediaRes.json();
        if (mediaData.success) setDraft(mediaData.draft);
      }
      setStep('done');
      onGenerated();
    } catch (e) {
      setError(e.message); setStep('error');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done' && draft) {
    return (
      <div style={{ maxWidth: 600 }}>
        <div style={{ ...CARD, borderColor: '#34C759', background: '#F0FFF4', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <CheckCircle2 size={18} color="#34C759" />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1D1D1F' }}>콘텐츠 생성 완료!</span>
          </div>
          <p style={{ fontSize: 13, color: '#6E6E73', margin: 0 }}>
            {draft.status === 'generating' ? '영상 생성 중 (1-3분 소요) — "검토 대기" 탭에서 확인하세요.' : '"검토 대기" 탭에서 확인·편집·발행할 수 있어요.'}
          </p>
        </div>
        <button onClick={() => { setStep('idle'); setError(''); setDraft(null); setNotes(''); }}
          style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #E5E5EA', background: '#FFF', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> 새 콘텐츠 만들기
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620 }}>
      {/* 페르소나 미니 카드 */}
      {persona && (
        <div style={{ ...CARD, marginBottom: 18, background: 'linear-gradient(135deg, #F8F8FF 0%, #F0F0FF 100%)', padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#5E6AD2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🧬</div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1D1D1F' }}>{persona.name} · @{persona.handle}</div>
              <div style={{ fontSize: 11.5, color: '#6E6E73', marginTop: 2 }}>{persona.occupation} · {persona.age}</div>
            </div>
          </div>
        </div>
      )}

      {/* 1. 콘텐츠 기둥 */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>콘텐츠 기둥</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PILLARS.map(p => (
            <button key={p.key} onClick={() => setPillar(p.key)} style={{
              padding: '8px 14px', borderRadius: 20, border: `1.5px solid ${pillar === p.key ? '#5E6AD2' : '#E5E5EA'}`,
              background: pillar === p.key ? '#F0F0FF' : '#FFF',
              fontSize: 13, fontWeight: pillar === p.key ? 600 : 400,
              color: pillar === p.key ? '#5E6AD2' : '#6E6E73',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>{p.label}</button>
          ))}
        </div>
        {pillar && <p style={{ fontSize: 11.5, color: '#AEAEB2', margin: '6px 0 0' }}>{PILLARS.find(p => p.key === pillar)?.desc}</p>}
      </div>

      {/* 2. 포맷 */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>포맷</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {FORMATS.map(f => {
            const FIcon = f.icon;
            return (
              <button key={f.key} onClick={() => setFormat(f.key)} style={{
                flex: 1, padding: '12px 10px', borderRadius: 10,
                border: `1.5px solid ${format === f.key ? '#1D1D1F' : '#E5E5EA'}`,
                background: format === f.key ? '#F8F8FA' : '#FFF',
                cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
              }}>
                <FIcon size={18} color={format === f.key ? '#1D1D1F' : '#AEAEB2'} style={{ display: 'block', margin: '0 auto 5px' }} />
                <div style={{ fontSize: 13, fontWeight: format === f.key ? 600 : 400, color: format === f.key ? '#1D1D1F' : '#6E6E73' }}>{f.label}</div>
                <div style={{ fontSize: 10.5, color: '#AEAEB2', marginTop: 2 }}>{f.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2.5. 카드뉴스 템플릿 */}
      {format === 'cardnews' && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>카드뉴스 템플릿</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {CARD_TEMPLATES.map(t => {
              const active = cardnewsTemplate === t.key;
              return (
                <button key={t.key} onClick={() => setCardnewsTemplate(t.key)} style={{
                  flex: 1, padding: '12px 8px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                  background: t.bg,
                  border: active ? `2px solid ${t.key === 'noir' ? '#AEAEB2' : '#5E6AD2'}` : `1.5px solid ${t.border}`,
                  boxShadow: active ? `0 0 0 3px ${t.key === 'noir' ? '#33333340' : '#5E6AD220'}` : 'none',
                  transition: 'all 0.15s',
                }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: t.text, marginBottom: 4 }}>{t.label}</div>
                  <div style={{ width: '60%', height: 2, background: t.accent, margin: '0 auto', borderRadius: 1, opacity: 0.8 }} />
                  {active && <div style={{ fontSize: 9, color: t.text, opacity: 0.5, marginTop: 4 }}>선택됨</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. 플랫폼 */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>발행 플랫폼</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {PLATFORMS.map(p => (
            <button key={p.key} onClick={() => togglePlatform(p.key)} style={{
              padding: '8px 16px', borderRadius: 8,
              border: `1.5px solid ${platforms.includes(p.key) ? p.color : '#E5E5EA'}`,
              background: platforms.includes(p.key) ? `${p.color}12` : '#FFF',
              fontSize: 13, fontWeight: platforms.includes(p.key) ? 600 : 400,
              color: platforms.includes(p.key) ? p.color : '#6E6E73',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* 4. 추가 메모 */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>추가 메모 (선택)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="예: 레티놀 vs 나이아신아마이드 비교 / 신제품 출시 기념 / 의사 콜라보 영상"
          rows={3}
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit', outline: 'none' }} />
      </div>

      {/* 미디어 생성 옵션 */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" id="gen-media" checked={generateMedia} onChange={e => setGenerateMedia(e.target.checked)} style={{ cursor: 'pointer' }} />
        <label htmlFor="gen-media" style={{ fontSize: 13, color: '#6E6E73', cursor: 'pointer' }}>
          {format === 'cardnews' ? `카드뉴스 이미지 자동 생성 (${CARD_TEMPLATES.find(t => t.key === cardnewsTemplate)?.label || '클린'} 템플릿)` : '영상 자동 생성 (Higgsfield)'}
        </label>
      </div>

      {step === 'error' && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#FFF5F5', borderRadius: 8, fontSize: 13, color: '#FF3B30', display: 'flex', gap: 8 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
        </div>
      )}

      <button onClick={handleGenerate} disabled={loading || !pillar || platforms.length === 0} style={{
        width: '100%', padding: '14px', borderRadius: 10, border: 'none',
        background: loading || !pillar ? '#E5E5EA' : '#1D1D1F',
        color: loading || !pillar ? '#AEAEB2' : '#FFF',
        fontSize: 14.5, fontWeight: 700, cursor: loading || !pillar ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s',
      }}>
        {loading ? (
          <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            {step === 'generating' ? 'Claude가 콘텐츠 생성 중...' : step === 'media' ? '미디어 생성 중...' : '처리 중...'}</>
        ) : (
          <><Sparkles size={16} /> AI 콘텐츠 생성</>
        )}
      </button>
    </div>
  );
}

// ─── Draft List ──────────────────────────────────────────────
function DraftList({ statusFilter, drafts, loading, onRefresh, onUpdate, onPublish, onDelete }) {
  const filtered = drafts.filter(d => {
    if (statusFilter === 'review') return ['review', 'generating', 'failed'].includes(d.status);
    if (statusFilter === 'scheduled') return d.status === 'scheduled';
    if (statusFilter === 'published') return d.status === 'published';
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={onRefresh} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6E6E73', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5 }}>
          <RefreshCw size={13} /> 새로고침
        </button>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#AEAEB2' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#AEAEB2' }}>
          <Sparkles size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
          <p style={{ fontSize: 13.5, margin: 0 }}>
            {statusFilter === 'review' ? '검토 대기 콘텐츠가 없어요' :
             statusFilter === 'scheduled' ? '예약된 콘텐츠가 없어요' :
             statusFilter === 'published' ? '아직 발행한 콘텐츠가 없어요' : '콘텐츠가 없어요'}
          </p>
        </div>
      ) : (
        filtered.map(d => <DraftCard key={d.id} draft={d} onUpdate={onUpdate} onPublish={onPublish} onDelete={onDelete} />)
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────
export default function CreatorView() {
  const [tab, setTab] = useState('persona');
  const [drafts, setDrafts] = useState([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);

  const fetchDrafts = useCallback(async () => {
    setLoadingDrafts(true);
    try {
      const res = await fetch('/api/creator/list');
      const data = await res.json();
      if (data.drafts) setDrafts(data.drafts);
    } catch {}
    setLoadingDrafts(false);
  }, []);

  useEffect(() => {
    fetchDrafts();
    const hasGenerating = drafts.some(d => d.status === 'generating');
    if (!hasGenerating) return;
    const interval = setInterval(fetchDrafts, 30000);
    return () => clearInterval(interval);
  }, [fetchDrafts, drafts.length]);

  const handleUpdate = async (id, fields) => {
    try {
      const res = await fetch(`/api/creator/draft?id=${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (data.draft) setDrafts(prev => prev.map(d => d.id === id ? data.draft : d));
    } catch {}
  };

  const handlePublish = async (id) => {
    try {
      const res = await fetch('/api/creator/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.draft) setDrafts(prev => prev.map(d => d.id === id ? data.draft : d));
      if (data.success) setTab('published');
    } catch {}
  };

  const handleDelete = async (id) => {
    if (!confirm('삭제하시겠어요?')) return;
    try {
      await fetch(`/api/creator/draft?id=${id}`, { method: 'DELETE' });
      setDrafts(prev => prev.filter(d => d.id !== id));
    } catch {}
  };

  const counts = {
    review: drafts.filter(d => ['review', 'generating', 'failed'].includes(d.status)).length,
    scheduled: drafts.filter(d => d.status === 'scheduled').length,
    published: drafts.filter(d => d.status === 'published').length,
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#F5F5F7' }}>
      {/* Header */}
      <div style={{ background: '#FFF', borderBottom: '1px solid #E5E5EA', padding: '16px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: '#5E6AD2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={16} color="#FFF" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1D1D1F' }}>AI 크리에이터</h1>
            <p style={{ margin: 0, fontSize: 11.5, color: '#AEAEB2' }}>밀리밀리 · 페르소나 콘텐츠 생성·검토·발행</p>
          </div>
        </div>
        <TabBar active={tab} onChange={setTab} counts={counts} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {tab === 'persona' && (
          <PersonaSetup onGoCreate={() => setTab('create')} />
        )}
        {tab === 'create' && (
          <CreateForm onGenerated={() => { fetchDrafts(); setTab('review'); }} />
        )}
        {(tab === 'review' || tab === 'scheduled' || tab === 'published') && (
          <DraftList
            statusFilter={tab}
            drafts={drafts}
            loading={loadingDrafts}
            onRefresh={fetchDrafts}
            onUpdate={handleUpdate}
            onPublish={handlePublish}
            onDelete={handleDelete}
          />
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

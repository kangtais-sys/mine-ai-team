// ContentSetup.jsx — V3 Phase 2-A 보강판
// 스텝 UI: ① 베이스 얼굴 → ② 주제 + 사이즈 → ③ 스토리보드
//   1단계: photo 자산 중 1개 선택 + 디테일 설명 + "저장된 베이스" 관리(creator_identity.data.saved_bases)
//   2단계: 골격만 (주제 + 영상 사이즈). 생성 버튼은 "준비중"
//   3단계: placeholder
// 하위 호환: generate API / StoryboardEditor 에 personaId 자리로 baseAssetId 전달
import { useState, useEffect } from 'react';
import { Loader2, Globe, UserSquare2, ChevronRight, ChevronLeft, Save, Trash2, ImageOff, Sparkles, Film } from 'lucide-react';

// scene_type 별 스타일 (씬 종류 — 비주얼 분류)
const SCENE_TYPES = {
  hook_3sec:    { label: '후킹 3초',  color: '#FF3B30', bg: '#FF3B3015' },
  before:       { label: '비포',      color: '#FF9500', bg: '#FF950015' },
  product:      { label: '제품',      color: '#5E6AD2', bg: '#5E6AD215' },
  after:        { label: '애프터',    color: '#34C759', bg: '#34C75915' },
  talking_head: { label: '토킹',      color: '#007AFF', bg: '#007AFF15' },
  broll:        { label: 'B-roll',    color: '#AEAEB2', bg: '#AEAEB215' },
};

// message.role 별 스타일 (카피의 역할 — 후킹/정보/CTA/전환)
const ROLE_TYPES = {
  hook:       { label: '🪝 후킹', color: '#FF3B30', bg: '#FF3B3015' },
  info:       { label: '💡 정보', color: '#007AFF', bg: '#007AFF15' },
  cta:        { label: '📣 CTA',  color: '#34C759', bg: '#34C75915' },
  transition: { label: '↪ 전환',  color: '#AEAEB2', bg: '#AEAEB215' },
};

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok',    label: 'TikTok' },
  { key: 'youtube',   label: 'YouTube' },
];

const SIZES = [
  { key: '9:16', label: '세로 9:16', desc: '릴스·숏츠·틱톡' },
  { key: '1:1',  label: '정사각 1:1', desc: '인스타 피드' },
  { key: '16:9', label: '가로 16:9',  desc: '유튜브' },
];

const STEPS = [
  { n: 1, label: '얼굴' },
  { n: 2, label: '주제' },
  { n: 3, label: '스토리보드' },
];

export default function ContentSetup({ onDraftCreated, identityId = 'mine-primary' }) {
  // 스텝
  const [step, setStep] = useState(1);

  // 1단계 — 베이스 얼굴
  const [photos, setPhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [baseAssetId, setBaseAssetId] = useState(null);
  const [baseAssetUrl, setBaseAssetUrl] = useState(null);
  const [baseDescription, setBaseDescription] = useState('');
  const [savedBases, setSavedBases] = useState([]);
  const [saving, setSaving] = useState(false);

  // 2단계 — 주제 + 사이즈
  const [topic, setTopic] = useState('');
  const [size, setSize] = useState('9:16');
  const [language, setLanguage] = useState('ko');
  const [platforms, setPlatforms] = useState(['instagram', 'tiktok']);
  const [notes, setNotes] = useState('');

  // 3단계 — 스토리보드 결과
  const [generating, setGenerating] = useState(false);
  const [scenes, setScenes] = useState([]);
  const [draftId, setDraftId] = useState(null);

  const [error, setError] = useState('');

  const generateStoryboard = async () => {
    if (generating) return;
    if (!baseAssetId || !topic.trim()) {
      setError('베이스 얼굴 + 주제 둘 다 필요해.');
      return;
    }
    setGenerating(true);
    setError('');
    setStep(3);
    try {
      const r = await fetch('/api/creator/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseAssetId,
          baseAssetUrl,
          baseDescription,
          topic,
          aspectRatio: size,
          language,
          platforms,
          notes,
          identityId,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d?.success) {
        setError(d?.error || `생성 실패 (${r.status})`);
        setScenes([]);
        return;
      }
      setScenes(d.draft?.scenes || []);
      setDraftId(d.draft?.id || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  // photo 자산 fetch
  useEffect(() => {
    setPhotosLoading(true);
    fetch(`/api/creator/identity-search?identityId=${identityId}&assetType=photo&limit=50&sort=newest`)
      .then((r) => r.json())
      .then((d) => setPhotos(d.assets || []))
      .catch((e) => console.error('[ContentSetup photos]', e))
      .finally(() => setPhotosLoading(false));
  }, [identityId]);

  // identity.data.saved_bases fetch
  useEffect(() => {
    fetch(`/api/creator/identity?id=${identityId}`)
      .then((r) => r.json())
      .then((d) => setSavedBases(d?.identity?.data?.saved_bases || []))
      .catch((e) => console.error('[ContentSetup identity]', e));
  }, [identityId]);

  const togglePlatform = (key) => {
    setPlatforms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
  };

  const selectBase = (asset) => {
    setBaseAssetId(asset.id);
    setBaseAssetUrl(asset.url);
  };

  const selectSaved = (b) => {
    setBaseAssetId(b.assetId);
    setBaseAssetUrl(b.url);
    setBaseDescription(b.description || '');
  };

  // 저장된 베이스에 추가 (identity PATCH)
  const saveCurrentAsBase = async () => {
    if (!baseAssetId || saving) return;
    const name = window.prompt('이 베이스의 이름은? (예: 생얼 모공샷)');
    if (!name) return;
    const entry = {
      id: crypto.randomUUID(),
      name,
      assetId: baseAssetId,
      url: baseAssetUrl,
      description: baseDescription || '',
      created_at: new Date().toISOString(),
    };
    const next = [...savedBases, entry];
    setSaving(true);
    try {
      const r = await fetch('/api/creator/identity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: identityId, savedBases: next }),
      });
      const d = await r.json();
      if (!r.ok || !d?.success) {
        alert(`저장 실패: ${d?.error || r.status}`);
        return;
      }
      setSavedBases(next);
    } catch (e) {
      alert(`저장 실패: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const removeSavedBase = async (id) => {
    if (!window.confirm('이 베이스 프리셋을 삭제?')) return;
    const next = savedBases.filter((b) => b.id !== id);
    try {
      const r = await fetch('/api/creator/identity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: identityId, savedBases: next }),
      });
      const d = await r.json();
      if (!r.ok || !d?.success) {
        alert(`삭제 실패: ${d?.error || r.status}`);
        return;
      }
      setSavedBases(next);
    } catch (e) {
      alert(`삭제 실패: ${e.message}`);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 스텝 인디케이터 */}
      <StepHeader step={step} setStep={setStep} canEnter={(n) => n === 1 || (n === 2 && !!baseAssetId) || (n === 3 && !!baseAssetId && !!topic.trim())} />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {step === 1 && (
          <Step1Face
            photos={photos}
            photosLoading={photosLoading}
            baseAssetId={baseAssetId}
            baseAssetUrl={baseAssetUrl}
            baseDescription={baseDescription}
            setBaseDescription={setBaseDescription}
            selectBase={selectBase}
            savedBases={savedBases}
            selectSaved={selectSaved}
            saveCurrentAsBase={saveCurrentAsBase}
            removeSavedBase={removeSavedBase}
            saving={saving}
          />
        )}

        {step === 2 && (
          <Step2Topic
            topic={topic} setTopic={setTopic}
            size={size} setSize={setSize}
            language={language} setLanguage={setLanguage}
            platforms={platforms} togglePlatform={togglePlatform}
            notes={notes} setNotes={setNotes}
            baseAssetUrl={baseAssetUrl}
            baseDescription={baseDescription}
            onGenerate={generateStoryboard}
            generating={generating}
          />
        )}

        {step === 3 && (
          <Step3Storyboard
            scenes={scenes}
            generating={generating}
            topic={topic}
            aspectRatio={size}
            baseAssetUrl={baseAssetUrl}
            baseDescription={baseDescription}
            onRegenerate={generateStoryboard}
            draftId={draftId}
          />
        )}

        {error && (
          <div style={{ margin: 24, padding: '10px 12px', borderRadius: 8, background: '#FFF5F5', color: '#FF3B30', fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      {/* 단계 네비 */}
      <div style={{ borderTop: '1px solid #E5E5EA', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FAFAFA' }}>
        <button
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '8px 14px', borderRadius: 8, border: '1px solid #E5E5EA',
            background: '#FFF', color: step === 1 ? '#AEAEB2' : '#1D1D1F',
            fontSize: 13, fontWeight: 500,
            cursor: step === 1 ? 'not-allowed' : 'pointer',
            opacity: step === 1 ? 0.5 : 1,
          }}
        >
          <ChevronLeft size={14} /> 뒤로
        </button>

        <div style={{ fontSize: 11.5, color: '#AEAEB2' }}>
          {step} / 3
        </div>

        <button
          onClick={() => {
            if (step === 1 && !baseAssetId) { setError('베이스 얼굴을 먼저 선택하세요'); return; }
            if (step === 2 && !topic.trim()) { setError('주제를 입력하세요'); return; }
            setError('');
            setStep((s) => Math.min(3, s + 1));
          }}
          disabled={step === 3 || (step === 1 && !baseAssetId) || (step === 2 && !topic.trim())}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '8px 14px', borderRadius: 8, border: 'none',
            background: '#5E6AD2', color: '#FFF',
            fontSize: 13, fontWeight: 600,
            cursor: (step === 3 || (step === 1 && !baseAssetId) || (step === 2 && !topic.trim())) ? 'not-allowed' : 'pointer',
            opacity: (step === 3 || (step === 1 && !baseAssetId) || (step === 2 && !topic.trim())) ? 0.5 : 1,
          }}
        >
          다음 <ChevronRight size={14} />
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ---------------- 스텝 헤더 ----------------
function StepHeader({ step, setStep, canEnter }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '14px 24px', borderBottom: '1px solid #E5E5EA', background: '#FFF' }}>
      {STEPS.map((s, i) => {
        const active = step === s.n;
        const done = step > s.n;
        const enterable = canEnter(s.n);
        return (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <button
              onClick={() => enterable && setStep(s.n)}
              disabled={!enterable}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 10px 4px 4px', borderRadius: 999, border: 'none',
                background: 'transparent', cursor: enterable ? 'pointer' : 'not-allowed',
              }}
            >
              <span style={{
                width: 24, height: 24, borderRadius: '50%',
                background: active ? '#5E6AD2' : done ? '#34C75933' : '#E5E5EA',
                color: active ? '#FFF' : done ? '#34C759' : '#AEAEB2',
                fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{s.n}</span>
              <span style={{
                fontSize: 13, fontWeight: active ? 700 : 500,
                color: active ? '#1D1D1F' : done ? '#34C759' : '#AEAEB2',
              }}>{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 1, background: '#E5E5EA' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------- 1단계: 얼굴 ----------------
function Step1Face({
  photos, photosLoading,
  baseAssetId, baseAssetUrl, baseDescription, setBaseDescription,
  selectBase,
  savedBases, selectSaved, saveCurrentAsBase, removeSavedBase, saving,
}) {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 760 }}>
      {/* 저장된 베이스 */}
      <section>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          저장된 베이스
        </div>
        {savedBases.length === 0 ? (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: '#F5F5F7', fontSize: 12, color: '#AEAEB2' }}>
            아직 저장된 베이스 프리셋이 없어. 아래에서 사진을 골라 [💾 베이스로 저장] 해.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {savedBases.map((b) => {
              const on = baseAssetId === b.assetId;
              return (
                <div
                  key={b.id}
                  style={{
                    position: 'relative',
                    border: `2.5px solid ${on ? '#5E6AD2' : '#E5E5EA'}`,
                    borderRadius: 10, overflow: 'hidden',
                    background: '#FFF', cursor: 'pointer',
                  }}
                  onClick={() => selectSaved(b)}
                >
                  <SafeImage src={b.url} alt={b.name} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} />
                  <div style={{ padding: '6px 8px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                    {b.description && (
                      <div style={{ fontSize: 10.5, color: '#AEAEB2', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.description}</div>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSavedBase(b.id); }}
                    title="프리셋 삭제"
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      background: 'rgba(255,59,48,0.85)', color: '#FFF',
                      border: 'none', borderRadius: '50%', width: 22, height: 22,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 새로 선택 */}
      <section>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <UserSquare2 size={12} /> 새로 선택 (라이브러리 사진)
        </div>
        {photosLoading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#AEAEB2' }}>
            <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : photos.length === 0 ? (
          <div style={{ padding: '12px 14px', borderRadius: 8, background: '#FFF8E6', border: '1px solid #FF950030', fontSize: 12.5, color: '#FF9500', lineHeight: 1.5 }}>
            사진 자산이 없어. Identity 탭에서 얼굴 사진 먼저 업로드해.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
            {photos.map((p) => {
              const on = baseAssetId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => selectBase(p)}
                  title={(p.manual_tags || []).join(', ') || ''}
                  style={{
                    aspectRatio: '1 / 1', padding: 0,
                    border: `2.5px solid ${on ? '#5E6AD2' : '#E5E5EA'}`,
                    borderRadius: 8, overflow: 'hidden',
                    cursor: 'pointer', background: '#FFF', outline: 'none',
                  }}
                >
                  <SafeImage
                    src={p.thumbnail_url || p.url}
                    filename={p.filename || ''}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 디테일 + 저장 */}
      {baseAssetId && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, background: '#F5F5F7', borderRadius: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <SafeImage src={baseAssetUrl} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                얼굴/피부 디테일 설명 (선택)
              </div>
              <textarea
                value={baseDescription}
                onChange={(e) => setBaseDescription(e.target.value)}
                placeholder="예: 모공까지 보이는 생얼, 보습 직전 건조한 피부 상태"
                rows={2}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E5EA',
                  fontSize: 13, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit',
                  outline: 'none', background: '#FFF',
                }}
              />
            </div>
          </div>
          <button
            onClick={saveCurrentAsBase}
            disabled={saving}
            style={{
              alignSelf: 'flex-end',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 8, border: '1px solid #5E6AD230',
              background: '#5E6AD212', color: '#5E6AD2', fontSize: 12.5, fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Save size={13} />}
            베이스로 저장
          </button>
        </section>
      )}
    </div>
  );
}

// ---------------- 2단계: 주제 + 사이즈 ----------------
function Step2Topic({
  topic, setTopic,
  size, setSize,
  language, setLanguage,
  platforms, togglePlatform,
  notes, setNotes,
  baseAssetUrl, baseDescription,
  onGenerate, generating,
}) {
  const canGenerate = !!topic.trim() && !generating;
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 600 }}>
      {/* 베이스 요약 */}
      <div style={{ display: 'flex', gap: 10, padding: 10, background: '#F5F5F7', borderRadius: 10, alignItems: 'center' }}>
        <SafeImage src={baseAssetUrl} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, color: '#AEAEB2', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>선택된 베이스</div>
          <div style={{ fontSize: 12.5, color: '#1D1D1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {baseDescription || '디테일 설명 없음'}
          </div>
        </div>
      </div>

      <div>
        <label style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          콘텐츠 주제 *
        </label>
        <textarea
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="예: 레티놀 입문자를 위한 가이드"
          rows={3}
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13.5, lineHeight: 1.55, resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
        />
      </div>

      <div>
        <label style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          영상 사이즈
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {SIZES.map((s) => (
            <button
              key={s.key}
              onClick={() => setSize(s.key)}
              style={{
                flex: 1, padding: '12px 8px', borderRadius: 10,
                border: `1.5px solid ${size === s.key ? '#5E6AD2' : '#E5E5EA'}`,
                background: size === s.key ? '#5E6AD212' : '#FFF',
                cursor: 'pointer', textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: size === s.key ? 700 : 500, color: size === s.key ? '#5E6AD2' : '#1D1D1F' }}>{s.label}</div>
              <div style={{ fontSize: 10.5, color: '#AEAEB2', marginTop: 2 }}>{s.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <Globe size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          언어
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[{ key: 'ko', label: '한국어' }, { key: 'en', label: 'English' }].map(l => (
            <button key={l.key} onClick={() => setLanguage(l.key)} style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              border: `1.5px solid ${language === l.key ? '#5E6AD2' : '#E5E5EA'}`,
              background: language === l.key ? '#5E6AD212' : '#FFF',
              fontSize: 13, fontWeight: language === l.key ? 600 : 400,
              color: language === l.key ? '#5E6AD2' : '#6E6E73',
              cursor: 'pointer',
            }}>{l.label}</button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          발행 플랫폼
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          {PLATFORMS.map(p => (
            <button key={p.key} onClick={() => togglePlatform(p.key)} style={{
              flex: 1, padding: '8px', borderRadius: 8,
              border: `1.5px solid ${platforms.includes(p.key) ? '#5E6AD2' : '#E5E5EA'}`,
              background: platforms.includes(p.key) ? '#5E6AD212' : '#FFF',
              fontSize: 12, fontWeight: platforms.includes(p.key) ? 600 : 400,
              color: platforms.includes(p.key) ? '#5E6AD2' : '#6E6E73',
              cursor: 'pointer',
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          추가 메모 (선택)
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="강조할 것, 피해야 할 것, 참고 링크..."
          rows={2}
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13, lineHeight: 1.55, resize: 'none', fontFamily: 'inherit', outline: 'none' }}
        />
      </div>

      <button
        onClick={onGenerate}
        disabled={!canGenerate}
        style={{
          width: '100%', padding: '13px 20px', borderRadius: 10, border: 'none',
          background: canGenerate ? '#5E6AD2' : '#F5F5F7',
          color: canGenerate ? '#FFF' : '#AEAEB2',
          fontSize: 14, fontWeight: 700,
          cursor: canGenerate ? 'pointer' : 'not-allowed',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {generating ? (
          <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> AI가 장면을 구성하는 중...</>
        ) : (
          <><Sparkles size={16} /> 스토리보드 생성</>
        )}
      </button>
    </div>
  );
}

// ---------------- 3단계: 스토리보드 (장면 카드 리스트) ----------------
function Step3Storyboard({ scenes, generating, topic, aspectRatio, baseAssetUrl, baseDescription, onRegenerate, draftId }) {
  if (generating) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#AEAEB2', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, height: '100%', justifyContent: 'center' }}>
        <Loader2 size={32} style={{ animation: 'spin 0.8s linear infinite', color: '#5E6AD2' }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F' }}>AI가 장면을 구성하는 중...</div>
        <div style={{ fontSize: 12.5, color: '#AEAEB2', maxWidth: 320, lineHeight: 1.6 }}>
          비포/애프터 구조로 4~6개 장면을 짜고 있어. 10초쯤 걸려.
        </div>
      </div>
    );
  }

  if (!scenes || scenes.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#AEAEB2', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, height: '100%', justifyContent: 'center' }}>
        <Film size={36} strokeWidth={1.5} />
        <div style={{ fontSize: 14, fontWeight: 500, color: '#6E6E73' }}>아직 생성된 스토리보드가 없어</div>
        <div style={{ fontSize: 12, color: '#AEAEB2' }}>2단계로 돌아가서 [스토리보드 생성]을 눌러줘.</div>
      </div>
    );
  }

  const totalSec = scenes.reduce((sum, s) => sum + (s.duration_sec || 0), 0);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 880 }}>
      {/* 상단 요약 */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', background: '#F5F5F7', borderRadius: 12 }}>
        <SafeImage src={baseAssetUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1D1D1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic}</div>
          <div style={{ fontSize: 11.5, color: '#AEAEB2', marginTop: 2 }}>
            {aspectRatio} · {scenes.length}장면 · 총 {totalSec}초
            {baseDescription ? ` · ${baseDescription}` : ''}
          </div>
        </div>
        <button
          onClick={onRegenerate}
          disabled={generating}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '7px 12px', borderRadius: 8, border: '1px solid #E5E5EA',
            background: '#FFF', color: '#5E6AD2', fontSize: 12, fontWeight: 600,
            cursor: generating ? 'not-allowed' : 'pointer',
          }}
        >
          <Sparkles size={12} /> 다시 생성
        </button>
      </div>

      {/* 장면 카드 — message.text 메인, visual은 보조 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {scenes.map((s) => {
          const sceneMeta = SCENE_TYPES[s.scene_type] || SCENE_TYPES.broll;
          const msg = s.message || {};
          const roleMeta = ROLE_TYPES[msg.role] || ROLE_TYPES.info;
          return (
            <div
              key={s.scene_index}
              style={{
                display: 'flex', gap: 14,
                padding: 16, borderRadius: 14,
                background: '#FFF', border: '1px solid #E5E5EA',
              }}
            >
              {/* 좌측: 번호 + 타입 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 56 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: sceneMeta.bg, color: sceneMeta.color,
                  fontWeight: 800, fontSize: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {s.scene_index}
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: sceneMeta.color,
                  padding: '2px 6px', borderRadius: 4, background: sceneMeta.bg,
                  whiteSpace: 'nowrap',
                }}>
                  {sceneMeta.label}
                </div>
                <div style={{ fontSize: 10, color: '#AEAEB2' }}>
                  {s.scene_mode === 'cinematic' ? '🎥 시네마틱' : '📷 정적'}
                </div>
              </div>

              {/* 우측: 메시지 메인 + 비주얼 보조 */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>

                {/* 메시지 영역 (메인) */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, color: roleMeta.color,
                      padding: '3px 8px', borderRadius: 4, background: roleMeta.bg,
                      whiteSpace: 'nowrap',
                    }}>
                      {roleMeta.label}
                    </span>
                    <span style={{ fontSize: 11, color: '#AEAEB2' }}>⏱ {s.duration_sec}초</span>
                  </div>

                  {(msg.caption || msg.text) && (
                    <div style={{
                      fontSize: 18, fontWeight: 700, color: '#1D1D1F',
                      lineHeight: 1.4, letterSpacing: '-0.01em',
                      padding: '10px 12px', borderRadius: 10,
                      background: '#F5F5F7',
                    }}>
                      “{msg.caption || msg.text}”
                    </div>
                  )}

                  {msg.voiceover && (
                    <div style={{
                      marginTop: 8, padding: '8px 10px', borderRadius: 8,
                      background: '#FAFAFA', border: '1px solid #F0F0F2',
                      fontSize: 12.5, color: '#6E6E73', lineHeight: 1.6,
                    }}>
                      <span style={{ fontWeight: 600, color: '#AEAEB2', marginRight: 6 }}>🎙 음성</span>
                      {msg.voiceover}
                    </div>
                  )}

                  {msg.why_works && (
                    <div style={{
                      marginTop: 6, fontSize: 11.5, color: '#8E8E93',
                      lineHeight: 1.5, fontStyle: 'italic',
                    }}>
                      → {msg.why_works}
                    </div>
                  )}
                </div>

                {/* 비주얼 (보조) */}
                {s.visual && (
                  <div style={{
                    fontSize: 11.5, color: '#6E6E73', lineHeight: 1.55,
                    padding: '8px 10px', borderRadius: 8,
                    background: '#FAFAFA', border: '1px solid #F0F0F2',
                  }}>
                    <span style={{ fontWeight: 600, color: '#AEAEB2', marginRight: 6 }}>🎬 비주얼</span>
                    {s.visual}
                  </div>
                )}

                {s.skin_state && (
                  <div style={{ fontSize: 11, color: '#AEAEB2' }}>
                    <span style={{ fontWeight: 600, marginRight: 4 }}>피부 상태</span> · {s.skin_state}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {draftId && (
        <div style={{ fontSize: 10.5, color: '#AEAEB2', textAlign: 'center', marginTop: 4 }}>
          draft: {draftId}
        </div>
      )}

      <div style={{ padding: '10px 12px', borderRadius: 8, background: '#F5F5F7', fontSize: 11.5, color: '#6E6E73', lineHeight: 1.55, textAlign: 'center' }}>
        다음 조각: 각 장면에 라이브러리 자산 끼우기 + 영상 생성
      </div>
    </div>
  );
}

// ---------------- 깨진 이미지 폴백 ----------------
function SafeImage({ src, alt = '', filename = '', style = {} }) {
  const [broken, setBroken] = useState(false);
  if (broken || !src) {
    return (
      <div
        title={filename || 'broken'}
        style={{
          ...style,
          background: '#E5E5EA',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 4,
          color: '#AEAEB2', fontSize: 10, padding: 4, textAlign: 'center',
          overflow: 'hidden',
        }}
      >
        <ImageOff size={18} />
        {filename && (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
            {filename}
          </span>
        )}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(true)}
      style={style}
    />
  );
}

// ContentSetup.jsx — V3 Phase 2-A 보강판
// 스텝 UI: ① 베이스 얼굴 → ② 주제 + 사이즈 → ③ 스토리보드
//   1단계: photo 자산 중 1개 선택 + 디테일 설명 + "저장된 베이스" 관리(creator_identity.data.saved_bases)
//   2단계: 골격만 (주제 + 영상 사이즈). 생성 버튼은 "준비중"
//   3단계: placeholder
// 하위 호환: generate API / StoryboardEditor 에 personaId 자리로 baseAssetId 전달
import { useState, useEffect } from 'react';
import { Loader2, Globe, UserSquare2, ChevronRight, ChevronLeft, Save, Trash2, ImageOff, Sparkles, Film, Pencil, Check, AlertCircle, RotateCcw, ArrowUp, ArrowDown, Plus, Clock, PlayCircle } from 'lucide-react';

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

  // 이어서 작업 — 저장된 draft 목록
  const [drafts, setDrafts] = useState([]);
  const [draftsLoading, setDraftsLoading] = useState(false);

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
      // 새 draft 목록에 반영
      reloadDrafts();
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

  // 저장된 draft 목록 fetch (이어서 작업)
  const reloadDrafts = () => {
    setDraftsLoading(true);
    fetch(`/api/creator/draft?identityId=${identityId}`)
      .then((r) => r.json())
      .then((d) => setDrafts(d.drafts || []))
      .catch((e) => console.error('[ContentSetup drafts]', e))
      .finally(() => setDraftsLoading(false));
  };
  useEffect(() => { reloadDrafts(); }, [identityId]);

  // draft 클릭 → state 복원 후 3단계로 점프
  const loadDraft = (d) => {
    setBaseAssetId(d.baseAssetId || null);
    setBaseAssetUrl(d.baseAssetUrl || null);
    setBaseDescription(d.baseDescription || '');
    setTopic(d.topic || '');
    setSize(d.aspectRatio || '9:16');
    setLanguage(d.language || 'ko');
    setPlatforms(d.platforms || ['instagram', 'tiktok']);
    setNotes(d.notes || '');
    setScenes(d.scenes || []);
    setDraftId(d.id);
    setError('');
    setStep(3);
  };

  // draft 삭제
  const deleteDraft = async (id) => {
    if (!window.confirm('이 스토리보드를 삭제할까? 되돌릴 수 없어.')) return;
    try {
      const r = await fetch(`/api/creator/draft?id=${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok || !d?.success) {
        alert(`삭제 실패: ${d?.error || r.status}`);
        return;
      }
      setDrafts((prev) => prev.filter((x) => x.id !== id));
      // 지금 편집 중인 draft 였으면 초기화
      if (draftId === id) {
        setDraftId(null);
        setScenes([]);
        setStep(1);
      }
    } catch (e) {
      alert(`삭제 실패: ${e.message}`);
    }
  };

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
            drafts={drafts}
            draftsLoading={draftsLoading}
            currentDraftId={draftId}
            loadDraft={loadDraft}
            deleteDraft={deleteDraft}
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
            onScenesUpdate={setScenes}
            generating={generating}
            topic={topic}
            aspectRatio={size}
            language={language}
            platforms={platforms}
            notes={notes}
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

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .editable-text { transition: background 0.15s, outline 0.15s; outline: 1px dashed transparent; outline-offset: 1px; }
        .editable-text:hover { outline-color: #5E6AD260; }
        .editable-text:hover .editable-pencil { opacity: 1; }
      `}</style>
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
  drafts, draftsLoading, currentDraftId, loadDraft, deleteDraft,
}) {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 760 }}>
      {/* 이어서 작업 — 저장된 스토리보드 */}
      <DraftsPanel
        drafts={drafts}
        loading={draftsLoading}
        currentDraftId={currentDraftId}
        loadDraft={loadDraft}
        deleteDraft={deleteDraft}
      />

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
function Step3Storyboard({
  scenes, onScenesUpdate, generating,
  topic, aspectRatio, language, platforms, notes,
  baseAssetUrl, baseDescription,
  onRegenerate, draftId,
}) {
  const [saveState, setSaveState] = useState({ status: 'idle', error: '', at: null });
  // busyKey: `regen:${sceneIndex}` | `add:${afterSceneIndex}` | null
  const [busyKey, setBusyKey] = useState(null);

  const reindex = (arr) => arr.map((s, i) => ({ ...s, scene_index: i + 1 }));

  const persistScenes = async (nextScenes) => {
    if (!draftId) return;
    setSaveState({ status: 'saving', error: '', at: null });
    try {
      const r = await fetch(`/api/creator/draft?id=${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes: nextScenes }),
      });
      const d = await r.json();
      if (!r.ok || !d?.success) {
        setSaveState({ status: 'error', error: d?.error || `저장 실패 (${r.status})`, at: null });
        return;
      }
      setSaveState({ status: 'saved', error: '', at: new Date() });
    } catch (e) {
      setSaveState({ status: 'error', error: e.message, at: null });
    }
  };

  const updateSceneField = (sceneIndex, patch) => {
    const next = scenes.map((s) => {
      if (s.scene_index !== sceneIndex) return s;
      const merged = { ...s, ...patch };
      if (patch.message) merged.message = { ...(s.message || {}), ...patch.message };
      return merged;
    });
    onScenesUpdate(next);
    persistScenes(next);
  };

  const deleteScene = (sceneIndex) => {
    if (!window.confirm(`장면 ${sceneIndex}번을 삭제할까?`)) return;
    const next = reindex(scenes.filter((s) => s.scene_index !== sceneIndex));
    onScenesUpdate(next);
    persistScenes(next);
  };

  const moveScene = (sceneIndex, dir) => {
    const i = scenes.findIndex((s) => s.scene_index === sceneIndex);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= scenes.length) return;
    const arr = [...scenes];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const next = reindex(arr);
    onScenesUpdate(next);
    persistScenes(next);
  };

  const regenerateOne = async (sceneIndex) => {
    if (busyKey) return;
    setBusyKey(`regen:${sceneIndex}`);
    try {
      const r = await fetch('/api/creator/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'regenerate_scene',
          sceneIndex,
          topic, baseDescription, aspectRatio, language, platforms, notes,
          scenes,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d?.success || !d.scene) {
        setSaveState({ status: 'error', error: d?.error || `재생성 실패 (${r.status})`, at: null });
        return;
      }
      const next = reindex(scenes.map((s) =>
        s.scene_index === sceneIndex ? { ...d.scene, scene_index: sceneIndex } : s
      ));
      onScenesUpdate(next);
      persistScenes(next);
    } catch (e) {
      setSaveState({ status: 'error', error: e.message, at: null });
    } finally {
      setBusyKey(null);
    }
  };

  const addBlankScene = (afterSceneIndex) => {
    const insertAt = afterSceneIndex === 0
      ? 0
      : scenes.findIndex((s) => s.scene_index === afterSceneIndex) + 1;
    if (insertAt < 0) return;
    const blank = {
      scene_index: 0,
      scene_type: 'broll',
      scene_mode: 'static',
      message: { caption: '', voiceover: '', role: 'info', why_works: '' },
      visual: '',
      skin_state: '',
      duration_sec: 4,
    };
    const next = reindex([...scenes.slice(0, insertAt), blank, ...scenes.slice(insertAt)]);
    onScenesUpdate(next);
    persistScenes(next);
  };

  const addAiScene = async (afterSceneIndex) => {
    if (busyKey) return;
    setBusyKey(`add:${afterSceneIndex}`);
    try {
      const r = await fetch('/api/creator/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'add_scene',
          insertAfter: afterSceneIndex,
          topic, baseDescription, aspectRatio, language, platforms, notes,
          scenes,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d?.success || !d.scene) {
        setSaveState({ status: 'error', error: d?.error || `장면 추가 실패 (${r.status})`, at: null });
        return;
      }
      const insertAt = afterSceneIndex === 0
        ? 0
        : scenes.findIndex((s) => s.scene_index === afterSceneIndex) + 1;
      const next = reindex([...scenes.slice(0, insertAt), d.scene, ...scenes.slice(insertAt)]);
      onScenesUpdate(next);
      persistScenes(next);
    } catch (e) {
      setSaveState({ status: 'error', error: e.message, at: null });
    } finally {
      setBusyKey(null);
    }
  };

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
      {/* 상단 요약 + 저장 상태 */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', background: '#F5F5F7', borderRadius: 12 }}>
        <SafeImage src={baseAssetUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1D1D1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic}</div>
          <div style={{ fontSize: 11.5, color: '#AEAEB2', marginTop: 2 }}>
            {aspectRatio} · {scenes.length}장면 · 총 {totalSec}초
            {baseDescription ? ` · ${baseDescription}` : ''}
          </div>
        </div>
        <SaveStatus state={saveState} />
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

      <div style={{ fontSize: 11.5, color: '#AEAEB2', textAlign: 'center' }}>
        💡 자막·음성·비주얼·피부 상태 텍스트를 <b>클릭</b>하면 직접 수정할 수 있어. Enter 또는 포커스 아웃으로 저장, Esc로 취소.
      </div>

      {/* 장면 카드 — message.text 메인, visual은 보조 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AddSceneRow
          afterSceneIndex={0}
          onAddBlank={addBlankScene}
          onAddAi={addAiScene}
          busy={busyKey === 'add:0'}
          disabled={!!busyKey}
        />
        {scenes.map((s, idx) => {
          const sceneMeta = SCENE_TYPES[s.scene_type] || SCENE_TYPES.broll;
          const msg = s.message || {};
          const roleMeta = ROLE_TYPES[msg.role] || ROLE_TYPES.info;
          const isFirst = idx === 0;
          const isLast = idx === scenes.length - 1;
          const isRegenerating = busyKey === `regen:${s.scene_index}`;
          return (
            <div key={s.scene_index} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  display: 'flex', gap: 14,
                  padding: 16, borderRadius: 14,
                  background: '#FFF', border: '1px solid #E5E5EA',
                  position: 'relative',
                  opacity: isRegenerating ? 0.55 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {isRegenerating && (
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: 14,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: 'rgba(255,255,255,0.55)', zIndex: 1,
                    fontSize: 12.5, fontWeight: 600, color: '#5E6AD2',
                  }}>
                    <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
                    이 장면 재생성 중...
                  </div>
                )}

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

                  {/* 액션 바 */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                    <SceneActionBtn
                      title="이 장면만 AI 재생성"
                      onClick={() => regenerateOne(s.scene_index)}
                      disabled={!!busyKey}
                      icon={<RotateCcw size={12} />}
                      label="재생성"
                    />
                    <SceneActionBtn
                      title="위로 이동"
                      onClick={() => moveScene(s.scene_index, -1)}
                      disabled={!!busyKey || isFirst}
                      icon={<ArrowUp size={12} />}
                    />
                    <SceneActionBtn
                      title="아래로 이동"
                      onClick={() => moveScene(s.scene_index, +1)}
                      disabled={!!busyKey || isLast}
                      icon={<ArrowDown size={12} />}
                    />
                    <SceneActionBtn
                      title="장면 삭제"
                      onClick={() => deleteScene(s.scene_index)}
                      disabled={!!busyKey}
                      icon={<Trash2 size={12} />}
                      danger
                    />
                  </div>

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

                  {/* caption (자막) — 메인 */}
                  <EditableText
                    value={msg.caption || msg.text || ''}
                    onSave={(v) => updateSceneField(s.scene_index, { message: { caption: v } })}
                    multiline={false}
                    textareaRows={2}
                    placeholder="자막을 입력하세요"
                    emptyHint="자막 없음 — 클릭해서 추가"
                    quoted
                    displayStyle={{
                      fontSize: 18, fontWeight: 700, color: '#1D1D1F',
                      lineHeight: 1.4, letterSpacing: '-0.01em',
                      padding: '10px 12px', borderRadius: 10,
                      background: '#F5F5F7',
                    }}
                    textareaStyle={{
                      fontSize: 17, fontWeight: 700, color: '#1D1D1F', lineHeight: 1.4,
                    }}
                  />

                  {/* voiceover (음성) — 보조 */}
                  <div style={{ marginTop: 8 }}>
                    <EditableText
                      value={msg.voiceover || ''}
                      onSave={(v) => updateSceneField(s.scene_index, { message: { voiceover: v } })}
                      multiline
                      textareaRows={3}
                      placeholder="음성 나레이션을 입력하세요"
                      emptyHint="음성 없음 — 클릭해서 추가"
                      labelPrefix="🎙 음성"
                      displayStyle={{
                        padding: '8px 10px', borderRadius: 8,
                        background: '#FAFAFA', border: '1px solid #F0F0F2',
                        fontSize: 12.5, color: '#6E6E73', lineHeight: 1.6,
                      }}
                      textareaStyle={{ fontSize: 12.5, lineHeight: 1.6, color: '#1D1D1F' }}
                    />
                  </div>

                  {msg.why_works && (
                    <div style={{
                      marginTop: 6, fontSize: 11.5, color: '#8E8E93',
                      lineHeight: 1.5, fontStyle: 'italic',
                    }}>
                      → {msg.why_works}
                    </div>
                  )}
                </div>

                {/* 비주얼 (보조) — 편집 가능 */}
                <EditableText
                  value={s.visual || ''}
                  onSave={(v) => updateSceneField(s.scene_index, { visual: v })}
                  multiline
                  textareaRows={3}
                  placeholder="카메라 각도·모델 행동·조명 등 비주얼 디테일"
                  emptyHint="비주얼 디테일 없음 — 클릭해서 추가"
                  labelPrefix="🎬 비주얼"
                  displayStyle={{
                    fontSize: 11.5, color: '#6E6E73', lineHeight: 1.55,
                    padding: '8px 10px', borderRadius: 8,
                    background: '#FAFAFA', border: '1px solid #F0F0F2',
                  }}
                  textareaStyle={{ fontSize: 11.5, lineHeight: 1.55, color: '#1D1D1F' }}
                />

                {/* 피부 상태 — 편집 가능 */}
                <EditableText
                  value={s.skin_state || ''}
                  onSave={(v) => updateSceneField(s.scene_index, { skin_state: v })}
                  multiline={false}
                  textareaRows={1}
                  placeholder="예: 트러블 있는 칙칙한 피부"
                  emptyHint="피부 상태 없음 — 클릭해서 추가"
                  labelPrefix="피부 상태"
                  displayStyle={{
                    fontSize: 11, color: '#AEAEB2', padding: '4px 6px', borderRadius: 6,
                  }}
                  textareaStyle={{ fontSize: 12, lineHeight: 1.4 }}
                />
                </div>
              </div>
              <AddSceneRow
                afterSceneIndex={s.scene_index}
                onAddBlank={addBlankScene}
                onAddAi={addAiScene}
                busy={busyKey === `add:${s.scene_index}`}
                disabled={!!busyKey}
              />
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

// ---------------- 인라인 편집 텍스트 ----------------
function EditableText({
  value,
  onSave,
  multiline = false,
  textareaRows = 1,
  placeholder = '',
  emptyHint = '클릭해서 편집',
  quoted = false,         // caption — 따옴표로 감싸 표시
  labelPrefix = '',       // voiceover/비주얼/피부 상태 등 prefix 라벨
  displayStyle = {},
  textareaStyle = {},
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  useEffect(() => {
    if (!editing) setDraft(value || '');
  }, [value, editing]);

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if ((draft || '') !== (value || '')) onSave(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(value || '');
            setEditing(false);
          } else if (e.key === 'Enter' && !multiline && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        rows={textareaRows}
        placeholder={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '8px 10px', borderRadius: 8,
          border: '2px solid #5E6AD2',
          fontFamily: 'inherit', outline: 'none',
          resize: multiline ? 'vertical' : 'none',
          background: '#FFF',
          ...textareaStyle,
        }}
      />
    );
  }

  const isEmpty = !value;
  return (
    <div
      className="editable-text"
      onClick={() => { setDraft(value || ''); setEditing(true); }}
      title="클릭해서 편집 (Enter 저장, Esc 취소)"
      style={{
        cursor: 'pointer', position: 'relative', borderRadius: 8,
        ...displayStyle,
        ...(isEmpty ? { color: '#C7C7CC', fontStyle: 'italic' } : {}),
      }}
    >
      {labelPrefix && !isEmpty && (
        <span style={{ fontWeight: 600, color: '#AEAEB2', marginRight: 6 }}>{labelPrefix}</span>
      )}
      {isEmpty
        ? emptyHint
        : (quoted ? `“${value}”` : value)}
      <Pencil
        size={11}
        className="editable-pencil"
        style={{
          position: 'absolute', top: 4, right: 6,
          opacity: 0, color: '#5E6AD2',
          transition: 'opacity 0.15s', pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// ---------------- 저장 상태 표시 ----------------
function SaveStatus({ state }) {
  if (state.status === 'idle') return null;
  if (state.status === 'saving') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#AEAEB2' }}>
        <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} /> 저장중...
      </span>
    );
  }
  if (state.status === 'saved') {
    const t = state.at ? state.at.toTimeString().slice(0, 8) : '';
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#34C759', fontWeight: 600 }}>
        <Check size={11} /> 저장됨 {t}
      </span>
    );
  }
  if (state.status === 'error') {
    return (
      <span title={state.error} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#FF3B30', fontWeight: 600 }}>
        <AlertCircle size={11} /> 저장 실패
      </span>
    );
  }
  return null;
}

// ---------------- 이어서 작업 — 저장된 draft 목록 ----------------
function DraftsPanel({ drafts, loading, currentDraftId, loadDraft, deleteDraft }) {
  if (loading) {
    return (
      <section>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          이어서 작업
        </div>
        <div style={{ padding: 20, textAlign: 'center', color: '#AEAEB2' }}>
          <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
        </div>
      </section>
    );
  }
  if (!drafts || drafts.length === 0) return null;

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={12} /> 이어서 작업 ({drafts.length})
        </div>
        <div style={{ fontSize: 10.5, color: '#AEAEB2' }}>
          클릭 → 스토리보드 편집으로 점프
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {drafts.map((d) => {
          const isCurrent = currentDraftId === d.id;
          const totalSec = (d.scenes || []).reduce((s, x) => s + (x.duration_sec || 0), 0);
          const updated = d.updatedAt || d.createdAt;
          return (
            <div
              key={d.id}
              onClick={() => loadDraft(d)}
              style={{
                display: 'flex', gap: 12, alignItems: 'center',
                padding: '10px 12px', borderRadius: 10,
                border: `1.5px solid ${isCurrent ? '#5E6AD2' : '#E5E5EA'}`,
                background: isCurrent ? '#5E6AD208' : '#FFF',
                cursor: 'pointer', position: 'relative',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <SafeImage
                src={d.baseAssetUrl}
                alt=""
                style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: '#F5F5F7' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: '#1D1D1F',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {d.topic || '(주제 없음)'}
                </div>
                <div style={{ fontSize: 11, color: '#AEAEB2', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span><Film size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />{(d.scenes || []).length}장면</span>
                  <span>· {totalSec}초</span>
                  <span>· {d.aspectRatio || '9:16'}</span>
                  {updated && <span>· {formatRelativeTime(updated)}</span>}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); loadDraft(d); }}
                title="이어서 편집"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '6px 10px', borderRadius: 6,
                  border: '1px solid #5E6AD230', background: '#5E6AD212',
                  color: '#5E6AD2', fontSize: 11.5, fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                <PlayCircle size={12} /> 이어서
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteDraft(d.id); }}
                title="삭제"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 26, height: 26, borderRadius: 6,
                  border: '1px solid #E5E5EA', background: '#FFF',
                  color: '#FF3B30', cursor: 'pointer',
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: '#F5F5F7', fontSize: 11, color: '#6E6E73', textAlign: 'center' }}>
        ⬇ 아래에서 새 스토리보드를 시작할 수도 있어
      </div>
    </section>
  );
}

// 시간 포맷 — 상대시간 (방금/N분 전/N시간 전/N일 전/날짜)
function formatRelativeTime(iso) {
  try {
    const t = new Date(iso).getTime();
    const diff = Date.now() - t;
    if (diff < 60_000) return '방금';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
    if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
    return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// ---------------- 장면 카드 액션 버튼 ----------------
function SceneActionBtn({ title, onClick, disabled, icon, label, danger }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: label ? '4px 8px' : '4px 6px', borderRadius: 6,
        border: '1px solid #E5E5EA',
        background: '#FFF',
        color: danger ? '#FF3B30' : '#6E6E73',
        fontSize: 11, fontWeight: 600, lineHeight: 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        transition: 'background 0.15s',
      }}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

// ---------------- 장면 사이 추가 ----------------
function AddSceneRow({ afterSceneIndex, onAddBlank, onAddAi, busy, disabled }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      padding: '2px 0',
    }}>
      <button
        onClick={() => onAddBlank(afterSceneIndex)}
        disabled={disabled}
        title="빈 장면을 여기에 끼우기"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '4px 10px', borderRadius: 999,
          border: '1px dashed #C7C7CC', background: '#FFF',
          fontSize: 11, fontWeight: 600, color: '#6E6E73',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.35 : 1,
        }}
      >
        <Plus size={11} /> 빈 장면
      </button>
      <button
        onClick={() => onAddAi(afterSceneIndex)}
        disabled={disabled}
        title="AI가 여기에 맞는 장면을 생성"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '4px 10px', borderRadius: 999,
          border: '1px solid #5E6AD230', background: '#5E6AD212',
          fontSize: 11, fontWeight: 600, color: '#5E6AD2',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.35 : 1,
        }}
      >
        {busy
          ? <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} />
          : <Sparkles size={11} />}
        AI 장면
      </button>
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

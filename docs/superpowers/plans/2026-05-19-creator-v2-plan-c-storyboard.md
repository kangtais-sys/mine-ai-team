# Creator V2 — Plan C: 스토리보드 + 영상 생성 + 발행 UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Plan B 완료 후 실행.

**Goal:** ContentSetup → StoryboardEditor → VideoGenerator → PublishPanel 전체 UI 구축 및 통합

**Architecture:** 카드형 스토리보드, Kling 폴링, FFmpeg 합성, ElevenLabs TTS + BGM + 자막 최종 합성

**Tech Stack:** React 19, fal.ai Kling (scene-video API), ElevenLabs (voice API), BGM API, FFmpeg compose API

---

## Task 1: ContentSetup — 페르소나 선택 + 보조 이미지 + 주제 입력

**Files:**
- Modify: `src/components/creator/content/ContentSetup.jsx`

- [ ] **Step 1: ContentSetup.jsx 작성**

```jsx
import { useState, useEffect } from 'react';
import { Upload, Sparkles, X } from 'lucide-react';

const CARD = { background: '#fff', borderRadius: 14, border: '1px solid #E5E5EA', padding: '20px 22px', marginBottom: 16 };

export default function ContentSetup({ personaId, onScenesReady }) {
  const [personas, setPersonas] = useState([]);
  const [selectedId, setSelectedId] = useState(personaId || null);
  const [language, setLanguage] = useState('ko');
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [images, setImages] = useState([]);  // { type, url, file }
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const IMAGE_TYPES = [
    { id: 'outfit', label: '의상' },
    { id: 'prop', label: '소품' },
    { id: 'background', label: '배경' },
    { id: 'product', label: '제품' },
  ];

  useEffect(() => {
    fetch('/api/creator/personas')
      .then(r => r.json())
      .then(async d => {
        const ids = d.ids || [];
        const list = await Promise.all(
          ids.map(id =>
            fetch(`/api/creator/persona?personaId=${id}`)
              .then(r => r.json())
              .then(d => ({ id, name: d.persona?.name || id }))
              .catch(() => ({ id, name: id }))
          )
        );
        setPersonas(list);
        if (!selectedId && list.length === 1) setSelectedId(list[0].id);
      })
      .catch(() => {});
  }, []);

  function handleImageUpload(type, e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setImages(prev => {
        const filtered = prev.filter(img => img.type !== type);
        return [...filtered, { type, url: ev.target.result, name: file.name }];
      });
    };
    reader.readAsDataURL(file);
  }

  async function handleGenerate() {
    if (!topic.trim()) return setError('주제를 입력해주세요');
    if (!selectedId) return setError('페르소나를 선택해주세요');
    setError('');
    setGenerating(true);
    try {
      const res = await fetch('/api/creator/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          language,
          personaId: selectedId,
          notes,
          contentImages: images.map(img => ({ type: img.type, url: img.url })),
        }),
      });
      const data = await res.json();
      if (!data.scenes?.length) throw new Error(data.error || '장면 생성 실패');
      onScenesReady(data.scenes, language, data.caption, data.hashtags, selectedId);
    } catch (e) {
      setError(e.message);
    }
    setGenerating(false);
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>🎨 콘텐츠 세팅</div>

      {/* 페르소나 선택 */}
      <div style={CARD}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>페르소나 선택</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {personas.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              style={{ padding: '9px 16px', borderRadius: 9, border: `1.5px solid ${selectedId === p.id ? '#5E6AD2' : '#E5E5EA'}`, background: selectedId === p.id ? '#F0F0FF' : '#fff', fontSize: 13, fontWeight: selectedId === p.id ? 600 : 400, color: selectedId === p.id ? '#5E6AD2' : '#1D1D1F', cursor: 'pointer' }}
            >
              {p.name}
            </button>
          ))}
          {personas.length === 0 && <span style={{ fontSize: 13, color: '#AEAEB2' }}>페르소나를 먼저 만들어주세요</span>}
        </div>
      </div>

      {/* 언어 선택 */}
      <div style={CARD}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>사용 언어</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[{ id: 'ko', label: '🇰🇷 한국어' }, { id: 'en', label: '🇺🇸 English' }].map(l => (
            <button key={l.id} onClick={() => setLanguage(l.id)}
              style={{ padding: '9px 20px', borderRadius: 9, border: `1.5px solid ${language === l.id ? '#5E6AD2' : '#E5E5EA'}`, background: language === l.id ? '#F0F0FF' : '#fff', fontSize: 13, fontWeight: language === l.id ? 600 : 400, color: language === l.id ? '#5E6AD2' : '#1D1D1F', cursor: 'pointer' }}
            >{l.label}</button>
          ))}
        </div>
      </div>

      {/* 보조 이미지 업로드 */}
      <div style={CARD}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>보조 이미지 (선택)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {IMAGE_TYPES.map(({ id, label }) => {
            const img = images.find(i => i.type === id);
            return (
              <div key={id}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', marginBottom: 5 }}>{label}</div>
                <label style={{ display: 'block', width: '100%', aspectRatio: '1', borderRadius: 10, border: `1.5px dashed ${img ? '#5E6AD2' : '#C7C7CC'}`, background: img ? '#F5F5FF' : '#FAFAFA', cursor: 'pointer', overflow: 'hidden', position: 'relative' }}>
                  {img
                    ? <><img src={img.url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button onClick={e => { e.preventDefault(); setImages(prev => prev.filter(i => i.type !== id)); }} style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 10, cursor: 'pointer' }}>×</button></>
                    : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 4 }}><Upload size={16} color="#C7C7CC" /><span style={{ fontSize: 10.5, color: '#AEAEB2' }}>업로드</span></div>
                  }
                  <input type="file" accept="image/*" onChange={e => handleImageUpload(id, e)} style={{ display: 'none' }} />
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* 주제 입력 */}
      <div style={CARD}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>주제 *</div>
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="예: 500달톤 성분이 피부에 미치는 영향"
          style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: '1px solid #E5E5EA', fontSize: 13, marginBottom: 12 }}
        />
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>추가 지시 (선택)</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="예: 마지막 장면에 제품 클로즈업 넣어줘"
          style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: '1px solid #E5E5EA', fontSize: 13, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

      {error && <div style={{ color: '#FF3B30', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <button
        onClick={handleGenerate}
        disabled={generating || !topic.trim() || !selectedId}
        style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', background: generating ? '#C7C7CC' : '#5E6AD2', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <Sparkles size={16} />
        {generating ? '스토리보드 생성 중...' : '스토리보드 자동 생성'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: CreatorShell의 ContentSetup props 확장**

`CreatorShell.jsx`에서 `onScenesReady` 콜백에 caption/hashtags 추가 수신:

```jsx
// 기존
const [scenes, setScenes] = useState([]);
const [language, setLanguage] = useState('ko');

// 추가
const [caption, setCaption] = useState('');
const [hashtags, setHashtags] = useState([]);

// ContentSetup 콜백
onScenesReady={(s, lang, cap, tags, pid) => {
  setScenes(s);
  setLanguage(lang);
  setCaption(cap || '');
  setHashtags(tags || []);
  setSelectedPersonaId(pid);
  setTab('video');
}}
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/creator/content/ContentSetup.jsx src/components/creator/CreatorShell.jsx
git commit -m "feat: ContentSetup 페르소나 선택 + 보조이미지 + 주제 입력 UI"
```

---

## Task 2: StoryboardEditor + SceneCard — 카드형 스토리보드

**Files:**
- Modify: `src/components/creator/content/StoryboardEditor.jsx`
- Create: `src/components/creator/content/SceneCard.jsx`

- [ ] **Step 1: SceneCard.jsx 작성**

```jsx
import { useState } from 'react';
import { Pencil, X, Upload, ChevronUp, ChevronDown, Check } from 'lucide-react';

export default function SceneCard({ scene, index, total, onChange, onDelete, onMoveUp, onMoveDown }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...scene });

  function handleSave() {
    onChange({ ...form });
    setEditing(false);
  }

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setForm(f => ({ ...f, referenceImageUrl: ev.target.result }));
    reader.readAsDataURL(file);
  }

  const cardStyle = {
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #E5E5EA',
    overflow: 'hidden',
    marginBottom: 10,
  };

  if (!editing) return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', gap: 12, padding: '14px 16px', alignItems: 'flex-start' }}>
        {/* 썸네일 */}
        <div style={{ width: 52, height: 70, borderRadius: 8, background: 'linear-gradient(135deg,#F0F0FF,#E8E8FF)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: 20 }}>
          {scene.referenceImageUrl
            ? <img src={scene.referenceImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : '🎬'}
        </div>
        {/* 정보 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5E6AD2', marginBottom: 3 }}>
            장면 {index + 1} · {scene.startSec}s – {scene.endSec}s · {scene.cameraAngle || 'front'}
          </div>
          <div style={{ fontSize: 12.5, color: '#3C3C43', lineHeight: 1.45, marginBottom: 5, wordBreak: 'break-all' }}>
            {scene.visualPrompt}
          </div>
          <div style={{ fontSize: 12, color: '#6E6E73', fontStyle: 'italic' }}>
            💬 "{scene.dialogue}"
          </div>
        </div>
        {/* 버튼 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
          <button onClick={() => setEditing(true)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #E5E5EA', background: '#fff', cursor: 'pointer' }}><Pencil size={12} /></button>
          <button onClick={onMoveUp} disabled={index === 0} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #E5E5EA', background: '#fff', cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.4 : 1 }}><ChevronUp size={12} /></button>
          <button onClick={onMoveDown} disabled={index === total - 1} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #E5E5EA', background: '#fff', cursor: index === total - 1 ? 'not-allowed' : 'pointer', opacity: index === total - 1 ? 0.4 : 1 }}><ChevronDown size={12} /></button>
          <button onClick={onDelete} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #FFE0E0', background: '#FFF5F5', cursor: 'pointer', color: '#FF3B30' }}><X size={12} /></button>
        </div>
      </div>
    </div>
  );

  // 편집 모드
  return (
    <div style={{ ...cardStyle, border: '1.5px solid #5E6AD2' }}>
      <div style={{ padding: '14px 16px', background: '#F5F5FF' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#5E6AD2', marginBottom: 12 }}>장면 {index + 1} 편집</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', marginBottom: 4 }}>시작(초)</div>
            <input type="number" value={form.startSec} onChange={e => setForm(f => ({ ...f, startSec: +e.target.value }))} style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #E5E5EA', fontSize: 13 }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', marginBottom: 4 }}>종료(초)</div>
            <input type="number" value={form.endSec} onChange={e => setForm(f => ({ ...f, endSec: +e.target.value }))} style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #E5E5EA', fontSize: 13 }} />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', marginBottom: 4 }}>비주얼 프롬프트 (영문, Kling에 직접 전달)</div>
          <textarea value={form.visualPrompt} onChange={e => setForm(f => ({ ...f, visualPrompt: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #E5E5EA', fontSize: 12.5, minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }} placeholder="front view, walking toward camera, warm studio lighting from left..." />
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', marginBottom: 4 }}>대사</div>
          <textarea value={form.dialogue} onChange={e => setForm(f => ({ ...f, dialogue: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #E5E5EA', fontSize: 12.5, minHeight: 48, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', marginBottom: 4 }}>참고 이미지 (선택)</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5E6AD2', cursor: 'pointer' }}>
            <Upload size={13} /> 이미지 업로드
            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
          </label>
          {form.referenceImageUrl && <img src={form.referenceImageUrl} alt="" style={{ marginTop: 6, height: 48, borderRadius: 6, objectFit: 'cover' }} />}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => setEditing(false)} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid #E5E5EA', background: '#fff', fontSize: 12.5, cursor: 'pointer' }}>취소</button>
          <button onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 7, border: 'none', background: '#5E6AD2', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}><Check size={12} /> 저장</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: StoryboardEditor.jsx 작성**

```jsx
import { useState } from 'react';
import { Plus, ArrowRight } from 'lucide-react';
import SceneCard from './SceneCard';
import { randomUUID } from 'crypto'; // Vite 환경에서는 crypto.randomUUID() 사용

export default function StoryboardEditor({ scenes: initialScenes, language, caption: initCaption, hashtags: initHashtags, onConfirm }) {
  const [scenes, setScenes] = useState(initialScenes.map(s => ({ ...s, id: s.id || crypto.randomUUID() })));
  const [caption, setCaption] = useState(initCaption || '');
  const [hashtags, setHashtags] = useState((initHashtags || []).join(' '));

  function updateScene(id, updated) {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s));
  }
  function deleteScene(id) {
    setScenes(prev => prev.filter(s => s.id !== id));
  }
  function moveUp(idx) {
    if (idx === 0) return;
    setScenes(prev => { const a = [...prev]; [a[idx-1], a[idx]] = [a[idx], a[idx-1]]; return a; });
  }
  function moveDown(idx) {
    setScenes(prev => { if (idx === prev.length - 1) return prev; const a = [...prev]; [a[idx], a[idx+1]] = [a[idx+1], a[idx]]; return a; });
  }
  function addScene() {
    const last = scenes[scenes.length - 1];
    setScenes(prev => [...prev, {
      id: crypto.randomUUID(),
      order: prev.length + 1,
      startSec: last ? last.endSec : 0,
      endSec: last ? last.endSec + 5 : 5,
      visualPrompt: '',
      dialogue: '',
      cameraAngle: 'front',
      referenceImageUrl: null,
    }]);
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>📋 스토리보드 편집</div>
        <button onClick={addScene} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, border: '1px solid #E5E5EA', background: '#fff', fontSize: 12.5, cursor: 'pointer', color: '#5E6AD2', fontWeight: 600 }}>
          <Plus size={13} /> 장면 추가
        </button>
      </div>

      {scenes.map((scene, i) => (
        <SceneCard
          key={scene.id}
          scene={scene}
          index={i}
          total={scenes.length}
          onChange={updated => updateScene(scene.id, updated)}
          onDelete={() => deleteScene(scene.id)}
          onMoveUp={() => moveUp(i)}
          onMoveDown={() => moveDown(i)}
        />
      ))}

      {/* 캡션 & 해시태그 */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E5EA', padding: '16px 18px', marginTop: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#6E6E73', marginBottom: 6 }}>SNS 캡션</div>
        <textarea value={caption} onChange={e => setCaption(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #E5E5EA', fontSize: 12.5, minHeight: 60, resize: 'vertical', fontFamily: 'inherit', marginBottom: 10 }} />
        <div style={{ fontSize: 12, fontWeight: 600, color: '#6E6E73', marginBottom: 6 }}>해시태그</div>
        <input value={hashtags} onChange={e => setHashtags(e.target.value)} placeholder="#밀리밀리 #성분덕후 ..." style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #E5E5EA', fontSize: 12.5 }} />
      </div>

      <button
        onClick={() => onConfirm(scenes, caption, hashtags.split(/\s+/).filter(Boolean))}
        disabled={scenes.length === 0}
        style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', background: '#5E6AD2', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        영상 생성 시작 <ArrowRight size={16} />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: CreatorShell에서 ContentSetup → StoryboardEditor 흐름 연결**

```jsx
// CreatorShell.jsx content 탭 부분 수정
const [storyboardReady, setStoryboardReady] = useState(false);

{tab === 'content' && !storyboardReady && (
  <ContentSetup
    personaId={selectedPersonaId}
    onScenesReady={(s, lang, cap, tags, pid) => {
      setScenes(s); setLanguage(lang); setCaption(cap); setHashtags(tags);
      setSelectedPersonaId(pid); setStoryboardReady(true);
    }}
  />
)}
{tab === 'content' && storyboardReady && (
  <StoryboardEditor
    scenes={scenes}
    language={language}
    caption={caption}
    hashtags={hashtags}
    onConfirm={(finalScenes, finalCaption, finalTags) => {
      setScenes(finalScenes); setCaption(finalCaption); setHashtags(finalTags);
      setTab('video');
    }}
  />
)}
```

그리고 import 추가:
```jsx
import StoryboardEditor from './content/StoryboardEditor';
```

- [ ] **Step 4: 커밋**

```bash
git add src/components/creator/content/
git commit -m "feat: StoryboardEditor + SceneCard 카드형 스토리보드 UI"
```

---

## Task 3: VideoGenerator — 장면별 Kling 영상 생성

**Files:**
- Modify: `src/components/creator/video/VideoGenerator.jsx`

- [ ] **Step 1: VideoGenerator.jsx 작성**

```jsx
import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Check, Play, ArrowRight } from 'lucide-react';

const STATUS_LABEL = { pending: '대기', queued: '큐', processing: '생성 중', completed: '완료', failed: '실패' };
const STATUS_COLOR = { pending: '#AEAEB2', queued: '#F59E0B', processing: '#5E6AD2', completed: '#34C759', failed: '#FF3B30' };

export default function VideoGenerator({ scenes, personaId, language, caption, hashtags, onComplete }) {
  const [sceneStates, setSceneStates] = useState(
    scenes.map(s => ({ ...s, status: 'pending', requestId: null, videoUrl: null, error: null }))
  );
  const [primaryImageUrl, setPrimaryImageUrl] = useState(null);
  const [composing, setComposing] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // sceneId
  const [editPrompt, setEditPrompt] = useState('');
  const pollRef = useRef({});

  // 페르소나 대표 이미지 로드
  useEffect(() => {
    fetch(`/api/creator/persona-images?personaId=${personaId}`)
      .then(r => r.json())
      .then(d => {
        const imgs = d.images || [];
        const primary = imgs.find(i => i.isPrimary) || imgs[0];
        if (primary?.url) setPrimaryImageUrl(primary.url);
      })
      .catch(() => {});
  }, [personaId]);

  // 특정 장면 Kling 생성 시작
  async function startScene(idx) {
    const scene = sceneStates[idx];
    updateState(idx, { status: 'queued', error: null });

    try {
      const imageUrl = scene.referenceImageUrl || primaryImageUrl;
      if (!imageUrl) throw new Error('페르소나 이미지가 없습니다. 페르소나 탭에서 이미지를 먼저 생성해주세요.');

      const duration = Math.min(Math.max(scene.endSec - scene.startSec, 5), 10);
      const res = await fetch('/api/creator/scene-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaImageUrl: imageUrl,
          visualPrompt: scene.visualPrompt,
          dialogue: scene.dialogue,
          duration,
        }),
      });
      const data = await res.json();
      if (!data.requestId) throw new Error(data.error || '요청 실패');

      updateState(idx, { status: 'queued', requestId: data.requestId });
      startPolling(idx, data.requestId);
    } catch (e) {
      updateState(idx, { status: 'failed', error: e.message });
    }
  }

  function startPolling(idx, requestId) {
    const key = `scene-${idx}`;
    if (pollRef.current[key]) clearInterval(pollRef.current[key]);
    pollRef.current[key] = setInterval(async () => {
      try {
        const res = await fetch(`/api/creator/scene-video?requestId=${requestId}`);
        const data = await res.json();
        if (data.status === 'completed') {
          clearInterval(pollRef.current[key]);
          updateState(idx, { status: 'completed', videoUrl: data.videoUrl });
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current[key]);
          updateState(idx, { status: 'failed', error: data.error });
        } else {
          updateState(idx, { status: 'processing' });
        }
      } catch {}
    }, 8000);
  }

  function updateState(idx, patch) {
    setSceneStates(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  async function startAll() {
    for (let i = 0; i < sceneStates.length; i++) {
      await startScene(i);
      await new Promise(r => setTimeout(r, 2000)); // 순차 실행 (2초 간격)
    }
  }

  // 장면 재생성 (편집 프롬프트 적용)
  async function regenerateScene(idx) {
    const scene = sceneStates[idx];
    const merged = { ...scene, visualPrompt: editPrompt || scene.visualPrompt };
    setSceneStates(prev => prev.map((s, i) => i === idx ? merged : s));
    setEditTarget(null);
    setEditPrompt('');
    await startScene(idx);
  }

  const allDone = sceneStates.every(s => s.status === 'completed');
  const completedCount = sceneStates.filter(s => s.status === 'completed').length;

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>🎬 영상 생성</div>
          <div style={{ fontSize: 12.5, color: '#6E6E73', marginTop: 2 }}>{completedCount}/{sceneStates.length} 장면 완료</div>
        </div>
        <button
          onClick={startAll}
          disabled={!primaryImageUrl}
          style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: '#5E6AD2', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          전체 생성 시작
        </button>
      </div>

      {!primaryImageUrl && (
        <div style={{ padding: '12px 16px', background: '#FFF9F0', border: '1px solid #FFE0B0', borderRadius: 10, fontSize: 13, color: '#B45309', marginBottom: 16 }}>
          ⚠️ 페르소나 탭에서 이미지를 먼저 생성해주세요
        </div>
      )}

      {sceneStates.map((scene, idx) => (
        <div key={scene.id || idx} style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E5EA', padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {/* 미리보기 */}
            <div style={{ width: 64, height: 84, borderRadius: 8, background: '#F5F5F7', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {scene.videoUrl
                ? <video src={scene.videoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
                : scene.status === 'processing' || scene.status === 'queued'
                  ? <RefreshCw size={20} color="#5E6AD2" style={{ animation: 'spin 1s linear infinite' }} />
                  : <span style={{ fontSize: 22 }}>🎬</span>
              }
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1D1D1F' }}>장면 {idx + 1}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: STATUS_COLOR[scene.status], background: `${STATUS_COLOR[scene.status]}20`, padding: '2px 7px', borderRadius: 99 }}>
                  {STATUS_LABEL[scene.status]}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#6E6E73', lineHeight: 1.4, marginBottom: 4 }}>{scene.visualPrompt}</div>
              {scene.error && <div style={{ fontSize: 11.5, color: '#FF3B30' }}>{scene.error}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {scene.status === 'completed' && (
                <button onClick={() => setEditTarget(editTarget === idx ? null : idx)} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #E5E5EA', background: '#fff', fontSize: 11.5, cursor: 'pointer', color: '#5E6AD2' }}>✏️ 수정</button>
              )}
              <button
                onClick={() => startScene(idx)}
                disabled={scene.status === 'queued' || scene.status === 'processing'}
                style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: '#5E6AD2', color: '#fff', fontSize: 11.5, cursor: 'pointer', opacity: (scene.status === 'queued' || scene.status === 'processing') ? 0.5 : 1 }}
              >
                {scene.status === 'completed' ? '재생성' : '생성'}
              </button>
            </div>
          </div>

          {/* 편집 프롬프트 */}
          {editTarget === idx && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #F0F0F0' }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', marginBottom: 6 }}>수정 프롬프트 (영문, 비워두면 기존 유지)</div>
              <textarea
                value={editPrompt}
                onChange={e => setEditPrompt(e.target.value)}
                placeholder={`기존: ${scene.visualPrompt}`}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #5E6AD2', fontSize: 12.5, minHeight: 56, resize: 'vertical', fontFamily: 'inherit', marginBottom: 8 }}
              />
              <button
                onClick={() => regenerateScene(idx)}
                style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#5E6AD2', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
              >
                이 장면 재생성
              </button>
            </div>
          )}
        </div>
      ))}

      {allDone && (
        <button
          onClick={() => onComplete(sceneStates.map(s => s.videoUrl))}
          style={{ width: '100%', marginTop: 8, padding: '14px', borderRadius: 10, border: 'none', background: '#34C759', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Check size={16} /> 합성 & 발행으로 이동 <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: CreatorShell VideoGenerator props 업데이트**

```jsx
{tab === 'video' && (
  <VideoGenerator
    scenes={scenes}
    personaId={selectedPersonaId}
    language={language}
    caption={caption}
    hashtags={hashtags}
    onComplete={(videoUrls) => {
      setFinalVideoUrl(videoUrls);
      setTab('finish');
    }}
  />
)}
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/creator/video/VideoGenerator.jsx src/components/creator/CreatorShell.jsx
git commit -m "feat: VideoGenerator Kling 장면별 영상 생성 + 편집 UI"
```

---

## Task 4: PublishPanel — 합성 + 발행

**Files:**
- Modify: `src/components/creator/finish/PublishPanel.jsx`

- [ ] **Step 1: PublishPanel.jsx 작성**

```jsx
import { useState } from 'react';
import { Send, Calendar, Download } from 'lucide-react';

export default function PublishPanel({ videoUrls, caption, hashtags, personaId, language }) {
  const [composing, setComposing] = useState(false);
  const [finalUrl, setFinalUrl] = useState(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState('');

  // 음성/자막/BGM 합성 (compose API 재활용)
  async function handleCompose() {
    setComposing(true);
    setError('');
    try {
      const res = await fetch('/api/creator/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneVideoUrls: videoUrls,
          personaId,
          language,
          caption,
          hashtags,
          includeBGM: true,
        }),
      });
      const data = await res.json();
      if (data.videoUrl) setFinalUrl(data.videoUrl);
      else throw new Error(data.error || '합성 실패');
    } catch (e) { setError(e.message); }
    setComposing(false);
  }

  async function handlePublish() {
    if (!finalUrl) return;
    setPublishing(true);
    try {
      const res = await fetch('/api/creator/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: finalUrl, caption, hashtags, scheduleDate: scheduleDate || null }),
      });
      const data = await res.json();
      if (data.success) setPublished(true);
      else throw new Error(data.error);
    } catch (e) { setError(e.message); }
    setPublishing(false);
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>🚀 합성 & 발행</div>

      {/* Step 1: 합성 */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E5E5EA', padding: '20px 22px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>1단계 — 음성·자막·BGM 합성</div>
        <div style={{ fontSize: 12, color: '#6E6E73', marginBottom: 14, lineHeight: 1.5 }}>
          장면 영상들을 하나로 합치고, 페르소나 목소리·자막·배경음악을 입혀요.
        </div>
        {!finalUrl
          ? <button onClick={handleCompose} disabled={composing} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: composing ? '#C7C7CC' : '#5E6AD2', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {composing ? '합성 중... (수분 소요)' : '합성 시작'}
            </button>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <video src={finalUrl} controls style={{ width: '100%', borderRadius: 10 }} />
              <a href={finalUrl} download style={{ fontSize: 12.5, color: '#5E6AD2', display: 'flex', alignItems: 'center', gap: 4 }}><Download size={13} /> 다운로드</a>
            </div>
        }
      </div>

      {/* Step 2: 발행 */}
      {finalUrl && !published && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E5E5EA', padding: '20px 22px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>2단계 — 발행</div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', marginBottom: 5 }}>예약 발행 (비워두면 즉시 발행)</div>
            <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handlePublish} disabled={publishing}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 9, border: 'none', background: '#5E6AD2', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Send size={14} /> {scheduleDate ? '예약 발행' : '즉시 발행'}
            </button>
          </div>
        </div>
      )}

      {published && (
        <div style={{ padding: '16px 20px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, fontSize: 14, fontWeight: 600, color: '#166534' }}>
          ✅ 발행 완료! YouTube & TikTok 업로드가 시작됐어요.
        </div>
      )}

      {error && <div style={{ color: '#FF3B30', fontSize: 13, marginTop: 8 }}>{error}</div>}
    </div>
  );
}
```

- [ ] **Step 2: CreatorShell PublishPanel props 업데이트**

```jsx
{tab === 'finish' && (
  <PublishPanel
    videoUrls={finalVideoUrl}
    caption={caption}
    hashtags={hashtags}
    personaId={selectedPersonaId}
    language={language}
  />
)}
```

- [ ] **Step 3: compose.js — 다중 클립 스티칭 지원 추가**

`api/creator/compose.js` 상단에서 요청 body 파싱 부분 수정:

```js
// 기존 draftId 방식 외에 sceneVideoUrls 직접 전달 지원
const { draftId, sceneVideoUrls, personaId, language, caption, hashtags, includeBGM } = req.body || {};
```

그리고 sceneVideoUrls가 있을 때의 처리 분기 추가 (기존 draftId 방식은 유지):

```js
if (sceneVideoUrls?.length) {
  // 다중 클립 → FFmpeg concat → TTS → 자막 → BGM
  // (기존 compose 로직을 sceneVideoUrls 기반으로 실행)
}
```

- [ ] **Step 4: 전체 배포 및 E2E 검증**

```bash
git add src/components/creator/ api/creator/compose.js
git commit -m "feat: PublishPanel 합성+발행 UI 완성"
git push origin main
```

브라우저에서 `https://mine-ai-team.vercel.app/#creator` 전체 플로우 검증:
1. 페르소나 탭 → 새 페르소나 생성 → 이미지 생성 → 목소리 클로닝
2. 콘텐츠 탭 → 주제 입력 → 스토리보드 생성 → 카드 편집
3. 영상 탭 → 전체 생성 시작 → 완료 후 합성 이동
4. 발행 탭 → 합성 → 발행

---

**Plan C 완료. 전체 Creator V2 파이프라인 구현 완료.**

다음 단계: `api/creator/compose.js` 다중 클립 스티칭 로직 상세 구현 (별도 작업으로 처리).

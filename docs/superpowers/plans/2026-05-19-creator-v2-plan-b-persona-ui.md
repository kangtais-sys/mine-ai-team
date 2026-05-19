# Creator V2 — Plan B: 페르소나 UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Plan A 백엔드가 완료된 후 실행.

**Goal:** 페르소나 생성·편집·이미지생성·목소리클로닝 UI 구축

**Architecture:** `src/components/creator/persona/` 하위 4개 컴포넌트. CreatorShell이 탭으로 감싸는 구조.

**Tech Stack:** React 19, Zustand, Lucide React, 기존 스타일 패턴 (인라인 style, CARD 상수)

---

## Task 1: 디렉토리 구조 및 CreatorShell

**Files:**
- Create: `src/components/creator/CreatorShell.jsx`
- Create: `src/components/creator/persona/PersonaList.jsx` (빈 껍데기)
- Create: `src/components/creator/persona/PersonaEditor.jsx` (빈 껍데기)
- Create: `src/components/creator/persona/PersonaImageGen.jsx` (빈 껍데기)
- Create: `src/components/creator/persona/VoiceSetup.jsx` (빈 껍데기)
- Create: `src/components/creator/content/ContentSetup.jsx` (빈 껍데기)
- Create: `src/components/creator/content/StoryboardEditor.jsx` (빈 껍데기)
- Create: `src/components/creator/video/VideoGenerator.jsx` (빈 껍데기)
- Create: `src/components/creator/finish/PublishPanel.jsx` (빈 껍데기)
- Modify: `src/App.jsx` — `#creator` → `CreatorShell`

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p /Users/yuminhye/mine-ai-team/src/components/creator/{persona,content,video,finish}
```

- [ ] **Step 2: CreatorShell.jsx 작성**

```jsx
// src/components/creator/CreatorShell.jsx
import { useState } from 'react';
import PersonaList from './persona/PersonaList';
import ContentSetup from './content/ContentSetup';
import VideoGenerator from './video/VideoGenerator';
import PublishPanel from './finish/PublishPanel';

const TABS = [
  { id: 'persona', label: '👤 페르소나' },
  { id: 'content', label: '🎨 콘텐츠' },
  { id: 'video',   label: '🎬 영상 생성' },
  { id: 'finish',  label: '🚀 발행' },
];

export default function CreatorShell() {
  const [tab, setTab] = useState('persona');
  // 콘텐츠 생성 흐름에서 공유되는 상태
  const [selectedPersonaId, setSelectedPersonaId] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [language, setLanguage] = useState('ko');
  const [finalVideoUrl, setFinalVideoUrl] = useState(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F5F5F7' }}>
      {/* 탭 헤더 */}
      <div style={{ display: 'flex', gap: 2, padding: '16px 24px 0', background: '#fff', borderBottom: '1px solid #E5E5EA', flexShrink: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'transparent',
              fontSize: 13,
              fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? '#5E6AD2' : '#6E6E73',
              borderBottom: tab === t.id ? '2px solid #5E6AD2' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {tab === 'persona' && (
          <PersonaList
            selectedId={selectedPersonaId}
            onSelect={setSelectedPersonaId}
            onGoContent={() => setTab('content')}
          />
        )}
        {tab === 'content' && (
          <ContentSetup
            personaId={selectedPersonaId}
            onScenesReady={(s, lang) => { setScenes(s); setLanguage(lang); setTab('video'); }}
          />
        )}
        {tab === 'video' && (
          <VideoGenerator
            scenes={scenes}
            personaId={selectedPersonaId}
            language={language}
            onComplete={(url) => { setFinalVideoUrl(url); setTab('finish'); }}
          />
        )}
        {tab === 'finish' && (
          <PublishPanel videoUrl={finalVideoUrl} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 빈 껍데기 컴포넌트 생성**

```bash
# PersonaList
cat > /Users/yuminhye/mine-ai-team/src/components/creator/persona/PersonaList.jsx << 'EOF'
export default function PersonaList({ selectedId, onSelect, onGoContent }) {
  return <div style={{padding:24}}>PersonaList — 구현 예정</div>;
}
EOF

# PersonaEditor
cat > /Users/yuminhye/mine-ai-team/src/components/creator/persona/PersonaEditor.jsx << 'EOF'
export default function PersonaEditor({ personaId, onSave, onCancel }) {
  return <div style={{padding:24}}>PersonaEditor — 구현 예정</div>;
}
EOF

# PersonaImageGen
cat > /Users/yuminhye/mine-ai-team/src/components/creator/persona/PersonaImageGen.jsx << 'EOF'
export default function PersonaImageGen({ personaId, onDone }) {
  return <div style={{padding:24}}>PersonaImageGen — 구현 예정</div>;
}
EOF

# VoiceSetup
cat > /Users/yuminhye/mine-ai-team/src/components/creator/persona/VoiceSetup.jsx << 'EOF'
export default function VoiceSetup({ personaId, onDone }) {
  return <div style={{padding:24}}>VoiceSetup — 구현 예정</div>;
}
EOF

# ContentSetup
cat > /Users/yuminhye/mine-ai-team/src/components/creator/content/ContentSetup.jsx << 'EOF'
export default function ContentSetup({ personaId, onScenesReady }) {
  return <div style={{padding:24}}>ContentSetup — 구현 예정</div>;
}
EOF

# StoryboardEditor
cat > /Users/yuminhye/mine-ai-team/src/components/creator/content/StoryboardEditor.jsx << 'EOF'
export default function StoryboardEditor({ scenes, onChange }) {
  return <div style={{padding:24}}>StoryboardEditor — 구현 예정</div>;
}
EOF

# VideoGenerator
cat > /Users/yuminhye/mine-ai-team/src/components/creator/video/VideoGenerator.jsx << 'EOF'
export default function VideoGenerator({ scenes, personaId, language, onComplete }) {
  return <div style={{padding:24}}>VideoGenerator — 구현 예정</div>;
}
EOF

# PublishPanel
cat > /Users/yuminhye/mine-ai-team/src/components/creator/finish/PublishPanel.jsx << 'EOF'
export default function PublishPanel({ videoUrl }) {
  return <div style={{padding:24}}>PublishPanel — 구현 예정</div>;
}
EOF
```

- [ ] **Step 4: App.jsx에서 CreatorShell로 연결**

`src/App.jsx`에서:

```jsx
// 기존 import
import CreatorView from './components/CreatorView';
// 추가
import CreatorShell from './components/creator/CreatorShell';
```

그리고 렌더 부분:
```jsx
// 기존
{page === 'creator' && <ErrorBoundary><CreatorView /></ErrorBoundary>}
// 변경
{page === 'creator' && <ErrorBoundary><CreatorShell /></ErrorBoundary>}
```

- [ ] **Step 5: 브라우저 확인**

```bash
# 로컬 개발 서버 실행 (이미 실행 중이 아닌 경우)
npm run dev
```

`http://localhost:5173/#creator` 열어서 4개 탭이 보이는지 확인

- [ ] **Step 6: 커밋**

```bash
git add src/components/creator/ src/App.jsx
git commit -m "feat: CreatorShell 기본 구조 + 빈 컴포넌트 생성"
```

---

## Task 2: PersonaList — 페르소나 목록

**Files:**
- Modify: `src/components/creator/persona/PersonaList.jsx`

- [ ] **Step 1: PersonaList.jsx 전체 작성**

```jsx
import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, ArrowRight, User } from 'lucide-react';
import PersonaEditor from './PersonaEditor';
import PersonaImageGen from './PersonaImageGen';
import VoiceSetup from './VoiceSetup';

const CARD = {
  background: '#fff',
  borderRadius: 14,
  border: '1px solid #E5E5EA',
  padding: '20px 22px',
  marginBottom: 16,
};

export default function PersonaList({ selectedId, onSelect, onGoContent }) {
  const [ids, setIds] = useState([]);
  const [personas, setPersonas] = useState({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);   // null=목록, 'new'=신규, uuid=편집
  const [imageGenId, setImageGenId] = useState(null);
  const [voiceId, setVoiceId] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/creator/personas');
      const data = await res.json();
      const idList = data.ids || [];
      setIds(idList);
      // 각 페르소나 데이터 로드
      const entries = await Promise.all(
        idList.map(id =>
          fetch(`/api/creator/persona?personaId=${id}`)
            .then(r => r.json())
            .then(d => [id, d.persona])
            .catch(() => [id, null])
        )
      );
      setPersonas(Object.fromEntries(entries));
    } catch {}
    setLoading(false);
  }

  async function handleNew() {
    if (ids.length >= 3) return alert('페르소나는 최대 3명까지 생성 가능합니다.');
    // 새 ID 발급
    const res = await fetch('/api/creator/personas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json();
    if (data.id) { setIds(data.ids); setEditingId(data.id); }
  }

  async function handleDelete(id) {
    if (!confirm('이 페르소나를 삭제할까요?')) return;
    await fetch(`/api/creator/personas?id=${id}`, { method: 'DELETE' });
    if (selectedId === id) onSelect(null);
    load();
  }

  if (imageGenId) return <PersonaImageGen personaId={imageGenId} onDone={() => { setImageGenId(null); load(); }} />;
  if (voiceId)    return <VoiceSetup personaId={voiceId} onDone={() => { setVoiceId(null); load(); }} />;
  if (editingId)  return <PersonaEditor personaId={editingId} onSave={() => { setEditingId(null); load(); }} onCancel={() => setEditingId(null)} />;

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1D1D1F' }}>페르소나</div>
          <div style={{ fontSize: 12.5, color: '#6E6E73', marginTop: 2 }}>최대 3명 · 각자 고유한 얼굴·목소리·스타일</div>
        </div>
        <button
          onClick={handleNew}
          disabled={ids.length >= 3}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 9, border: 'none', background: ids.length >= 3 ? '#E5E5EA' : '#5E6AD2', color: ids.length >= 3 ? '#AEAEB2' : '#fff', fontSize: 13, fontWeight: 600, cursor: ids.length >= 3 ? 'not-allowed' : 'pointer' }}
        >
          <Plus size={15} /> 새 페르소나
        </button>
      </div>

      {loading && <div style={{ color: '#AEAEB2', fontSize: 13 }}>불러오는 중...</div>}

      {!loading && ids.length === 0 && (
        <div style={{ ...CARD, textAlign: 'center', padding: '40px 24px', color: '#AEAEB2' }}>
          <User size={32} style={{ margin: '0 auto 12px', display: 'block' }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>아직 페르소나가 없어요</div>
          <div style={{ fontSize: 12.5, marginTop: 4 }}>새 페르소나 버튼을 눌러 시작하세요</div>
        </div>
      )}

      {ids.map(id => {
        const p = personas[id];
        const isSelected = selectedId === id;
        return (
          <div
            key={id}
            onClick={() => onSelect(id)}
            style={{ ...CARD, border: `1px solid ${isSelected ? '#5E6AD2' : '#E5E5EA'}`, cursor: 'pointer', transition: 'border-color 0.15s', background: isSelected ? '#F5F5FF' : '#fff' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#5E6AD2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, color: '#fff', fontWeight: 700 }}>
                {p?.name?.[0] || '?'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1D1D1F' }}>{p?.name || '이름 미설정'}</div>
                <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 2 }}>{p?.gender || ''} {p?.age || ''} · {p?.occupation || ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={e => { e.stopPropagation(); setImageGenId(id); }} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #E5E5EA', background: '#fff', fontSize: 11.5, cursor: 'pointer', color: '#3C3C43' }}>🧬 이미지</button>
                <button onClick={e => { e.stopPropagation(); setVoiceId(id); }} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #E5E5EA', background: '#fff', fontSize: 11.5, cursor: 'pointer', color: '#3C3C43' }}>🎙 목소리</button>
                <button onClick={e => { e.stopPropagation(); setEditingId(id); }} style={{ padding: '7px 8px', borderRadius: 7, border: '1px solid #E5E5EA', background: '#fff', cursor: 'pointer' }}><Pencil size={13} /></button>
                <button onClick={e => { e.stopPropagation(); handleDelete(id); }} style={{ padding: '7px 8px', borderRadius: 7, border: '1px solid #FFE0E0', background: '#FFF5F5', cursor: 'pointer', color: '#FF3B30' }}><Trash2 size={13} /></button>
              </div>
            </div>
            {isSelected && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #E5E5EA', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={e => { e.stopPropagation(); onGoContent(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#5E6AD2', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  이 페르소나로 콘텐츠 만들기 <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/creator/persona/PersonaList.jsx
git commit -m "feat: PersonaList 페르소나 목록 UI"
```

---

## Task 3: PersonaEditor — 텍스트 정보 편집 폼

**Files:**
- Modify: `src/components/creator/persona/PersonaEditor.jsx`

- [ ] **Step 1: PersonaEditor.jsx 작성**

```jsx
import { useState, useEffect } from 'react';
import { Save, X, ChevronLeft } from 'lucide-react';

const CARD = { background: '#fff', borderRadius: 14, border: '1px solid #E5E5EA', padding: '20px 22px', marginBottom: 16 };
const Label = ({ children }) => <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.3 }}>{children}</div>;
const Input = ({ value, onChange, placeholder, multiline }) => {
  const style = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13, color: '#1D1D1F', outline: 'none', fontFamily: 'inherit', resize: multiline ? 'vertical' : 'none' };
  return multiline
    ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...style, minHeight: 72 }} />
    : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={style} />;
};

const DEFAULT = { name: '', gender: '여성', age: '', occupation: '', characteristics: '', personality: '', catchphrases: '' };

export default function PersonaEditor({ personaId, onSave, onCancel }) {
  const [form, setForm] = useState(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/creator/persona?personaId=${personaId}`)
      .then(r => r.json())
      .then(d => {
        const p = d.persona || {};
        setForm({
          name: p.name || '',
          gender: p.gender || '여성',
          age: p.age || '',
          occupation: p.occupation || '',
          characteristics: p.characteristics || p.background || '',
          personality: Array.isArray(p.personality) ? p.personality.join(', ') : (p.personality || ''),
          catchphrases: Array.isArray(p.catchphrases) ? p.catchphrases.join('\n') : (p.catchphrases || ''),
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [personaId]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  async function handleSave() {
    if (!form.name) return alert('이름을 입력하세요');
    setSaving(true);
    try {
      await fetch('/api/creator/persona', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId,
          ...form,
          personality: form.personality.split(',').map(s => s.trim()).filter(Boolean),
          catchphrases: form.catchphrases.split('\n').filter(Boolean),
        }),
      });
      onSave();
    } catch (e) { alert(e.message); }
    setSaving(false);
  }

  if (loading) return <div style={{ padding: 24, color: '#AEAEB2', fontSize: 13 }}>불러오는 중...</div>;

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7, border: '1px solid #E5E5EA', background: '#fff', fontSize: 12.5, cursor: 'pointer', color: '#6E6E73' }}>
          <ChevronLeft size={14} /> 목록
        </button>
        <div style={{ fontSize: 16, fontWeight: 700 }}>페르소나 편집</div>
      </div>

      <div style={CARD}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div><Label>이름 *</Label><Input value={form.name} onChange={v => set('name', v)} placeholder="밀리 (Milli)" /></div>
          <div><Label>성별</Label>
            <select value={form.gender} onChange={e => set('gender', e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13 }}>
              <option>여성</option><option>남성</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div><Label>나이</Label><Input value={form.age} onChange={v => set('age', v)} placeholder="29세" /></div>
          <div><Label>직업/역할</Label><Input value={form.occupation} onChange={v => set('occupation', v)} placeholder="화장품 연구원" /></div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <Label>특징 / 배경 스토리</Label>
          <Input value={form.characteristics} onChange={v => set('characteristics', v)} placeholder="약학과 출신, 성분 덕후..." multiline />
        </div>
        <div style={{ marginBottom: 14 }}>
          <Label>성격 키워드 (쉼표 구분)</Label>
          <Input value={form.personality} onChange={v => set('personality', v)} placeholder="호기심 왕성, 팩트충, 따뜻한 언니" />
        </div>
        <div>
          <Label>캐치프레이즈 (줄바꿈 구분)</Label>
          <Input value={form.catchphrases} onChange={v => set('catchphrases', v)} placeholder={"이거 진짜 아무도 안 알려줘요\n500달톤이 뭔지 아세요?"} multiline />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '10px 18px', borderRadius: 9, border: '1px solid #E5E5EA', background: '#fff', fontSize: 13, cursor: 'pointer' }}>취소</button>
        <button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 9, border: 'none', background: '#5E6AD2', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Save size={14} /> {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/creator/persona/PersonaEditor.jsx
git commit -m "feat: PersonaEditor 텍스트 정보 편집 폼"
```

---

## Task 4: PersonaImageGen — 얼굴 사진 업로드 + 각도별 이미지 생성

**Files:**
- Modify: `src/components/creator/persona/PersonaImageGen.jsx`

- [ ] **Step 1: PersonaImageGen.jsx 작성**

```jsx
import { useState } from 'react';
import { Upload, RefreshCw, Check, ChevronLeft } from 'lucide-react';

const ANGLES = [
  { id: 'front',         label: '정면' },
  { id: 'three-quarter', label: '3/4 측면' },
  { id: 'closeup',       label: '클로즈업' },
  { id: 'fullbody',      label: '전신' },
  { id: 'side',          label: '측면' },
];

export default function PersonaImageGen({ personaId, onDone }) {
  const [refImages, setRefImages] = useState([]);  // base64 배열
  const [extraPrompt, setExtraPrompt] = useState('');
  const [generated, setGenerated] = useState({});  // { angle: imageUrl }
  const [generating, setGenerating] = useState({});
  const [persona, setPersona] = useState(null);

  // 페르소나 설명 로드
  useState(() => {
    fetch(`/api/creator/persona?personaId=${personaId}`)
      .then(r => r.json())
      .then(d => setPersona(d.persona))
      .catch(() => {});
  }, []);

  function handleFileChange(e) {
    const files = Array.from(e.target.files).slice(0, 3);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setRefImages(prev => [...prev, ev.target.result].slice(0, 3));
      reader.readAsDataURL(file);
    });
  }

  async function generateAngle(angle) {
    if (!refImages.length) return alert('얼굴 사진을 먼저 업로드해주세요');
    setGenerating(g => ({ ...g, [angle]: true }));
    try {
      const personaDesc = persona
        ? `${persona.gender || ''} ${persona.age || ''}, ${persona.occupation || ''}, ${persona.characteristics || ''}`
        : '';
      const res = await fetch('/api/creator/persona-imagegen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId, angle, extraPrompt, personaDesc }),
      });
      const data = await res.json();
      if (data.imageUrl) {
        setGenerated(g => ({ ...g, [angle]: data.imageUrl }));
        // Blob에 저장
        await fetch('/api/creator/persona-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personaId, imageUrl: data.imageUrl, label: angle, via: 'flux' }),
        }).catch(() => {});
      } else {
        alert(`생성 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (e) { alert(e.message); }
    setGenerating(g => ({ ...g, [angle]: false }));
  }

  async function generateAll() {
    for (const a of ANGLES) await generateAngle(a.id);
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={onDone} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7, border: '1px solid #E5E5EA', background: '#fff', fontSize: 12.5, cursor: 'pointer', color: '#6E6E73' }}>
          <ChevronLeft size={14} /> 목록
        </button>
        <div style={{ fontSize: 16, fontWeight: 700 }}>🧬 페르소나 이미지 생성</div>
      </div>

      {/* 레퍼런스 이미지 업로드 */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E5E5EA', padding: '20px 22px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>얼굴 레퍼런스 사진 업로드 (최대 3장)</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 9, border: '1.5px dashed #C7C7CC', cursor: 'pointer', fontSize: 13, color: '#5E6AD2', width: 'fit-content' }}>
          <Upload size={15} /> 사진 선택
          <input type="file" accept="image/*" multiple onChange={handleFileChange} style={{ display: 'none' }} />
        </label>
        {refImages.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            {refImages.map((src, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={src} alt="" style={{ width: 72, height: 72, borderRadius: 8, objectFit: 'cover', border: '1px solid #E5E5EA' }} />
                <button onClick={() => setRefImages(r => r.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: '#FF3B30', color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', marginBottom: 5 }}>추가 프롬프트 (선택)</div>
          <input value={extraPrompt} onChange={e => setExtraPrompt(e.target.value)} placeholder="예: 연구실 배경, 흰 가운" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13 }} />
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <button
            onClick={generateAll}
            disabled={!refImages.length || Object.values(generating).some(Boolean)}
            style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: '#5E6AD2', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            {Object.values(generating).some(Boolean) ? '생성 중...' : '🪄 전각도 생성'}
          </button>
        </div>
      </div>

      {/* 각도별 결과 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {ANGLES.map(({ id, label }) => (
          <div key={id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E5EA', overflow: 'hidden' }}>
            {generated[id]
              ? <img src={generated[id]} alt={label} style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover' }} />
              : <div style={{ width: '100%', aspectRatio: '3/4', background: '#F5F5F7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                  {generating[id] ? <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', color: '#5E6AD2' }} /> : '🧬'}
                </div>
            }
            <div style={{ padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, fontWeight: 600 }}>{label}</span>
              {generated[id]
                ? <button onClick={() => generateAngle(id)} style={{ fontSize: 10.5, padding: '3px 7px', borderRadius: 5, border: '1px solid #E5E5EA', background: '#fff', cursor: 'pointer', color: '#6E6E73' }}>재생성</button>
                : <button onClick={() => generateAngle(id)} disabled={!refImages.length || generating[id]} style={{ fontSize: 10.5, padding: '3px 7px', borderRadius: 5, border: 'none', background: '#5E6AD2', color: '#fff', cursor: 'pointer' }}>생성</button>
              }
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onDone} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 9, border: 'none', background: '#34C759', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Check size={14} /> 완료
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/creator/persona/PersonaImageGen.jsx
git commit -m "feat: PersonaImageGen 얼굴사진→각도별 이미지 생성 UI"
```

---

## Task 5: VoiceSetup — ElevenLabs IVC 목소리 클로닝

**Files:**
- Modify: `src/components/creator/persona/VoiceSetup.jsx`

- [ ] **Step 1: VoiceSetup.jsx 작성**

```jsx
import { useState, useRef } from 'react';
import { Upload, Mic, Check, ChevronLeft, Play } from 'lucide-react';

export default function VoiceSetup({ personaId, onDone }) {
  const [audioFile, setAudioFile] = useState(null);
  const [audioPreview, setAudioPreview] = useState(null);
  const [cloning, setCloning] = useState(false);
  const [cloned, setCloned] = useState(null);
  const [existingVoice, setExistingVoice] = useState(null);
  const fileRef = useRef();

  // 기존 voice_id 확인
  useState(() => {
    fetch(`/api/creator/voice-clone?personaId=${personaId}`)
      .then(r => r.json())
      .then(d => { if (d.voiceId) setExistingVoice(d); })
      .catch(() => {});
  }, []);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setAudioFile(file);
    setAudioPreview(URL.createObjectURL(file));
  }

  async function handleClone() {
    if (!audioFile) return alert('음성 샘플을 먼저 업로드해주세요 (1~2분 한국어 음성)');
    setCloning(true);
    try {
      // File → base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(audioFile);
      });
      const res = await fetch('/api/creator/voice-clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId, audioBase64: base64, mimeType: audioFile.type, name: `페르소나-${personaId.substring(0, 6)}` }),
      });
      const data = await res.json();
      if (data.voiceId) setCloned(data);
      else alert(`클로닝 실패: ${data.error}`);
    } catch (e) { alert(e.message); }
    setCloning(false);
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={onDone} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7, border: '1px solid #E5E5EA', background: '#fff', fontSize: 12.5, cursor: 'pointer', color: '#6E6E73' }}>
          <ChevronLeft size={14} /> 목록
        </button>
        <div style={{ fontSize: 16, fontWeight: 700 }}>🎙 목소리 클로닝</div>
      </div>

      {existingVoice && !cloned && (
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: '14px 16px', marginBottom: 16, fontSize: 13 }}>
          <span style={{ color: '#166534', fontWeight: 600 }}>✅ 저장된 목소리 있음</span>
          <span style={{ color: '#15803D', marginLeft: 8 }}>{existingVoice.name}</span>
          <span style={{ color: '#6E6E73', marginLeft: 8, fontSize: 12 }}>재업로드하면 덮어쓰기됩니다</span>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E5E5EA', padding: '20px 22px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>한국어 음성 샘플 업로드</div>
        <div style={{ fontSize: 12, color: '#6E6E73', marginBottom: 14, lineHeight: 1.5 }}>
          1~2분 분량의 한국어 음성 파일을 올려주세요.<br/>
          배경 잡음 없이 명확하게 말한 녹음일수록 결과가 좋아요.<br/>
          지원 형식: MP3, WAV, M4A
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 9, border: '1.5px dashed #C7C7CC', cursor: 'pointer', fontSize: 13, color: '#5E6AD2', width: 'fit-content', marginBottom: 14 }}>
          <Upload size={15} /> 음성 파일 선택
          <input ref={fileRef} type="file" accept="audio/*" onChange={handleFile} style={{ display: 'none' }} />
        </label>

        {audioPreview && (
          <div style={{ marginBottom: 16 }}>
            <audio controls src={audioPreview} style={{ width: '100%', height: 40 }} />
          </div>
        )}

        <button
          onClick={handleClone}
          disabled={cloning || !audioFile}
          style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: cloning ? '#C7C7CC' : '#5E6AD2', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          {cloning ? '클로닝 중...' : '🎙 목소리 클로닝 시작'}
        </button>
      </div>

      {(cloned || existingVoice) && (
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onDone} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 9, border: 'none', background: '#34C759', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Check size={14} /> 완료
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 배포 및 전체 검증**

```bash
git add src/components/creator/persona/VoiceSetup.jsx
git commit -m "feat: VoiceSetup ElevenLabs IVC 목소리 클로닝 UI"
git push origin main
```

브라우저에서 `https://mine-ai-team.vercel.app/#creator` → 페르소나 탭 → 새 페르소나 → 편집 → 이미지 생성 → 목소리 클로닝 전체 플로우 확인

---

**Plan B 완료.** 다음: Plan C (스토리보드 UI) 실행.

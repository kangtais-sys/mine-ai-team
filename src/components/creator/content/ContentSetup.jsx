// ContentSetup.jsx — 콘텐츠 설정 + 스토리보드 생성
import { useState } from 'react';
import { Sparkles, Loader2, Globe, Film, Layers } from 'lucide-react';
import StoryboardEditor from './StoryboardEditor';

const PILLARS = [
  { key: 'ingredient', label: '🧪 성분정보' },
  { key: 'treatment',  label: '💉 시술정보' },
  { key: 'behind',     label: '🔬 개발 비하인드' },
  { key: 'collab',     label: '👨‍⚕️ 전문가 콜라보' },
  { key: 'trend',      label: '✨ 뷰티 트렌드' },
];

const FORMATS = [
  { key: 'storyboard', label: '스토리보드 영상', icon: Film, desc: 'Kling AI 장면별 영상 생성' },
  { key: 'reel',       label: 'Reels',           icon: Film, desc: '인스타 세로 영상 (15-30초)' },
  { key: 'shorts',     label: 'Shorts',           icon: Film, desc: '유튜브/틱톡 숏츠' },
  { key: 'cardnews',   label: '카드뉴스',          icon: Layers, desc: '인스타 슬라이드' },
];

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok',    label: 'TikTok' },
  { key: 'youtube',   label: 'YouTube' },
];

export default function ContentSetup({ personaId, persona, onDraftCreated }) {
  const [topic, setTopic] = useState('');
  const [pillar, setPillar] = useState('ingredient');
  const [format, setFormat] = useState('storyboard');
  const [language, setLanguage] = useState('ko');
  const [platforms, setPlatforms] = useState(['instagram', 'tiktok']);
  const [notes, setNotes] = useState('');

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // 생성된 드래프트 (스토리보드 포함) — 로컬 미리보기용
  const [draft, setDraft] = useState(null);

  const togglePlatform = (key) => {
    setPlatforms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
  };

  const handleGenerate = async () => {
    if (!topic.trim()) { setError('콘텐츠 주제를 입력해주세요'); return; }
    setGenerating(true);
    setError('');
    try {
      const r = await fetch('/api/creator/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, pillar, format, language, platforms, notes, personaId }),
      });
      const d = await r.json();
      if (d.draft) {
        setDraft(d.draft);
        // 스토리보드 포맷이면 자동으로 영상생성 탭으로 이동 (shell에서 처리)
        onDraftCreated?.(d.draft);
      } else {
        setError(d.error || '생성 실패');
      }
    } catch (e) {
      setError(e.message);
    }
    setGenerating(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* 좌측 — 설정 패널 */}
      <div style={{ width: 340, minWidth: 340, borderRight: '1px solid #E5E5EA', overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>

        {!personaId && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: '#FFF8E6', border: '1px solid #FF950030', fontSize: 12.5, color: '#FF9500' }}>
            ⚠️ 페르소나를 먼저 선택하세요
          </div>
        )}

        {/* 주제 입력 */}
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            콘텐츠 주제 *
          </label>
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="예: 레티놀 성분이 처음인 분들을 위한 입문 가이드&#10;나이아신아마이드 vs 비타민C 비교"
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13, lineHeight: 1.55, resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
          />
        </div>

        {/* 콘텐츠 기둥 */}
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            콘텐츠 기둥
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PILLARS.map(p => (
              <button key={p.key} onClick={() => setPillar(p.key)} style={{
                padding: '6px 12px', borderRadius: 16,
                border: `1.5px solid ${pillar === p.key ? '#5E6AD2' : '#E5E5EA'}`,
                background: pillar === p.key ? '#5E6AD212' : '#FFF',
                fontSize: 12.5, fontWeight: pillar === p.key ? 600 : 400,
                color: pillar === p.key ? '#5E6AD2' : '#6E6E73',
                cursor: 'pointer',
              }}>{p.label}</button>
            ))}
          </div>
        </div>

        {/* 포맷 */}
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            포맷
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {FORMATS.map(f => (
              <button key={f.key} onClick={() => setFormat(f.key)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8,
                border: `1.5px solid ${format === f.key ? '#5E6AD2' : '#E5E5EA'}`,
                background: format === f.key ? '#5E6AD212' : '#FFF',
                cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: format === f.key ? '#5E6AD2' : '#D0D0D8', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: format === f.key ? 600 : 400, color: format === f.key ? '#5E6AD2' : '#1D1D1F' }}>
                    {f.label}
                    {f.key === 'storyboard' && <span style={{ fontSize: 10.5, background: '#5E6AD2', color: '#FFF', borderRadius: 4, padding: '1px 5px', marginLeft: 6, fontWeight: 600 }}>NEW</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#AEAEB2', marginTop: 1 }}>{f.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 언어 */}
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

        {/* 플랫폼 */}
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            발행 플랫폼
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            {PLATFORMS.map(p => (
              <button key={p.key} onClick={() => togglePlatform(p.key)} style={{
                flex: 1, padding: '7px 8px', borderRadius: 8,
                border: `1.5px solid ${platforms.includes(p.key) ? '#5E6AD2' : '#E5E5EA'}`,
                background: platforms.includes(p.key) ? '#5E6AD212' : '#FFF',
                fontSize: 12, fontWeight: platforms.includes(p.key) ? 600 : 400,
                color: platforms.includes(p.key) ? '#5E6AD2' : '#6E6E73',
                cursor: 'pointer',
              }}>{p.label}</button>
            ))}
          </div>
        </div>

        {/* 추가 메모 */}
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            추가 메모 (선택)
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="특별히 강조할 것, 피해야 할 것, 참고 링크 등..."
            rows={2}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13, lineHeight: 1.55, resize: 'none', fontFamily: 'inherit', outline: 'none' }}
          />
        </div>

        {error && (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FFF5F5', color: '#FF3B30', fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={generating || !topic.trim()}
          style={{
            width: '100%', padding: '13px 20px', borderRadius: 10, border: 'none',
            background: '#5E6AD2', color: '#FFF', fontSize: 14, fontWeight: 700,
            cursor: generating || !topic.trim() ? 'not-allowed' : 'pointer',
            opacity: !topic.trim() ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {generating ? (
            <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> AI 생성 중...</>
          ) : (
            <><Sparkles size={16} /> {format === 'storyboard' ? '스토리보드 생성' : '콘텐츠 생성'}</>
          )}
        </button>
      </div>

      {/* 우측 — 스토리보드 미리보기 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {draft && format === 'storyboard' ? (
          <StoryboardEditor
            draft={draft}
            personaId={personaId}
            onDraftUpdate={setDraft}
          />
        ) : draft ? (
          <LegacyDraftPreview draft={draft} />
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#AEAEB2', gap: 12 }}>
            <Sparkles size={40} strokeWidth={1.5} />
            <div style={{ fontSize: 14, fontWeight: 500 }}>왼쪽에서 설정하고 생성하면 여기에 미리보기가 나타납니다</div>
            {format === 'storyboard' && (
              <div style={{ fontSize: 12.5, color: '#AEAEB2', textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
                스토리보드 포맷: AI가 장면을 나눠서 카메라 각도·대사·조명까지 설계해드립니다
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// 스토리보드 외 포맷의 간단한 미리보기
function LegacyDraftPreview({ draft }) {
  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1D1D1F', marginBottom: 16 }}>생성된 콘텐츠</div>
      {draft.hook && (
        <div style={{ background: '#FFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '16px 18px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', marginBottom: 6 }}>🎣 후킹</div>
          <div style={{ fontSize: 13, color: '#1D1D1F', lineHeight: 1.6 }}>{draft.hook}</div>
        </div>
      )}
      {draft.script && (
        <div style={{ background: '#FFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '16px 18px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', marginBottom: 6 }}>📝 스크립트</div>
          <pre style={{ fontSize: 13, color: '#1D1D1F', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{draft.script}</pre>
        </div>
      )}
      {draft.caption && (
        <div style={{ background: '#FFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '16px 18px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', marginBottom: 6 }}>📸 캡션</div>
          <div style={{ fontSize: 13, color: '#1D1D1F', lineHeight: 1.6 }}>{draft.caption}</div>
        </div>
      )}
      {draft.hashtags && (
        <div style={{ background: '#F5F5F7', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: '#5E6AD2' }}>
          {draft.hashtags}
        </div>
      )}
    </div>
  );
}

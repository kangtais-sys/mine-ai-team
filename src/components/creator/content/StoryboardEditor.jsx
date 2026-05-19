// StoryboardEditor.jsx — 스토리보드 장면 편집기
import { useState } from 'react';
import { Film, RefreshCw, ChevronRight } from 'lucide-react';
import SceneCard from './SceneCard';

export default function StoryboardEditor({ draft, personaId, onDraftUpdate }) {
  const [regenIndex, setRegenIndex] = useState(null);

  const scenes = draft?.scenes || [];

  const handleRegenerateScene = async (sceneIndex) => {
    setRegenIndex(sceneIndex);
    try {
      const scene = scenes[sceneIndex];
      // 해당 장면만 재생성 요청 (generate API에 scene-level regen은 없으므로 노트 기반으로 재생성)
      const r = await fetch('/api/creator/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: `${draft.topic || ''} - 장면 ${scene.order} 재생성: ${scene.dialogue}`,
          format: 'storyboard',
          language: draft.language || 'ko',
          platforms: draft.platforms || ['instagram'],
          personaId,
          notes: `이전 장면 비주얼: ${scene.visualPrompt}. 이 장면만 더 좋게 다시 만들어줘.`,
        }),
      });
      const d = await r.json();
      if (d.draft?.scenes?.length > 0) {
        // 해당 인덱스의 장면만 교체
        const newScene = d.draft.scenes[0];
        const updatedScenes = scenes.map((s, i) => i === sceneIndex ? { ...newScene, order: scene.order } : s);
        onDraftUpdate?.({ ...draft, scenes: updatedScenes });
      }
    } catch {}
    setRegenIndex(null);
  };

  const handleUpdateScene = (index, updatedScene) => {
    const updatedScenes = scenes.map((s, i) => i === index ? updatedScene : s);
    onDraftUpdate?.({ ...draft, scenes: updatedScenes });
  };

  if (!scenes.length) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#AEAEB2' }}>
        <Film size={32} strokeWidth={1.5} style={{ marginBottom: 12 }} />
        <div>장면 데이터가 없습니다</div>
      </div>
    );
  }

  const totalSec = scenes.length > 0 ? Math.max(...scenes.map(s => s.endSec || 0)) : 0;

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1D1D1F' }}>
            {draft.title || '스토리보드'}
          </div>
          <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 2 }}>
            {scenes.length}개 장면 · 총 {totalSec}초 · {draft.language === 'ko' ? '한국어' : 'English'}
          </div>
        </div>
      </div>

      {/* 장면 카드 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {scenes.map((scene, i) => (
          <SceneCard
            key={i}
            scene={scene}
            index={i}
            isRegenerating={regenIndex === i}
            onRegenerate={() => handleRegenerateScene(i)}
            onUpdate={(updated) => handleUpdateScene(i, updated)}
          />
        ))}
      </div>

      {/* 캡션/해시태그 */}
      {(draft.caption || draft.hashtags) && (
        <div style={{ marginTop: 20, background: '#FFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>캡션 & 해시태그</div>
          {draft.caption && <div style={{ fontSize: 13, color: '#1D1D1F', lineHeight: 1.6, marginBottom: 8 }}>{draft.caption}</div>}
          {draft.hashtags && <div style={{ fontSize: 12.5, color: '#5E6AD2', lineHeight: 1.6 }}>{draft.hashtags}</div>}
        </div>
      )}
    </div>
  );
}

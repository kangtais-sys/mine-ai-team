// SceneCard.jsx — 스토리보드 개별 장면 카드
import { useState } from 'react';
import { RefreshCw, Edit3, Check, X, Loader2, Camera, MessageSquare, Zap } from 'lucide-react';

const CAMERA_ANGLES = [
  { key: 'front',         label: '정면' },
  { key: 'three-quarter', label: '3/4측면' },
  { key: 'closeup',       label: '클로즈업' },
  { key: 'fullbody',      label: '전신' },
  { key: 'side',          label: '측면' },
];

const ANGLE_ICON = { front: '👁', 'three-quarter': '↗', closeup: '🔍', fullbody: '🧍', side: '👤' };

export default function SceneCard({ scene, index, isRegenerating, onRegenerate, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState({});

  const startEdit = () => {
    setEditValues({
      cameraAngle: scene.cameraAngle || 'front',
      dialogue: scene.dialogue || '',
      visualPrompt: scene.visualPrompt || '',
      startSec: scene.startSec ?? 0,
      endSec: scene.endSec ?? 5,
    });
    setEditing(true);
  };

  const saveEdit = () => {
    onUpdate?.({ ...scene, ...editValues });
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

  const angleLabel = CAMERA_ANGLES.find(a => a.key === scene.cameraAngle)?.label || scene.cameraAngle || '정면';
  const duration = (scene.endSec || 0) - (scene.startSec || 0);

  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #E5E5EA',
      borderRadius: 12,
      overflow: 'hidden',
      opacity: isRegenerating ? 0.6 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* 장면 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #F2F2F7', background: '#FAFAFA' }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: '#5E6AD2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#FFF', flexShrink: 0 }}>
          {scene.order || index + 1}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, background: '#F2F2F7', color: '#6E6E73', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>
            {ANGLE_ICON[scene.cameraAngle] || '📷'} {angleLabel}
          </span>
          <span style={{ fontSize: 12, color: '#AEAEB2' }}>
            {scene.startSec}s – {scene.endSec}s ({duration}초)
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {isRegenerating ? (
            <div style={{ padding: '5px 10px', borderRadius: 7, background: '#F2F2F7', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#6E6E73' }}>
              <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
              재생성 중...
            </div>
          ) : (
            <>
              <button onClick={onRegenerate} title="이 장면 재생성" style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid #E5E5EA', background: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#6E6E73' }}>
                <RefreshCw size={11} /> 재생성
              </button>
              <button onClick={editing ? cancelEdit : startEdit} title="편집" style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid #E5E5EA', background: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#6E6E73' }}>
                {editing ? <X size={11} /> : <Edit3 size={11} />}
                {editing ? '취소' : '편집'}
              </button>
              {editing && (
                <button onClick={saveEdit} style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#5E6AD2', color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600 }}>
                  <Check size={11} /> 저장
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 장면 내용 */}
      <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* 대사 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <MessageSquare size={12} color="#5E6AD2" />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '0.05em' }}>대사</span>
          </div>
          {editing ? (
            <textarea
              value={editValues.dialogue}
              onChange={e => setEditValues(prev => ({ ...prev, dialogue: e.target.value }))}
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 7, border: '1px solid #E5E5EA', fontSize: 12.5, lineHeight: 1.55, resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
            />
          ) : (
            <div style={{ fontSize: 13, color: '#1D1D1F', lineHeight: 1.6 }}>
              {scene.dialogue || <span style={{ color: '#AEAEB2', fontStyle: 'italic' }}>대사 없음</span>}
            </div>
          )}
        </div>

        {/* 비주얼 프롬프트 (Kling용) */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <Camera size={12} color="#FF9500" />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kling 비주얼</span>
          </div>
          {editing ? (
            <textarea
              value={editValues.visualPrompt}
              onChange={e => setEditValues(prev => ({ ...prev, visualPrompt: e.target.value }))}
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 7, border: '1px solid #E5E5EA', fontSize: 12, lineHeight: 1.55, resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
            />
          ) : (
            <div style={{ fontSize: 12, color: '#6E6E73', lineHeight: 1.55, fontStyle: scene.visualPrompt ? 'normal' : 'italic' }}>
              {scene.visualPrompt || '비주얼 프롬프트 없음'}
            </div>
          )}
        </div>

        {/* 편집 시 — 카메라 각도 & 타임라인 */}
        {editing && (
          <>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>카메라 각도</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {CAMERA_ANGLES.map(a => (
                  <button key={a.key} onClick={() => setEditValues(prev => ({ ...prev, cameraAngle: a.key }))} style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 12,
                    border: `1.5px solid ${editValues.cameraAngle === a.key ? '#5E6AD2' : '#E5E5EA'}`,
                    background: editValues.cameraAngle === a.key ? '#5E6AD212' : '#FFF',
                    color: editValues.cameraAngle === a.key ? '#5E6AD2' : '#6E6E73',
                    cursor: 'pointer',
                  }}>{a.label}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>타임라인 (초)</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="number" value={editValues.startSec} onChange={e => setEditValues(prev => ({ ...prev, startSec: Number(e.target.value) }))}
                  style={{ width: 60, padding: '6px 8px', borderRadius: 6, border: '1px solid #E5E5EA', fontSize: 12.5, textAlign: 'center', fontFamily: 'inherit', outline: 'none' }} />
                <span style={{ color: '#AEAEB2' }}>→</span>
                <input type="number" value={editValues.endSec} onChange={e => setEditValues(prev => ({ ...prev, endSec: Number(e.target.value) }))}
                  style={{ width: 60, padding: '6px 8px', borderRadius: 6, border: '1px solid #E5E5EA', fontSize: 12.5, textAlign: 'center', fontFamily: 'inherit', outline: 'none' }} />
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

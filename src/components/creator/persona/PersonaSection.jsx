// PersonaSection.jsx — 페르소나 관리 (목록 + 편집 + 이미지 + 목소리)
import { useState, useEffect } from 'react';
import { Plus, Trash2, Check, ChevronRight, User, Image, Mic } from 'lucide-react';
import PersonaEditor from './PersonaEditor';
import PersonaImageGen from './PersonaImageGen';
import VoiceSetup from './VoiceSetup';

const SUB_TABS = [
  { key: 'profile', label: '프로필', icon: User },
  { key: 'images',  label: '이미지', icon: Image },
  { key: 'voice',   label: '목소리', icon: Mic },
];

export default function PersonaSection({ activePersonaId, onPersonaChange }) {
  const [personaIds, setPersonaIds] = useState([]);
  const [selectedId, setSelectedId] = useState(activePersonaId || null);
  const [selectedPersona, setSelectedPersona] = useState(null);
  const [subTab, setSubTab] = useState('profile');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [frontImageUrl, setFrontImageUrl] = useState(null);

  // persona index 로드
  useEffect(() => {
    fetch('/api/creator/personas')
      .then(r => r.json())
      .then(d => {
        const ids = d.ids || [];
        setPersonaIds(ids);
        // 처음 로드 시 첫 번째 페르소나 자동 선택
        if (!selectedId && ids.length > 0) {
          loadAndSelect(ids[0]);
        }
      })
      .catch(() => {});
  }, []);

  const loadAndSelect = async (id) => {
    setSelectedId(id);
    try {
      const r = await fetch(`/api/creator/persona?personaId=${id}`);
      const d = await r.json();
      const p = d.persona || d;
      setSelectedPersona(p);
      onPersonaChange(id, p, null);
    } catch {}
  };

  const handleCreate = async () => {
    if (personaIds.length >= 3 || creating) return;
    setCreating(true);
    try {
      const r = await fetch('/api/creator/personas', { method: 'POST' });
      const d = await r.json();
      if (d.id) {
        setPersonaIds(d.ids || [...personaIds, d.id]);
        await loadAndSelect(d.id);
        setSubTab('profile');
      }
    } catch {}
    setCreating(false);
  };

  const handleDelete = async (id) => {
    if (!confirm(`페르소나 "${id.substring(0, 8)}..." 를 삭제할까요? 연결된 이미지·목소리·LoRA가 모두 삭제됩니다.`)) return;
    setDeleting(id);
    try {
      await fetch(`/api/creator/personas?id=${id}`, { method: 'DELETE' });
      const newIds = personaIds.filter(p => p !== id);
      setPersonaIds(newIds);
      if (selectedId === id) {
        if (newIds.length > 0) {
          await loadAndSelect(newIds[0]);
        } else {
          setSelectedId(null);
          setSelectedPersona(null);
          onPersonaChange(null, null, null);
        }
      }
    } catch {}
    setDeleting(null);
  };

  const handlePersonaSaved = (updated) => {
    setSelectedPersona(updated);
    onPersonaChange(selectedId, updated, frontImageUrl);
  };

  const handleFrontImageUpdate = (url) => {
    setFrontImageUrl(url);
    onPersonaChange(selectedId, selectedPersona, url);
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 좌측 — 페르소나 목록 (사이드바) */}
      <div style={{
        width: 200,
        minWidth: 200,
        borderRight: '1px solid #E5E5EA',
        background: '#FAFAFA',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 12px',
        gap: 8,
        overflowY: 'auto',
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          페르소나 ({personaIds.length}/3)
        </div>

        {personaIds.map(id => (
          <div
            key={id}
            onClick={() => loadAndSelect(id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 10px',
              borderRadius: 10,
              background: selectedId === id ? '#5E6AD212' : 'transparent',
              border: `1.5px solid ${selectedId === id ? '#5E6AD2' : 'transparent'}`,
              cursor: 'pointer',
              transition: 'all 0.12s',
              position: 'relative',
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: selectedId === id ? '#5E6AD2' : '#E5E5EA',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: selectedId === id ? '#FFF' : '#6E6E73',
              flexShrink: 0,
            }}>
              {(selectedPersona?.name && selectedId === id) ? selectedPersona.name[0] : '?'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedId === id ? (selectedPersona?.name || '이름 미설정') : `페르소나 ${id.substring(0, 4)}`}
              </div>
              <div style={{ fontSize: 11, color: '#AEAEB2' }}>
                {selectedId === id ? (selectedPersona?.age || '나이 미설정') : '...'}
              </div>
            </div>
            {deleting === id ? (
              <div style={{ width: 14, height: 14, border: '2px solid #FF3B30', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
            ) : (
              <button
                onClick={e => { e.stopPropagation(); handleDelete(id); }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#AEAEB2', padding: 2, opacity: 0, transition: 'opacity 0.1s' }}
                className="delete-btn"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}

        {/* + 새 페르소나 */}
        {personaIds.length < 3 && (
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 10px', borderRadius: 10,
              border: '1.5px dashed #D0D0D8', background: 'transparent',
              fontSize: 12.5, color: '#6E6E73', cursor: 'pointer',
              transition: 'all 0.12s',
            }}
          >
            <Plus size={13} />
            {creating ? '생성 중...' : '새 페르소나'}
          </button>
        )}
      </div>

      {/* 우측 — 편집 영역 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#AEAEB2' }}>
            <User size={36} strokeWidth={1.5} />
            <div style={{ fontSize: 14, fontWeight: 500 }}>페르소나를 선택하거나 새로 만들어주세요</div>
            <button
              onClick={handleCreate}
              disabled={creating || personaIds.length >= 3}
              style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#5E6AD2', color: '#FFF', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <Plus size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />
              첫 번째 페르소나 만들기
            </button>
          </div>
        ) : (
          <>
            {/* 서브탭 */}
            <div style={{ display: 'flex', borderBottom: '1px solid #E5E5EA', background: '#FFFFFF', padding: '0 20px', flexShrink: 0 }}>
              {SUB_TABS.map(st => {
                const Icon = st.icon;
                const active = subTab === st.key;
                return (
                  <button key={st.key} onClick={() => setSubTab(st.key)} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '10px 14px', border: 'none',
                    borderBottom: `2px solid ${active ? '#5E6AD2' : 'transparent'}`,
                    background: 'transparent',
                    fontSize: 12.5, fontWeight: active ? 600 : 400,
                    color: active ? '#5E6AD2' : '#6E6E73',
                    cursor: 'pointer',
                  }}>
                    <Icon size={13} />
                    {st.label}
                  </button>
                );
              })}
            </div>

            {/* 서브탭 컨텐츠 */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {subTab === 'profile' && (
                <PersonaEditor
                  personaId={selectedId}
                  onSaved={handlePersonaSaved}
                />
              )}
              {subTab === 'images' && (
                <PersonaImageGen
                  personaId={selectedId}
                  persona={selectedPersona}
                  onFrontImageUpdate={handleFrontImageUpdate}
                />
              )}
              {subTab === 'voice' && (
                <VoiceSetup personaId={selectedId} />
              )}
            </div>
          </>
        )}
      </div>

      <style>{`
        .delete-btn { opacity: 0 !important; }
        div:hover > .delete-btn { opacity: 1 !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

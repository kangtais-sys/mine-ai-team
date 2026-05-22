// PersonaIdentity — 아이덴티티 탭 메인
// V3 캐논 페르소나 목록 + 새로 만들기 진입
// Stage 1 PoC: 생성·선택·저장까지만. Stage 2(콘텐츠 연결)는 다음 푸시.

import { useEffect, useState } from 'react';
import { Plus, User, Sparkles, Loader2, Trash2, Eye } from 'lucide-react';
import PersonaCreator from './PersonaCreator';

export default function PersonaIdentity({ identityId = 'mine-primary' }) {
  const [personas, setPersonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({ max: 3, costUsdApprox: 0.16 });

  const [creatorOpen, setCreatorOpen] = useState(false);
  const [viewing, setViewing] = useState(null); // 후보 다시보기 모달용

  const loadList = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/creator/persona-pulid?identityId=${identityId}`);
      const j = await r.json();
      setPersonas(j.personas || []);
      if (j.meta) setMeta(j.meta);
    } catch (e) {
      console.error('[PersonaIdentity]', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadList(); }, [identityId]);

  async function handleDelete(id, name) {
    if (!confirm(`"${name || '페르소나'}" 삭제할까? 후보 4장도 같이 사라져.`)) return;
    try {
      const r = await fetch(`/api/creator/persona-pulid?id=${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await loadList();
    } catch (e) {
      alert(`삭제 실패: ${e.message}`);
    }
  }

  const canAdd = personas.length < (meta.max || 3);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#FAFAFA' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 28px 60px' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22, gap: 16 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#1D1D1F', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={18} color="#5E6AD2" /> 캐논 페르소나
            </div>
            <div style={{ fontSize: 12.5, color: '#6E6E73', marginTop: 6, lineHeight: 1.55, maxWidth: 620 }}>
              PuLID로 셀카 1장 → 4 각도 동시 생성 → 캐논 1장 선택.
              이후 모든 콘텐츠에서 이 얼굴이 기준이 돼.
              최대 {meta.max || 3}개.
            </div>
          </div>
          <button
            onClick={() => canAdd && setCreatorOpen(true)}
            disabled={!canAdd}
            style={{
              padding: '10px 16px', border: 'none', borderRadius: 10,
              background: canAdd ? '#5E6AD2' : '#D1D1D6',
              color: '#FFF', fontWeight: 600, fontSize: 13,
              cursor: canAdd ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 6,
              whiteSpace: 'nowrap',
            }}
            title={canAdd ? `약 $${(meta.costUsdApprox || 0.16).toFixed(2)}` : `최대 ${meta.max}개`}
          >
            <Plus size={15} /> 새 페르소나
          </button>
        </div>

        {/* 본문 */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#AEAEB2' }}>
            <Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : personas.length === 0 ? (
          <EmptyState onCreate={() => setCreatorOpen(true)} costApprox={meta.costUsdApprox} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {personas.map((p) => (
              <PersonaCard
                key={p.id}
                persona={p}
                onView={() => setViewing(p)}
                onDelete={() => handleDelete(p.id, p.data?.name)}
              />
            ))}
          </div>
        )}
      </div>

      {creatorOpen && (
        <PersonaCreator
          identityId={identityId}
          onClose={() => setCreatorOpen(false)}
          onCreated={() => {
            setCreatorOpen(false);
            loadList();
          }}
        />
      )}

      {viewing && (
        <CandidatesViewer persona={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

/* ─────────── EmptyState ─────────── */
function EmptyState({ onCreate, costApprox = 0.16 }) {
  return (
    <div style={{
      padding: '60px 20px', textAlign: 'center', background: '#FFF',
      borderRadius: 14, border: '1px dashed #D1D1D6',
    }}>
      <User size={32} color="#AEAEB2" style={{ marginBottom: 12 }} />
      <div style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F', marginBottom: 6 }}>
        아직 캐논 페르소나가 없어
      </div>
      <div style={{ fontSize: 12.5, color: '#8E8E93', marginBottom: 18, lineHeight: 1.55 }}>
        라이브러리에 셀카 1장만 있으면 시작 가능.<br />
        4 각도 후보 → 캐논 1장 선택까지 약 1분, 비용 ${costApprox.toFixed(2)}.
      </div>
      <button
        onClick={onCreate}
        style={{
          padding: '10px 20px', border: 'none', borderRadius: 10,
          background: '#5E6AD2', color: '#FFF', fontWeight: 600, fontSize: 13,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <Plus size={15} /> 새 페르소나 만들기
      </button>
    </div>
  );
}

/* ─────────── PersonaCard ─────────── */
function PersonaCard({ persona, onView, onDelete }) {
  const d = persona.data || {};
  const canonical = d.canonical;
  const candidates = d.candidates || [];
  const fallbackUrl = canonical?.url || candidates[0]?.url;

  return (
    <div style={{
      background: '#FFF', borderRadius: 14, overflow: 'hidden',
      border: '1px solid #E5E5EA', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ position: 'relative', aspectRatio: '3 / 4', background: '#F5F5F7' }}>
        {fallbackUrl ? (
          <img src={fallbackUrl} alt={d.name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#AEAEB2' }}>
            <User size={28} />
          </div>
        )}
        {canonical ? (
          <div style={{
            position: 'absolute', top: 8, left: 8, padding: '3px 8px',
            background: 'rgba(94,106,210,0.95)', color: '#FFF',
            borderRadius: 999, fontSize: 10.5, fontWeight: 700,
          }}>
            CANON · {labelOf(canonical.angle)}
          </div>
        ) : (
          <div style={{
            position: 'absolute', top: 8, left: 8, padding: '3px 8px',
            background: 'rgba(255,149,0,0.95)', color: '#FFF',
            borderRadius: 999, fontSize: 10.5, fontWeight: 700,
          }}>
            캐논 미선택
          </div>
        )}
      </div>
      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1D1D1F', marginBottom: 4 }}>
          {d.name || '이름 없음'}
        </div>
        <div style={{ fontSize: 11, color: '#8E8E93' }}>
          후보 {candidates.length}장
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button
            onClick={onView}
            style={{
              flex: 1, padding: '7px 10px', border: '1px solid #E5E5EA', borderRadius: 8,
              background: '#FFF', color: '#1D1D1F', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            <Eye size={11} /> 후보 다시보기
          </button>
          <button
            onClick={onDelete}
            style={{
              padding: '7px 10px', border: '1px solid #E5E5EA', borderRadius: 8,
              background: '#FFF', color: '#FF3B30', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="삭제"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────── CandidatesViewer ─────────── */
function CandidatesViewer({ persona, onClose }) {
  const d = persona.data || {};
  const candidates = d.candidates || [];
  const canonicalAngle = d.canonical?.angle;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FFF', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '88vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E5EA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1D1D1F' }}>
            {d.name || '페르소나'} — 후보 4장
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '6px 10px', border: '1px solid #E5E5EA', borderRadius: 8,
              background: '#FFF', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            닫기
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {candidates.map((c) => {
              const isCanon = canonicalAngle === c.angle;
              return (
                <div key={c.angle} style={{
                  border: isCanon ? '2.5px solid #5E6AD2' : '1px solid #E5E5EA',
                  borderRadius: 12, overflow: 'hidden', background: '#FFF',
                }}>
                  <div style={{ position: 'relative', aspectRatio: '3 / 4', background: '#F5F5F7' }}>
                    <img src={c.url} alt={c.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    {isCanon && (
                      <div style={{
                        position: 'absolute', top: 6, left: 6, padding: '3px 8px',
                        background: 'rgba(94,106,210,0.95)', color: '#FFF',
                        borderRadius: 999, fontSize: 10, fontWeight: 700,
                      }}>
                        CANON
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600, color: '#1D1D1F' }}>
                    {c.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function labelOf(angle) {
  return {
    'front': '정면 무표정',
    'three-quarter': '반측면 살짝미소',
    'smile': '정면 환한미소',
    'closeup': '정면 클로즈업',
  }[angle] || angle;
}

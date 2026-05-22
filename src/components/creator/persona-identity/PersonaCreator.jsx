// PersonaCreator — 3-step 위저드
// STEP 1: 라이브러리에서 셀카(photo) 1장 + 페르소나 이름
// STEP 2: PuLID 4장 병렬 → 후보 그리드
// STEP 3: 후보 1장 선택 → canonical 저장 → onCreated()
//
// PoC: 셀카 1장만. (1-3장은 Phase 다음)

import { useEffect, useState } from 'react';
import { X, Loader2, Check, AlertCircle, Sparkles } from 'lucide-react';

const COST_USD_APPROX = 0.16;

export default function PersonaCreator({ identityId = 'mine-primary', onClose, onCreated }) {
  const [step, setStep] = useState(1);

  // STEP 1
  const [name, setName] = useState('');
  const [assets, setAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState(null);

  // STEP 2
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [persona, setPersona] = useState(null); // { id, data: { candidates: [...] } }

  // STEP 3
  const [picking, setPicking] = useState(null); // angle currently being picked

  // 라이브러리 셀카(photo) 로드
  useEffect(() => {
    setLoadingAssets(true);
    fetch(`/api/creator/identity-search?identityId=${identityId}&assetType=photo&limit=60&sort=newest`)
      .then((r) => r.json())
      .then((d) => setAssets(d.assets || []))
      .catch((e) => console.error('[PersonaCreator] asset load', e))
      .finally(() => setLoadingAssets(false));
  }, [identityId]);

  // STEP 1 → STEP 2 (생성 트리거)
  async function handleGenerate() {
    if (!selectedAsset) return;
    setStep(2);
    setGenerating(true);
    setGenError(null);
    try {
      const r = await fetch('/api/creator/persona-pulid?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityId,
          name: name.trim() || undefined,
          sourceSelfieUrl: selectedAsset.url,
          sourceSelfieAssetId: selectedAsset.id,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || `HTTP ${r.status}`);
      setPersona(j.persona);
      setStep(3);
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  // STEP 3: canonical 선택
  async function handlePick(angle) {
    if (!persona) return;
    setPicking(angle);
    try {
      const r = await fetch('/api/creator/persona-pulid?action=select', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: persona.id, angle }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || `HTTP ${r.status}`);
      onCreated?.(j.persona);
      onClose?.();
    } catch (e) {
      alert(`선택 실패: ${e.message}`);
    } finally {
      setPicking(null);
    }
  }

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
          background: '#FFF', borderRadius: 16, width: '100%', maxWidth: 820, maxHeight: '88vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* 헤더 */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #E5E5EA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1D1D1F', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={15} color="#5E6AD2" /> 새 캐논 페르소나
            </div>
            <div style={{ fontSize: 11, color: '#8E8E93', marginTop: 3 }}>
              STEP {step} / 3 ·{' '}
              {step === 1 && '셀카 선택 + 이름'}
              {step === 2 && '4 각도 동시 생성 중'}
              {step === 3 && '캐논으로 박을 1장 선택'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: '50%', border: 'none',
              background: '#F5F5F7', color: '#1D1D1F', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* 컨텐츠 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
          {step === 1 && (
            <Step1
              name={name}
              setName={setName}
              assets={assets}
              loadingAssets={loadingAssets}
              selectedAsset={selectedAsset}
              setSelectedAsset={setSelectedAsset}
            />
          )}
          {step === 2 && <Step2 generating={generating} genError={genError} onRetry={handleGenerate} />}
          {step === 3 && persona && (
            <Step3 persona={persona} picking={picking} onPick={handlePick} />
          )}
        </div>

        {/* 푸터 */}
        {step === 1 && (
          <div style={{ padding: '14px 22px', borderTop: '1px solid #E5E5EA', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 11.5, color: '#8E8E93' }}>
              PuLID로 4 각도 동시 생성 · 약 ${COST_USD_APPROX.toFixed(2)}
            </div>
            <button
              disabled={!selectedAsset}
              onClick={handleGenerate}
              style={{
                padding: '9px 18px', border: 'none', borderRadius: 8,
                background: selectedAsset ? '#5E6AD2' : '#D1D1D6',
                color: '#FFF', fontWeight: 600, fontSize: 13,
                cursor: selectedAsset ? 'pointer' : 'not-allowed',
              }}
            >
              페르소나 생성
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────── STEP 1 ─────────── */
function Step1({ name, setName, assets, loadingAssets, selectedAsset, setSelectedAsset }) {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#3A3A3C', marginBottom: 6 }}>
          페르소나 이름 <span style={{ color: '#AEAEB2', fontWeight: 400 }}>(비우면 자동 명명)</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 밀리, 데일리룩 미혜"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '9px 12px', borderRadius: 8, border: '1px solid #D1D1D6',
            fontSize: 13, outline: 'none',
          }}
        />
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: '#3A3A3C', marginBottom: 8 }}>
        라이브러리 셀카에서 1장 선택{' '}
        <span style={{ color: '#AEAEB2', fontWeight: 400 }}>(photo 타입)</span>
      </div>

      {loadingAssets ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#AEAEB2' }}>
          <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : assets.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', fontSize: 12.5, color: '#AEAEB2', background: '#FAFAFA', borderRadius: 10 }}>
          photo 타입 자산이 없어. 라이브러리 탭에서 먼저 셀카를 업로드해.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))', gap: 8 }}>
          {assets.map((a) => {
            const active = selectedAsset?.id === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setSelectedAsset(a)}
                title={(a.manual_tags || []).join(', ') || a.filename || ''}
                style={{
                  aspectRatio: '1 / 1', padding: 0, borderRadius: 10, overflow: 'hidden',
                  border: active ? '3px solid #5E6AD2' : '2px solid #E5E5EA',
                  background: '#FFF', cursor: 'pointer', position: 'relative',
                }}
              >
                <img
                  src={a.thumbnail_url || a.url}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                {active && (
                  <div style={{
                    position: 'absolute', top: 4, right: 4, width: 18, height: 18,
                    borderRadius: '50%', background: '#5E6AD2',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Check size={11} color="#FFF" strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────── STEP 2 ─────────── */
function Step2({ generating, genError, onRetry }) {
  if (generating) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <Loader2 size={32} color="#5E6AD2" style={{ animation: 'spin 0.9s linear infinite' }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1D1D1F', marginTop: 16 }}>
          PuLID로 4 각도 생성 중…
        </div>
        <div style={{ fontSize: 12, color: '#8E8E93', marginTop: 6 }}>
          정면 무표정 · 반측면 살짝미소 · 정면 환한미소 · 정면 클로즈업 — 병렬 호출, 30~60초 정도 걸려.
        </div>
      </div>
    );
  }
  if (genError) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <AlertCircle size={28} color="#FF3B30" />
        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1D1D1F', marginTop: 12 }}>
          생성 실패
        </div>
        <div style={{ fontSize: 12, color: '#8E8E93', marginTop: 6, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
          {genError}
        </div>
        <button
          onClick={onRetry}
          style={{
            marginTop: 16, padding: '8px 16px', border: 'none', borderRadius: 8,
            background: '#5E6AD2', color: '#FFF', fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
          }}
        >
          다시 시도
        </button>
      </div>
    );
  }
  return null;
}

/* ─────────── STEP 3 ─────────── */
function Step3({ persona, picking, onPick }) {
  const candidates = persona?.data?.candidates || [];
  const failures = persona?.data?.failures || [];
  const partial = !!persona?.data?.partial;
  return (
    <div>
      <div style={{ fontSize: 12.5, color: '#3A3A3C', marginBottom: 14, lineHeight: 1.5 }}>
        후보 <b>{candidates.length}장</b> 중 캐논(기준)으로 박을 <b>1장</b>을 골라.
        이후 모든 콘텐츠에서 이 페르소나의 얼굴 기준이 돼.
      </div>
      {partial && (
        <div style={{
          padding: '10px 12px', marginBottom: 12, borderRadius: 8,
          background: '#FFF6E5', border: '1px solid #FFD479',
          fontSize: 11.5, color: '#7C4F00', lineHeight: 1.5,
        }}>
          ⚠ 일부 각도 생성 실패 — {failures.map(f => f.label).join(', ')}.
          나머지로 진행 가능. (실패분 재생성은 다음 푸시에 추가 예정)
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {candidates.map((c) => {
          const isPicking = picking === c.angle;
          return (
            <button
              key={c.angle}
              onClick={() => !picking && onPick(c.angle)}
              disabled={!!picking}
              style={{
                padding: 0, border: '2px solid #E5E5EA', borderRadius: 12, overflow: 'hidden',
                background: '#FFF', cursor: picking ? 'wait' : 'pointer', textAlign: 'left',
                opacity: picking && !isPicking ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { if (!picking) e.currentTarget.style.borderColor = '#5E6AD2'; }}
              onMouseLeave={(e) => { if (!picking) e.currentTarget.style.borderColor = '#E5E5EA'; }}
            >
              <div style={{ position: 'relative', aspectRatio: '3 / 4', background: '#F5F5F7' }}>
                <img
                  src={c.url}
                  alt={c.label}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                {isPicking && (
                  <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Loader2 size={22} color="#5E6AD2" style={{ animation: 'spin 0.8s linear infinite' }} />
                  </div>
                )}
              </div>
              <div style={{ padding: '10px 12px', fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>
                {c.label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

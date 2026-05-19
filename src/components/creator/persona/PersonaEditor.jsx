// PersonaEditor.jsx — 페르소나 프로필 편집 + 실제 얼굴 사진 업로드 → LoRA 훈련
import { useState, useEffect, useRef } from 'react';
import { Save, Upload, Loader2, CheckCircle2, AlertCircle, RefreshCw, X } from 'lucide-react';

const PERSONALITY_OPTIONS = [
  '호기심 왕성', '팩트충', '완벽주의자', '따뜻한 언니', '직접 해봐야 직성 풀림',
  '솔직함', '유머감각', '끈기 있음', '공감 잘함', '논리적', '트렌디', '학구적',
];

function FieldLabel({ children }) {
  return (
    <label style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {children}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, style = {} }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1D1D1F', ...style }}
    />
  );
}

function TextArea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13, lineHeight: 1.55, resize: 'vertical', fontFamily: 'inherit', outline: 'none', color: '#1D1D1F' }}
    />
  );
}

function ChipToggle({ options, selected, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(opt => {
        const active = Array.isArray(selected) ? selected.includes(opt) : selected === opt;
        return (
          <button key={opt} onClick={() => {
            if (Array.isArray(selected)) {
              onChange(active ? selected.filter(s => s !== opt) : [...selected, opt]);
            } else { onChange(opt); }
          }} style={{
            padding: '6px 12px', borderRadius: 16,
            border: `1.5px solid ${active ? '#5E6AD2' : '#E5E5EA'}`,
            background: active ? '#5E6AD212' : '#FFF',
            fontSize: 12.5, fontWeight: active ? 600 : 400,
            color: active ? '#5E6AD2' : '#6E6E73',
            cursor: 'pointer', transition: 'all 0.12s',
          }}>{opt}</button>
        );
      })}
    </div>
  );
}

export default function PersonaEditor({ personaId, onSaved }) {
  const [persona, setPersona] = useState({
    name: '', handle: '', age: '', gender: '', occupation: '', bio: '',
    background: '', personality: [], communicationTone: '', signatureActions: '',
    catchphrases: [], hairStyle: '', skinType: '', typicalOutfit: '', signatureLook: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 사진 업로드 — 카테고리별 분리
  const [facePhotos, setFacePhotos] = useState([]);   // 얼굴 사진 (LoRA 훈련용)
  const [hairPhotos, setHairPhotos] = useState([]);   // 헤어 참고 사진
  const [outfitPhotos, setOutfitPhotos] = useState([]); // 의상 참고 사진
  const [loraStatus, setLoraStatus] = useState(null);
  const [loraLoading, setLoraLoading] = useState(false);
  const faceInputRef = useRef(null);
  const hairInputRef = useRef(null);
  const outfitInputRef = useRef(null);
  // 레거시 호환
  const fileInputRef = faceInputRef;

  useEffect(() => {
    if (!personaId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/creator/persona?personaId=${personaId}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/creator/persona-lora?personaId=${personaId}`).then(r => r.json()).catch(() => ({ status: 'none' })),
    ]).then(([pData, loraData]) => {
      if (pData.persona) {
        const p = pData.persona;
        setPersona({
          name: p.name || '', handle: p.handle || '', age: p.age || '', gender: p.gender || '',
          occupation: p.occupation || '', bio: p.bio || '', background: p.background || '',
          personality: Array.isArray(p.personality) ? p.personality : [],
          communicationTone: p.communicationTone || '', signatureActions: p.signatureActions || '',
          catchphrases: Array.isArray(p.catchphrases) ? p.catchphrases : [],
          hairStyle: p.hairStyle || '', skinType: p.skinType || '',
          typicalOutfit: p.typicalOutfit || '', signatureLook: p.signatureLook || '',
        });
      }
      if (loraData.status && loraData.status !== 'none') setLoraStatus(loraData.status);
    }).finally(() => setLoading(false));
  }, [personaId]);

  const makePhotoUploadHandler = (setter) => (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target.result.split(',')[1];
        setter(prev => [...prev.slice(-9), { preview: ev.target.result, base64, mimeType: file.type }]);
      };
      reader.readAsDataURL(file);
    });
  };
  const handleFacePhotoUpload = makePhotoUploadHandler(setFacePhotos);
  const handleHairPhotoUpload = makePhotoUploadHandler(setHairPhotos);
  const handleOutfitPhotoUpload = makePhotoUploadHandler(setOutfitPhotos);

  const handleStartLoRA = async () => {
    if (facePhotos.length < 5) {
      alert('LoRA 훈련을 위해 얼굴 사진이 최소 5장 필요합니다. (다양한 각도, 표정)');
      return;
    }
    setLoraLoading(true);
    try {
      // base64 이미지들을 ZIP URL로 묶어서 전달 (여기서는 첫 번째 이미지 URL만 전달 — 실제론 ZIP 필요)
      // fal.ai flux-lora-portrait-trainer expects a zip URL of images
      // For now, we'll use an inline base64 approach note in the API
      const imageUrls = facePhotos.map(p => `data:${p.mimeType};base64,${p.base64}`);
      const r = await fetch('/api/creator/persona-lora', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId, imageUrls }),
      });
      const d = await r.json();
      if (d.requestId) {
        setLoraStatus('queued');
      } else {
        alert(d.error || 'LoRA 훈련 시작 실패');
      }
    } catch (e) {
      alert(e.message);
    }
    setLoraLoading(false);
  };

  const checkLoraStatus = async () => {
    setLoraLoading(true);
    try {
      const r = await fetch(`/api/creator/persona-lora?personaId=${personaId}`);
      const d = await r.json();
      setLoraStatus(d.status || 'none');
    } catch {}
    setLoraLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const r = await fetch('/api/creator/persona', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId, ...persona,
          hairRefPhotos: hairPhotos.map(p => p.preview),
          outfitRefPhotos: outfitPhotos.map(p => p.preview),
        }),
      });
      const d = await r.json();
      if (d.success) {
        setSaved(true);
        onSaved?.({ ...persona, id: personaId });
        setTimeout(() => setSaved(false), 3000);
      } else {
        alert(d.error || '저장 실패');
      }
    } catch (e) {
      alert(e.message);
    }
    setSaving(false);
  };

  const upd = (key) => (val) => setPersona(prev => ({ ...prev, [key]: val }));

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite' }} color="#AEAEB2" />
      </div>
    );
  }

  const loraStatusInfo = {
    queued:   { color: '#FF9500', bg: '#FFF5E6', label: '큐 대기 중' },
    training: { color: '#5E6AD2', bg: '#F0F0FF', label: 'LoRA 훈련 중 (15-30분)' },
    ready:    { color: '#34C759', bg: '#F0FFF4', label: '훈련 완료 ✓' },
    failed:   { color: '#FF3B30', bg: '#FFF5F5', label: '훈련 실패' },
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 24 }}>
      <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* 기본 정보 */}
        <div style={{ background: '#FFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1D1D1F', marginBottom: 16 }}>기본 정보</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <FieldLabel>이름</FieldLabel>
              <TextInput value={persona.name} onChange={upd('name')} placeholder="예: 밀리 (Milli)" />
            </div>
            <div>
              <FieldLabel>핸들 (@)</FieldLabel>
              <TextInput value={persona.handle} onChange={upd('handle')} placeholder="예: millimilli.kr" />
            </div>
            <div>
              <FieldLabel>나이</FieldLabel>
              <TextInput value={persona.age} onChange={upd('age')} placeholder="예: 29세" />
            </div>
            <div>
              <FieldLabel>성별</FieldLabel>
              <TextInput value={persona.gender} onChange={upd('gender')} placeholder="예: 여성" />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <FieldLabel>직업</FieldLabel>
            <TextInput value={persona.occupation} onChange={upd('occupation')} placeholder="예: 화장품 연구원" />
          </div>
          <div style={{ marginTop: 14 }}>
            <FieldLabel>한 줄 소개</FieldLabel>
            <TextInput value={persona.bio} onChange={upd('bio')} placeholder="예: 500달톤 프로틴 기술로 스킨케어를 바꾸는 화장품 연구원" />
          </div>
          <div style={{ marginTop: 14 }}>
            <FieldLabel>배경 스토리</FieldLabel>
            <TextArea value={persona.background} onChange={upd('background')} placeholder="페르소나가 이 일을 시작하게 된 계기, 전문성, 스토리..." rows={3} />
          </div>
        </div>

        {/* 성격 & 커뮤니케이션 */}
        <div style={{ background: '#FFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1D1D1F', marginBottom: 16 }}>성격 & 커뮤니케이션</div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>성격 특성 (복수 선택)</FieldLabel>
            <ChipToggle options={PERSONALITY_OPTIONS} selected={persona.personality} onChange={upd('personality')} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>커뮤니케이션 톤</FieldLabel>
            <TextInput value={persona.communicationTone} onChange={upd('communicationTone')} placeholder="예: 전문적이되 쉽게. 강의 말고 대화. 후킹 오프닝으로 시작." />
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>시그니처 행동 패턴</FieldLabel>
            <TextArea value={persona.signatureActions} onChange={upd('signatureActions')} placeholder="예: 성분 이름 들으면 분자 구조부터 찾아봄&#10;손가락으로 가리키며 설명하는 버릇" rows={2} />
          </div>
        </div>

        {/* 외모 & 비주얼 */}
        <div style={{ background: '#FFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1D1D1F', marginBottom: 16 }}>외모 & 비주얼 스타일</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <FieldLabel>헤어스타일</FieldLabel>
              <TextInput value={persona.hairStyle} onChange={upd('hairStyle')} placeholder="예: 긴 웨이브 갈색 머리" />
            </div>
            <div>
              <FieldLabel>피부 타입/톤</FieldLabel>
              <TextInput value={persona.skinType} onChange={upd('skinType')} placeholder="예: 중성 피부, 밝은 톤" />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <FieldLabel>일반적인 의상</FieldLabel>
            <TextInput value={persona.typicalOutfit} onChange={upd('typicalOutfit')} placeholder="예: 흰 가운 또는 미니멀 오피스 룩" />
          </div>
          <div style={{ marginTop: 14 }}>
            <FieldLabel>시그니처 룩 (영상 프롬프트용)</FieldLabel>
            <TextArea value={persona.signatureLook} onChange={upd('signatureLook')} placeholder="AI 이미지 생성에 사용될 외모 설명. 영어 또는 한국어.&#10;예: Korean woman, late 20s, natural dewy skin, minimal makeup, professional lab coat..." rows={2} />
          </div>
        </div>

        {/* 참고 사진 업로드 — 3개 섹션 */}
        <div style={{ background: '#FFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1D1D1F', marginBottom: 16 }}>참고 사진 업로드</div>

          {/* 1. 얼굴 사진 (LoRA) */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>👤 얼굴 사진</span>
              <span style={{ fontSize: 11, color: '#FF3B30', fontWeight: 600 }}>필수 · 최소 5장</span>
            </div>
            <div style={{ fontSize: 11.5, color: '#6E6E73', marginBottom: 10, lineHeight: 1.5 }}>
              실제 본인 사진 — 다양한 각도·표정으로. FLUX LoRA 훈련에 사용되어 얼굴을 초현실적으로 재현합니다.
              <span style={{ color: '#FF9500', marginLeft: 4 }}>훈련 시간 약 15-30분</span>
            </div>

            {loraStatus && loraStatusInfo[loraStatus] && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: loraStatusInfo[loraStatus].bg, marginBottom: 10 }}>
                {loraStatus === 'training' || loraStatus === 'queued' ? (
                  <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} color={loraStatusInfo[loraStatus].color} />
                ) : loraStatus === 'ready' ? (
                  <CheckCircle2 size={14} color={loraStatusInfo[loraStatus].color} />
                ) : (
                  <AlertCircle size={14} color={loraStatusInfo[loraStatus].color} />
                )}
                <span style={{ fontSize: 12.5, color: loraStatusInfo[loraStatus].color, fontWeight: 600 }}>{loraStatusInfo[loraStatus].label}</span>
                {(loraStatus === 'training' || loraStatus === 'queued') && (
                  <button onClick={checkLoraStatus} disabled={loraLoading} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: '#6E6E73' }}>
                    <RefreshCw size={13} />
                  </button>
                )}
              </div>
            )}

            {facePhotos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {facePhotos.map((p, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={p.preview} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
                    <button onClick={() => setFacePhotos(prev => prev.filter((_, j) => j !== i))}
                      style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: '#FF3B30', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={9} color="#FFF" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input ref={faceInputRef} type="file" accept="image/*" multiple onChange={handleFacePhotoUpload} style={{ display: 'none' }} />
              <button onClick={() => faceInputRef.current?.click()}
                style={{ flex: 1, padding: '9px 14px', borderRadius: 8, border: '1.5px dashed #D0D0D8', background: '#FAFAFA', fontSize: 12, color: '#6E6E73', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Upload size={12} /> 얼굴 사진 업로드 ({facePhotos.length}장)
              </button>
              {facePhotos.length >= 5 && loraStatus !== 'ready' && (
                <button onClick={handleStartLoRA} disabled={loraLoading}
                  style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: '#5E6AD2', color: '#FFF', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {loraLoading ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : '🚀'} LoRA 훈련 시작
                </button>
              )}
            </div>
            {facePhotos.length > 0 && facePhotos.length < 5 && (
              <div style={{ fontSize: 11, color: '#FF9500', marginTop: 5 }}>{5 - facePhotos.length}장 더 필요해요</div>
            )}
          </div>

          {/* 구분선 */}
          <div style={{ borderTop: '1px solid #F2F2F7', marginBottom: 16 }} />

          {/* 2. 헤어 참고 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>💇 헤어 참고 사진</span>
              <span style={{ fontSize: 11, color: '#AEAEB2' }}>선택</span>
            </div>
            <div style={{ fontSize: 11.5, color: '#6E6E73', marginBottom: 8 }}>원하는 헤어스타일 참고 이미지. 이미지 생성 시 스타일 힌트로 활용됩니다.</div>
            {hairPhotos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {hairPhotos.map((p, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={p.preview} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
                    <button onClick={() => setHairPhotos(prev => prev.filter((_, j) => j !== i))}
                      style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: '#FF3B30', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={9} color="#FFF" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input ref={hairInputRef} type="file" accept="image/*" multiple onChange={handleHairPhotoUpload} style={{ display: 'none' }} />
            <button onClick={() => hairInputRef.current?.click()}
              style={{ width: '100%', padding: '9px 14px', borderRadius: 8, border: '1.5px dashed #D0D0D8', background: '#FAFAFA', fontSize: 12, color: '#6E6E73', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Upload size={12} /> 헤어 참고 업로드 ({hairPhotos.length}장)
            </button>
          </div>

          {/* 구분선 */}
          <div style={{ borderTop: '1px solid #F2F2F7', marginBottom: 16 }} />

          {/* 3. 의상 참고 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>👗 의상 참고 사진</span>
              <span style={{ fontSize: 11, color: '#AEAEB2' }}>선택</span>
            </div>
            <div style={{ fontSize: 11.5, color: '#6E6E73', marginBottom: 8 }}>원하는 의상·스타일 참고 이미지. 이미지 생성 시 스타일 힌트로 활용됩니다.</div>
            {outfitPhotos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {outfitPhotos.map((p, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={p.preview} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
                    <button onClick={() => setOutfitPhotos(prev => prev.filter((_, j) => j !== i))}
                      style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: '#FF3B30', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={9} color="#FFF" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input ref={outfitInputRef} type="file" accept="image/*" multiple onChange={handleOutfitPhotoUpload} style={{ display: 'none' }} />
            <button onClick={() => outfitInputRef.current?.click()}
              style={{ width: '100%', padding: '9px 14px', borderRadius: 8, border: '1.5px dashed #D0D0D8', background: '#FAFAFA', fontSize: 12, color: '#6E6E73', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Upload size={12} /> 의상 참고 업로드 ({outfitPhotos.length}장)
            </button>
          </div>
        </div>

        {/* 저장 버튼 */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', padding: '13px 20px', borderRadius: 10, border: 'none',
            background: saved ? '#34C759' : '#5E6AD2', color: '#FFF',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'background 0.2s',
          }}
        >
          {saving ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> :
           saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
          {saving ? '저장 중...' : saved ? '저장됨!' : '페르소나 저장'}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

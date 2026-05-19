// PersonaImageGen.jsx — 페르소나 각도별 초현실 이미지 생성 + 갤러리
import { useState, useEffect } from 'react';
import { Sparkles, Loader2, Download, Star, X, ChevronLeft, ChevronRight } from 'lucide-react';

const ANGLES = [
  { key: 'front',         label: '정면',      desc: '카메라 정면, 눈 맞춤' },
  { key: 'three-quarter', label: '3/4 측면',  desc: '살짝 틀어진 각도, 자연스러운 미소' },
  { key: 'closeup',       label: '클로즈업',  desc: '모공까지 보이는 초근접 얼굴' },
  { key: 'fullbody',      label: '전신',      desc: '전신 스탠딩, 패션 사진' },
  { key: 'side',          label: '측면',      desc: '옆모습, 황금빛 보케 배경' },
];

export default function PersonaImageGen({ personaId, persona, onFrontImageUpdate }) {
  const [images, setImages] = useState([]);
  const [selectedAngle, setSelectedAngle] = useState('front');
  const [extraPrompt, setExtraPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState(null); // { url, label, index }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!personaId) return;
    fetch(`/api/creator/persona-images?personaId=${personaId}`)
      .then(r => r.json())
      .then(d => {
        if (d.images) {
          setImages(d.images);
          // front 이미지가 있으면 부모에 전달
          const frontImg = d.images.find(img => img.angle === 'front');
          if (frontImg) onFrontImageUpdate?.(frontImg.url);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [personaId]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const personaDesc = persona
        ? [persona.signatureLook, persona.hairStyle, persona.skinType, persona.typicalOutfit].filter(Boolean).join(', ')
        : '';

      const r = await fetch('/api/creator/persona-imagegen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId, angle: selectedAngle, extraPrompt, personaDesc }),
      });
      const d = await r.json();
      if (d.imageUrl) {
        const newImg = { url: d.imageUrl, angle: selectedAngle, label: ANGLES.find(a => a.key === selectedAngle)?.label, generatedAt: new Date().toISOString() };

        // 저장
        const saveRes = await fetch('/api/creator/persona-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personaId, imageUrl: d.imageUrl, angle: selectedAngle, label: newImg.label }),
        }).then(r2 => r2.json()).catch(() => ({}));

        const updated = saveRes.images || [newImg, ...images];
        setImages(updated);

        // front 이미지 업데이트 시 부모에 전달
        if (selectedAngle === 'front') onFrontImageUpdate?.(d.imageUrl);
      } else {
        setError(d.error || '이미지 생성 실패');
      }
    } catch (e) {
      setError(e.message);
    }
    setGenerating(false);
  };

  const handleSetPrimary = async (img) => {
    if (img.angle === 'front') {
      onFrontImageUpdate?.(img.url);
    }
    // 추후: primary 이미지 설정 API 연동
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite' }} color="#AEAEB2" />
      </div>
    );
  }

  const lightboxImages = images.filter(img => img.url);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 24 }}>
      <div style={{ maxWidth: 720 }}>

        {/* 생성 컨트롤 */}
        <div style={{ background: '#FFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1D1D1F', marginBottom: 14 }}>
            초현실 이미지 생성
            <span style={{ fontSize: 11.5, fontWeight: 400, color: '#6E6E73', marginLeft: 8 }}>FLUX 1.1 Pro Ultra · 모공 수준 초현실</span>
          </div>

          {/* 앵글 선택 */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>카메라 각도</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ANGLES.map(a => (
                <button
                  key={a.key}
                  onClick={() => setSelectedAngle(a.key)}
                  style={{
                    padding: '8px 14px', borderRadius: 8,
                    border: `1.5px solid ${selectedAngle === a.key ? '#5E6AD2' : '#E5E5EA'}`,
                    background: selectedAngle === a.key ? '#5E6AD212' : '#FFF',
                    fontSize: 12.5, fontWeight: selectedAngle === a.key ? 600 : 400,
                    color: selectedAngle === a.key ? '#5E6AD2' : '#6E6E73',
                    cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  <div>{a.label}</div>
                  <div style={{ fontSize: 10.5, color: '#AEAEB2', fontWeight: 400 }}>{a.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 추가 프롬프트 */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#6E6E73', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>추가 설정 (선택)</div>
            <input
              value={extraPrompt}
              onChange={e => setExtraPrompt(e.target.value)}
              placeholder="예: 연구실 배경, 흰 가운, 미소 짓는, 제품 들고 있는..."
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
            />
          </div>

          {error && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: '#FFF5F5', color: '#FF3B30', fontSize: 12.5, marginBottom: 12 }}>
              {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              width: '100%', padding: '12px 20px', borderRadius: 10, border: 'none',
              background: '#5E6AD2', color: '#FFF', fontSize: 13, fontWeight: 700,
              cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {generating ? (
              <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> 생성 중 (약 10-20초)...</>
            ) : (
              <><Sparkles size={15} /> 이미지 생성</>
            )}
          </button>
        </div>

        {/* 이미지 갤러리 */}
        {images.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6E6E73', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              생성된 이미지 ({images.length}장)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {images.map((img, i) => (
                <div key={i} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid #E5E5EA', cursor: 'pointer', background: '#F5F5F7' }}
                  onClick={() => setLightbox({ url: img.url, label: img.label || img.angle, index: i })}>
                  <img src={img.url} alt={img.label || img.angle} style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 8px', background: 'linear-gradient(transparent, rgba(0,0,0,0.6))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: '#FFF', fontWeight: 600 }}>{img.label || img.angle}</span>
                    <button onClick={e => { e.stopPropagation(); handleSetPrimary(img); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2 }}>
                      <Star size={12} color="#FFD60A" fill={img.isPrimary ? '#FFD60A' : 'none'} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {images.length === 0 && !generating && (
          <div style={{ textAlign: 'center', padding: 40, color: '#AEAEB2' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🖼</div>
            <div style={{ fontSize: 13 }}>아직 생성된 이미지가 없어요</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>위에서 각도를 선택하고 이미지를 생성해보세요</div>
          </div>
        )}
      </div>

      {/* 라이트박스 */}
      {lightbox && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setLightbox(null)}
        >
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 20, right: 20, border: 'none', background: 'rgba(255,255,255,0.15)', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#FFF' }}>
            <X size={18} />
          </button>
          {lightbox.index > 0 && (
            <button onClick={e => { e.stopPropagation(); setLightbox({ ...lightboxImages[lightbox.index - 1], index: lightbox.index - 1 }); }}
              style={{ position: 'absolute', left: 20, border: 'none', background: 'rgba(255,255,255,0.15)', borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={20} />
            </button>
          )}
          <img src={lightbox.url} alt={lightbox.label} onClick={e => e.stopPropagation()}
            style={{ maxHeight: '90vh', maxWidth: '80vw', borderRadius: 12, objectFit: 'contain' }} />
          {lightbox.index < lightboxImages.length - 1 && (
            <button onClick={e => { e.stopPropagation(); setLightbox({ ...lightboxImages[lightbox.index + 1], index: lightbox.index + 1 }); }}
              style={{ position: 'absolute', right: 20, border: 'none', background: 'rgba(255,255,255,0.15)', borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={20} />
            </button>
          )}
          <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', color: '#FFF', fontSize: 13, fontWeight: 600, background: 'rgba(0,0,0,0.5)', padding: '4px 12px', borderRadius: 20 }}>
            {lightbox.label}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

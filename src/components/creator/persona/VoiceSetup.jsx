// VoiceSetup.jsx — ElevenLabs 목소리 클로닝
import { useState, useEffect, useRef } from 'react';
import { Upload, Mic, CheckCircle2, Loader2, AlertCircle, Play, Square } from 'lucide-react';

export default function VoiceSetup({ personaId }) {
  const [voiceId, setVoiceId] = useState(null);
  const [voiceName, setVoiceName] = useState('');
  const [loading, setLoading] = useState(true);
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState('');

  const [audioFile, setAudioFile] = useState(null);
  const [audioPreview, setAudioPreview] = useState(null); // object URL
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!personaId) return;
    fetch(`/api/creator/voice-clone?personaId=${personaId}`)
      .then(r => r.json())
      .then(d => {
        if (d.voiceId) { setVoiceId(d.voiceId); setVoiceName(d.name || ''); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [personaId]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioFile(file);
    setAudioPreview(URL.createObjectURL(file));
    setError('');
  };

  const handleClone = async () => {
    if (!audioFile) return;
    setCloning(true);
    setError('');
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target.result.split(',')[1];
        const r = await fetch('/api/creator/voice-clone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personaId,
            audioBase64: base64,
            mimeType: audioFile.type || 'audio/mpeg',
            name: `${personaId.substring(0, 8)}-voice`,
          }),
        });
        const d = await r.json();
        if (d.voiceId) {
          setVoiceId(d.voiceId);
          setVoiceName(d.name || '');
        } else {
          setError(d.error || '목소리 클로닝 실패');
        }
        setCloning(false);
      };
      reader.readAsDataURL(audioFile);
    } catch (e) {
      setError(e.message);
      setCloning(false);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite' }} color="#AEAEB2" />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 24 }}>
      <div style={{ maxWidth: 520 }}>

        {/* 현재 클로닝 상태 */}
        {voiceId ? (
          <div style={{ background: '#F0FFF4', border: '1px solid #34C75930', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <CheckCircle2 size={20} color="#34C759" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1D1D1F' }}>목소리 클로닝 완료</div>
              <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 2 }}>
                Voice ID: <code style={{ fontFamily: 'monospace', fontSize: 11.5, background: '#F2F2F7', padding: '1px 5px', borderRadius: 4 }}>{voiceId}</code>
              </div>
              {voiceName && <div style={{ fontSize: 12, color: '#6E6E73' }}>이름: {voiceName}</div>}
            </div>
          </div>
        ) : (
          <div style={{ background: '#FFF8E6', border: '1px solid #FF950030', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 10 }}>
            <AlertCircle size={16} color="#FF9500" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12.5, color: '#6E6E73', lineHeight: 1.55 }}>
              아직 목소리 클로닝이 설정되지 않았어요. 1분 이상의 한국어 음성 샘플을 업로드하면 ElevenLabs로 실시간 클로닝합니다.
              <br /><span style={{ color: '#FF9500', fontWeight: 600 }}>영상 내 TTS 생성에 사용됩니다.</span>
            </div>
          </div>
        )}

        {/* 안내 */}
        <div style={{ background: '#FFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1D1D1F', marginBottom: 10 }}>목소리 샘플 업로드</div>
          <div style={{ fontSize: 12.5, color: '#6E6E73', lineHeight: 1.6, marginBottom: 16 }}>
            <strong>권장 사항:</strong>
            <ul style={{ marginTop: 6, paddingLeft: 18, marginBottom: 0 }}>
              <li>1분 이상의 깨끗한 음성 녹음 (MP3, WAV, M4A)</li>
              <li>한국어로 자연스럽게 말하는 내용 (독백, 설명, 일상 대화 등)</li>
              <li>배경 소음 없이 조용한 환경에서 녹음</li>
              <li>마이크 거리: 20-30cm 유지</li>
            </ul>
          </div>

          <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileSelect} style={{ display: 'none' }} />

          {audioPreview && (
            <div style={{ background: '#F5F5F7', borderRadius: 8, padding: '12px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={togglePlay} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#5E6AD2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {playing ? <Square size={12} color="#FFF" /> : <Play size={12} color="#FFF" fill="#FFF" />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: '#1D1D1F', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{audioFile?.name}</div>
                <div style={{ fontSize: 11, color: '#AEAEB2', marginTop: 1 }}>
                  {audioFile ? `${(audioFile.size / 1024 / 1024).toFixed(1)} MB` : ''}
                </div>
              </div>
              <audio ref={audioRef} src={audioPreview} onEnded={() => setPlaying(false)} />
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1.5px dashed #D0D0D8', background: '#FAFAFA', fontSize: 12.5, color: '#6E6E73', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Upload size={13} />
              {audioFile ? '다시 선택' : '음성 파일 선택'}
            </button>

            {audioFile && (
              <button
                onClick={handleClone}
                disabled={cloning}
                style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#5E6AD2', color: '#FFF', fontSize: 12.5, fontWeight: 700, cursor: cloning ? 'not-allowed' : 'pointer', opacity: cloning ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
              >
                {cloning ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Mic size={13} />}
                {cloning ? '클로닝 중...' : voiceId ? '재클로닝' : '클로닝 시작'}
              </button>
            )}
          </div>

          {error && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#FFF5F5', color: '#FF3B30', fontSize: 12.5 }}>
              {error}
            </div>
          )}
        </div>

        {/* 활용 안내 */}
        <div style={{ background: '#F5F5F7', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#6E6E73', lineHeight: 1.6 }}>
          <strong style={{ color: '#1D1D1F' }}>목소리 활용:</strong> 영상 생성 시 페르소나의 대사를 이 목소리로 TTS 합성하여 영상에 삽입합니다.
          클로닝된 목소리는 ElevenLabs에 저장되며 이 앱에서 언제든 재사용할 수 있어요.
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

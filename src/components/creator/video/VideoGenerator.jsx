// VideoGenerator.jsx — 장면별 Kling AI 영상 생성
import { useState, useEffect, useRef } from 'react';
import { Play, Loader2, CheckCircle2, AlertCircle, RefreshCw, Film, ChevronRight } from 'lucide-react';

const POLL_INTERVAL = 5000; // 5초마다 상태 확인

function SceneVideoRow({ scene, personaImageUrl, onVideoReady }) {
  const [status, setStatus] = useState('idle'); // idle | queued | processing | completed | failed
  const [requestId, setRequestId] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  const startGeneration = async () => {
    if (!personaImageUrl) {
      setError('페르소나 이미지가 없습니다. 이미지 탭에서 정면 이미지를 먼저 생성해주세요.');
      return;
    }
    setStatus('queued');
    setError('');
    try {
      const r = await fetch('/api/creator/scene-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaImageUrl,
          visualPrompt: scene.visualPrompt || '',
          dialogue: scene.dialogue || '',
          duration: (scene.endSec || 5) - (scene.startSec || 0),
        }),
      });
      const d = await r.json();
      if (d.requestId) {
        setRequestId(d.requestId);
        setStatus('queued');
      } else {
        setError(d.error || '생성 요청 실패');
        setStatus('failed');
      }
    } catch (e) {
      setError(e.message);
      setStatus('failed');
    }
  };

  // requestId 생기면 폴링 시작
  useEffect(() => {
    if (!requestId || status === 'completed' || status === 'failed') return;

    const poll = async () => {
      try {
        const r = await fetch(`/api/creator/scene-video?requestId=${requestId}`);
        const d = await r.json();
        if (d.status === 'completed' && d.videoUrl) {
          setVideoUrl(d.videoUrl);
          setStatus('completed');
          onVideoReady?.({ order: scene.order, videoUrl: d.videoUrl });
          clearInterval(pollRef.current);
        } else if (d.status === 'failed') {
          setError(d.error || '영상 생성 실패');
          setStatus('failed');
          clearInterval(pollRef.current);
        } else {
          setStatus(d.status === 'queued' ? 'queued' : 'processing');
        }
      } catch {}
    };

    pollRef.current = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [requestId]);

  const statusConfig = {
    idle:       { color: '#AEAEB2', bg: '#F5F5F7', label: '대기' },
    queued:     { color: '#FF9500', bg: '#FFF5E6', label: '큐 대기 중...' },
    processing: { color: '#5E6AD2', bg: '#F0F0FF', label: '생성 중...' },
    completed:  { color: '#34C759', bg: '#F0FFF4', label: '완료' },
    failed:     { color: '#FF3B30', bg: '#FFF5F5', label: '실패' },
  };

  const cfg = statusConfig[status];

  return (
    <div style={{ background: '#FFF', border: '1px solid #E5E5EA', borderRadius: 12, overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #F2F2F7', background: '#FAFAFA' }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: '#1D1D1F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#FFF', flexShrink: 0 }}>
          {scene.order}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {scene.dialogue?.substring(0, 50) || '장면 ' + scene.order}
          </div>
          <div style={{ fontSize: 11, color: '#AEAEB2' }}>
            {scene.cameraAngle} · {scene.startSec}s–{scene.endSec}s
          </div>
        </div>
        {/* 상태 배지 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: cfg.bg, flexShrink: 0 }}>
          {(status === 'queued' || status === 'processing') && <Loader2 size={11} color={cfg.color} style={{ animation: 'spin 0.8s linear infinite' }} />}
          {status === 'completed' && <CheckCircle2 size={11} color={cfg.color} />}
          {status === 'failed' && <AlertCircle size={11} color={cfg.color} />}
          <span style={{ fontSize: 11.5, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
        </div>
        {/* 생성 버튼 */}
        {status === 'idle' && (
          <button onClick={startGeneration} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#5E6AD2', color: '#FFF', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <Film size={12} /> 생성
          </button>
        )}
        {status === 'failed' && (
          <button onClick={startGeneration} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #E5E5EA', background: '#FFF', fontSize: 12, color: '#6E6E73', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <RefreshCw size={11} /> 재시도
          </button>
        )}
      </div>

      {/* 컨텐츠 영역 */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 12, color: '#6E6E73', lineHeight: 1.5, marginBottom: videoUrl ? 12 : 0 }}>
          {scene.visualPrompt?.substring(0, 120)}{scene.visualPrompt?.length > 120 ? '...' : ''}
        </div>
        {error && (
          <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 7, background: '#FFF5F5', color: '#FF3B30', fontSize: 12 }}>
            {error}
          </div>
        )}
        {/* 영상 미리보기 */}
        {videoUrl && (
          <video
            src={videoUrl}
            controls
            style={{ width: '100%', maxHeight: 200, borderRadius: 8, marginTop: 8, background: '#000' }}
          />
        )}
      </div>
    </div>
  );
}

export default function VideoGenerator({ draft, personaImageUrl, onVideosReady }) {
  const [sceneVideos, setSceneVideos] = useState({});
  const [generatingAll, setGeneratingAll] = useState(false);

  const scenes = draft?.scenes || [];

  const handleVideoReady = ({ order, videoUrl }) => {
    setSceneVideos(prev => {
      const updated = { ...prev, [order]: videoUrl };
      // 모든 장면이 완성되면 부모에 전달
      if (scenes.length > 0 && Object.keys(updated).length >= scenes.length) {
        const videoList = scenes.map(s => ({ order: s.order, videoUrl: updated[s.order] })).filter(v => v.videoUrl);
        onVideosReady?.(videoList);
      }
      return updated;
    });
  };

  const completedCount = Object.keys(sceneVideos).length;
  const progress = scenes.length > 0 ? (completedCount / scenes.length) * 100 : 0;

  if (!draft || scenes.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#AEAEB2', gap: 12, padding: 40 }}>
        <Film size={40} strokeWidth={1.5} />
        <div style={{ fontSize: 14, fontWeight: 500 }}>스토리보드가 없습니다</div>
        <div style={{ fontSize: 12.5, textAlign: 'center', maxWidth: 300, lineHeight: 1.6 }}>
          콘텐츠 탭에서 스토리보드를 먼저 생성해주세요
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 24 }}>
      <div style={{ maxWidth: 720 }}>
        {/* 상단 정보 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1D1D1F' }}>장면별 영상 생성</div>
            <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 2 }}>
              Kling 2.1 Pro · {scenes.length}개 장면 · {completedCount}/{scenes.length} 완료
            </div>
          </div>

          {completedCount > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 120, height: 6, borderRadius: 3, background: '#F2F2F7', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, background: '#34C759', width: `${progress}%`, transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: 12, color: '#34C759', fontWeight: 600 }}>{Math.round(progress)}%</span>
            </div>
          )}
        </div>

        {!personaImageUrl && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: '#FFF8E6', border: '1px solid #FF950030', fontSize: 13, color: '#FF9500', marginBottom: 16 }}>
            ⚠️ 페르소나 탭 → 이미지 탭에서 <strong>정면 이미지</strong>를 먼저 생성해주세요. Kling 영상 생성에 사용됩니다.
          </div>
        )}

        {/* 비용 안내 */}
        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#F5F5F7', fontSize: 12, color: '#6E6E73', marginBottom: 20, lineHeight: 1.6 }}>
          💰 예상 비용: 장면당 약 $0.84–1.96 (Kling 5-10초 클립) · 전체 {scenes.length}개 장면 ≈ ${(scenes.length * 1.5).toFixed(0)}
        </div>

        {/* 장면별 영상 생성 rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {scenes.map((scene, i) => (
            <SceneVideoRow
              key={i}
              scene={scene}
              personaImageUrl={personaImageUrl}
              onVideoReady={handleVideoReady}
            />
          ))}
        </div>

        {/* 완료 후 다음 단계 버튼 */}
        {completedCount >= scenes.length && scenes.length > 0 && (
          <div style={{ marginTop: 24, padding: '16px 20px', borderRadius: 12, background: '#F0FFF4', border: '1px solid #34C75930', display: 'flex', alignItems: 'center', gap: 12 }}>
            <CheckCircle2 size={20} color="#34C759" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1D1D1F' }}>모든 장면 영상 완성!</div>
              <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 2 }}>발행 탭에서 영상을 확인하고 업로드하세요</div>
            </div>
            <button
              onClick={() => {
                const videoList = scenes.map(s => ({ order: s.order, videoUrl: sceneVideos[s.order] })).filter(v => v.videoUrl);
                onVideosReady?.(videoList);
              }}
              style={{ marginLeft: 'auto', padding: '9px 16px', borderRadius: 8, border: 'none', background: '#34C759', color: '#FFF', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              발행으로 이동 <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

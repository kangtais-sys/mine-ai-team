import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Loader2, Link2, CheckCircle2, XCircle, HardDrive, MonitorPlay, FolderSync, Music2, X, FileVideo } from 'lucide-react';
import useChatStore from '../store/chatStore';
import { getAgent } from '../lib/agents';

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function CreatorToolbar() {
  const [status, setStatus] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [showFiles, setShowFiles] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true') {
      const email = params.get('email') || '';
      localStorage.setItem('google_connected', 'true');
      localStorage.setItem('google_email', email);
      setStatus({ connected: true, email });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (localStorage.getItem('google_connected') === 'true') {
      setStatus({ connected: true, email: localStorage.getItem('google_email') || '' });
      fetch('/api/auth/google-status').then(r => r.json()).then(data => {
        if (!data.connected) { localStorage.removeItem('google_connected'); localStorage.removeItem('google_email'); }
        setStatus(data);
      }).catch(() => {});
    } else {
      fetch('/api/auth/google-status').then(r => r.json()).then(data => {
        if (data.connected) { localStorage.setItem('google_connected', 'true'); localStorage.setItem('google_email', data.email || ''); }
        setStatus(data);
      }).catch(() => setStatus({ connected: false }));
    }
    fetch('/api/upload-status').then(r => r.json()).then(setUploadStatus).catch(() => setUploadStatus({ pending: 0, recent: [] }));
  }, []);

  const connected = status?.connected;
  const hasTiktok = !!localStorage.getItem('tiktok_connected');
  const recent = uploadStatus?.recent || [];
  const lastUpload = recent[0];
  const lastFailed = lastUpload && (lastUpload.tiktok?.success === false || lastUpload.youtube?.success === false);
  const lastSuccess = lastUpload && !lastFailed;

  const chip = (icon, label, ok) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: 4,
      background: ok ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${ok ? 'rgba(34,197,94,0.15)' : '#1F1F1F'}`,
    }}>
      {icon}
      <span style={{ fontSize: 11, color: ok ? '#22C55E' : '#555', fontWeight: 500 }}>{label}</span>
    </div>
  );

  if (!connected) {
    return (
      <div style={{ padding: '10px 28px', borderBottom: '1px solid #1A1A1A', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button
          onClick={() => { window.location.href = '/api/auth/google'; }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 6,
            border: '1px solid #242424', background: 'transparent',
            color: '#888', fontSize: 12, cursor: 'pointer',
            fontFamily: 'inherit', transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#CCC'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#242424'; e.currentTarget.style.color = '#888'; }}
        >
          <Link2 size={13} />
          구글 계정 연동
          <span style={{ fontSize: 11, color: '#555', marginLeft: 4 }}>Drive + YouTube</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ borderBottom: '1px solid #1A1A1A', flexShrink: 0 }}>
      {/* Status Row */}
      <div style={{ padding: '8px 28px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {chip(<CheckCircle2 size={11} color="#22C55E" />, status.email || '구글 연결됨', true)}
        {chip(<MonitorPlay size={11} color="#22C55E" />, '유튜브', true)}
        {chip(<Music2 size={11} color={hasTiktok ? '#22C55E' : '#555'} />, '틱톡', hasTiktok)}
        <div
          onClick={() => setShowFiles(!showFiles)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 8px', borderRadius: 4,
            background: uploadStatus?.pending > 0 ? 'rgba(94,106,210,0.08)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${uploadStatus?.pending > 0 ? 'rgba(94,106,210,0.2)' : '#1F1F1F'}`,
            cursor: 'pointer',
          }}
        >
          <HardDrive size={11} color={uploadStatus?.pending > 0 ? '#5E6AD2' : '#555'} />
          <span style={{ fontSize: 11, color: uploadStatus?.pending > 0 ? '#5E6AD2' : '#555', fontWeight: 500 }}>
            대기 {uploadStatus?.pending ?? '?'}건
          </span>
        </div>
        {chip(<FolderSync size={11} color="#5E6AD2" />, '매일 자동', true)}

        {/* Last Upload Status */}
        <div style={{ flex: 1 }} />
        {lastSuccess && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <CheckCircle2 size={11} color="#22C55E" />
            <span style={{ fontSize: 11, color: '#22C55E' }}>
              업로드 완료 — 틱톡 + 유튜브 {timeAgo(lastUpload.timestamp)}
            </span>
          </div>
        )}
        {lastFailed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <XCircle size={11} color="#EF4444" />
            <span style={{ fontSize: 11, color: '#EF4444' }}>
              업로드 실패 — {lastUpload.tiktok?.error || lastUpload.youtube?.error || '오류 확인 필요'}
            </span>
          </div>
        )}
      </div>

      {/* Pending Files Popup */}
      {showFiles && (
        <div style={{
          margin: '0 28px 8px', padding: 12, borderRadius: 8,
          background: '#141414', border: '1px solid #242424',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5' }}>드라이브 대기 파일</span>
            <button onClick={() => setShowFiles(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
              <X size={14} color="#555" />
            </button>
          </div>
          {recent.length === 0 && uploadStatus?.pending === 0 ? (
            <div style={{ fontSize: 12, color: '#555', padding: '8px 0' }}>대기 중인 파일이 없습니다.</div>
          ) : (
            <>
              {uploadStatus?.pending > 0 && (
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>
                  "MINE 업로드" 폴더에 {uploadStatus.pending}개 영상 대기 중
                </div>
              )}
              {recent.length > 0 && (
                <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>최근 업로드:</div>
              )}
              {recent.slice(0, 5).map((log, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                  borderBottom: i < Math.min(recent.length, 5) - 1 ? '1px solid #1F1F1F' : 'none',
                }}>
                  <FileVideo size={12} color="#5E6AD2" />
                  <span style={{ fontSize: 11, color: '#CCC', flex: 1 }}>{log.fileName}</span>
                  <span style={{ fontSize: 10, color: log.tiktok?.success !== false && log.youtube?.success !== false ? '#22C55E' : '#EF4444' }}>
                    {log.tiktok?.success !== false && log.youtube?.success !== false ? '완료' : '실패'}
                  </span>
                  <span style={{ fontSize: 10, color: '#444' }}>{timeAgo(log.timestamp)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChatView() {
  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const endRef = useRef(null);
  const { activeAgent, conversations, isLoading, sendMessage } = useChatStore();
  const agent = getAgent(activeAgent);
  const messages = conversations[activeAgent] || [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendMessage(activeAgent, text);
  };

  const Icon = agent.icon;
  const isCreator = activeAgent === 'creator';

  const quickActions = {
    chief: ['오늘 전체 브리핑해줘', '이번 주 주요 일정 정리', '긴급 이슈 있어?'],
    creator: ['인스타 릴스 기획해줘', '이번 주 콘텐츠 캘린더', 'SEO 블로그 글 써줘'],
    community: ['오늘 DM 요약해줘', '댓글 분석 리포트', '악성댓글 현황'],
    cs: ['오늘 상담 현황', '불만 고객 리스트', 'FAQ 업데이트해줘'],
    marketer: ['이번 달 성과 분석', '트렌드 리포트', '광고 ROI 분석'],
    admin: ['이번 달 매출 현황', '정부지원사업 공고', '재고 현황 체크'],
    product: ['신제품 트렌드 분석', '경쟁사 신제품 모니터링', '상품 기획서 작성'],
    global: ['수출 현황 보고', '환율 변동 리포트', '바이어 컨택 메일 작성'],
  };

  return (
    <>
      {/* Header */}
      <div style={{
        height: 48,
        minHeight: 48,
        padding: '0 28px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '1px solid #1A1A1A',
        flexShrink: 0,
      }}>
        <Icon size={16} strokeWidth={1.5} color="#666" />
        <span style={{ fontSize: 15, fontWeight: 600, color: '#F5F5F5' }}>{agent.name}</span>
        <span style={{ fontSize: 14, color: '#555' }}>{agent.title}</span>
      </div>

      {/* Creator Toolbar - only for AI 크리에이터 */}
      {isCreator && <CreatorToolbar />}

      {/* Messages Area */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {messages.length === 0 ? (
          <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 28,
          }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: '#141414',
              border: '1px solid #242424',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}>
              <Icon size={22} strokeWidth={1.5} color="#5E6AD2" />
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#F5F5F5', marginBottom: 6 }}>{agent.name}</div>
            <div style={{ fontSize: 14, color: '#777', marginBottom: 40 }}>{agent.description}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 520 }}>
              {(quickActions[activeAgent] || []).map((action, i) => (
                <button
                  key={i}
                  onClick={() => setInput(action)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid #242424',
                    background: 'transparent',
                    color: '#888',
                    fontSize: 14,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#CCC'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#242424'; e.currentTarget.style.color = '#888'; }}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ marginBottom: 24 }}>
                {msg.role === 'user' ? (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{
                      background: '#5E6AD2',
                      color: '#FFFFFF',
                      borderRadius: '16px 16px 4px 16px',
                      padding: '12px 18px',
                      maxWidth: '70%',
                      fontSize: 14,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: '#141414',
                        border: '1px solid #242424',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Icon size={12} strokeWidth={2} color="#5E6AD2" />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#666' }}>{agent.name}</span>
                    </div>
                    <div style={{
                      paddingLeft: 30,
                      fontSize: 14,
                      lineHeight: 1.75,
                      color: '#DDD',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {msg.content}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 30 }}>
                <Loader2 size={16} color="#555" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div style={{
        padding: '12px 28px 20px',
        flexShrink: 0,
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#141414',
            border: `1px solid ${inputFocused ? '#333' : '#242424'}`,
            borderRadius: 12,
            padding: '12px 16px',
            transition: 'border-color 0.15s',
          }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={`${agent.name}에게 메시지 보내기...`}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#E8E8E8',
                fontSize: 14,
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || isLoading}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                border: 'none',
                background: input.trim() && !isLoading ? '#5E6AD2' : '#222',
                color: input.trim() && !isLoading ? '#FFF' : '#555',
                cursor: input.trim() && !isLoading ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
            >
              <ArrowUp size={16} strokeWidth={2} />
            </button>
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: '#444', marginTop: 8 }}>
            Claude API (claude-sonnet-4-20250514)
          </div>
        </div>
      </div>
    </>
  );
}

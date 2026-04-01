import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Loader2, Link2, CheckCircle2, HardDrive, MonitorPlay, FolderSync } from 'lucide-react';
import useChatStore from '../store/chatStore';
import { getAgent } from '../lib/agents';

function CreatorToolbar() {
  const [status, setStatus] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true') {
      setStatus({ connected: true, email: params.get('email') });
      window.history.replaceState({}, '', '/');
    } else {
      fetch('/api/auth/google-status')
        .then(r => r.json())
        .then(setStatus)
        .catch(() => setStatus({ connected: false }));
    }

    fetch('/api/upload-status')
      .then(r => r.json())
      .then(setUploadStatus)
      .catch(() => setUploadStatus({ pending: 0, recent: [] }));
  }, []);

  const connected = status?.connected;

  const statusItem = (icon, label, ok, detail) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon}
      <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
      <span style={{
        fontSize: 11, fontWeight: 500,
        color: ok ? '#22C55E' : '#555',
      }}>
        {detail}
      </span>
    </div>
  );

  return (
    <div style={{
      padding: '10px 28px',
      borderBottom: '1px solid #1A1A1A',
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      flexShrink: 0,
    }}>
      {connected ? (
        <>
          {statusItem(
            <CheckCircle2 size={13} color="#22C55E" />,
            '구글',
            true,
            status.email || '연결됨'
          )}
          {statusItem(
            <HardDrive size={13} color={connected ? '#5E6AD2' : '#555'} />,
            '드라이브',
            true,
            uploadStatus ? `대기 ${uploadStatus.pending}건` : '확인 중...'
          )}
          {statusItem(
            <MonitorPlay size={13} color={connected ? '#EF4444' : '#555'} />,
            '유튜브',
            true,
            '연결됨'
          )}
          {statusItem(
            <FolderSync size={13} color={connected ? '#5E6AD2' : '#555'} />,
            '자동 업로드',
            true,
            '5분마다 감시 중'
          )}
        </>
      ) : (
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
          <span style={{ fontSize: 11, color: '#555', marginLeft: 4 }}>Drive + YouTube 권한</span>
        </button>
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

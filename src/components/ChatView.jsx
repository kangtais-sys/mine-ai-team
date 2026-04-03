import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Loader2, Link2, CheckCircle2, XCircle, HardDrive, MonitorPlay, FolderSync, Music2, X, FileVideo, LogOut, TrendingUp, TrendingDown, Users, Eye, MessageCircle, DollarSign, Star, Globe, Package, Headphones, ShoppingCart, FileText, BarChart3 } from 'lucide-react';
import useChatStore from '../store/chatStore';
import { getAgent } from '../lib/agents';

// ─── Helpers ────────────────────────────────────────────────

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

const fmt = (v) => {
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억`;
  if (v >= 10000000) return `${(v / 10000000).toFixed(1)}천만`;
  if (v >= 10000) return `${(v / 10000).toFixed(0)}만`;
  return v.toLocaleString();
};

// ─── KPI Card Component ─────────────────────────────────────

function KpiCard({ label, value, delta, up, icon: Icon }) {
  return (
    <div style={{
      background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#777', fontWeight: 500 }}>{label}</span>
        {Icon && <Icon size={13} strokeWidth={1.5} color="#444" />}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#FFF', lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      {delta && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 6 }}>
          {up ? <TrendingUp size={11} color="#22C55E" /> : <TrendingDown size={11} color="#EF4444" />}
          <span style={{ fontSize: 11, color: up ? '#22C55E' : '#EF4444', fontWeight: 500 }}>{delta}</span>
        </div>
      )}
    </div>
  );
}

function StatusChip({ icon, label, ok, error, onClick }) {
  const color = error ? '#EF4444' : ok ? '#22C55E' : '#555';
  const bg = error ? 'rgba(239,68,68,0.08)' : ok ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)';
  const border = error ? 'rgba(239,68,68,0.2)' : ok ? 'rgba(34,197,94,0.15)' : '#1F1F1F';
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 4,
      background: bg, border: `1px solid ${border}`, cursor: onClick ? 'pointer' : 'default',
    }}>
      {icon}
      <span style={{ fontSize: 11, color, fontWeight: 500 }}>{label}</span>
    </div>
  );
}

// ─── Agent-Specific KPI Dashboards ──────────────────────────

const AGENT_DASHBOARDS = {
  chief: () => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <KpiCard label="오늘 처리 업무" value="47건" delta="+12건" up icon={FileText} />
        <KpiCard label="활성 에이전트" value="8/8" delta="전원 가동" up icon={Users} />
        <KpiCard label="긴급 이슈" value="2건" delta="+1건" up={false} icon={XCircle} />
        <KpiCard label="주간 완료율" value="94%" delta="+3%" up icon={CheckCircle2} />
      </div>
      <div style={{ marginTop: 12, background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>팀 현황</div>
        {[
          { name: 'AI 크리에이터', status: '릴스 3개 제작 중', color: '#5E6AD2' },
          { name: 'AI 커뮤니티', status: 'DM 24건 응대 완료', color: '#22C55E' },
          { name: 'AI CS매니저', status: '교환 3건 처리 중', color: '#F59E0B' },
          { name: 'AI 마케터', status: '주간 리포트 생성 완료', color: '#22C55E' },
          { name: 'AI 글로벌', status: '일본 바이어 5건 컨택', color: '#5E6AD2' },
        ].map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < 4 ? '1px solid #1F1F1F' : 'none' }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: t.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#CCC', width: 90 }}>{t.name}</span>
            <span style={{ fontSize: 11, color: '#777' }}>{t.status}</span>
          </div>
        ))}
      </div>
    </>
  ),

  creator: () => {
    const [gStatus, setGStatus] = useState(null);
    const [uploadStatus, setUploadStatus] = useState(null);
    const hasTiktok = localStorage.getItem('tiktok_connected') === 'true';

    useEffect(() => {
      if (localStorage.getItem('google_connected') === 'true') {
        setGStatus({ connected: true, email: localStorage.getItem('google_email') || '' });
      } else {
        fetch('/api/auth/google-status').then(r => r.json()).then(setGStatus).catch(() => setGStatus({ connected: false }));
      }
      fetch('/api/upload-status').then(r => r.json()).then(setUploadStatus).catch(() => setUploadStatus({ pending: 0, recent: [] }));
    }, []);

    const connected = gStatus?.connected;
    const recent = uploadStatus?.recent || [];
    const lastUpload = recent[0];

    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="이번 달 콘텐츠" value="156건" delta="+8건" up icon={FileText} />
          <KpiCard label="총 조회수" value={fmt(4820000)} delta="+18.2%" up icon={Eye} />
          <KpiCard label="인게이지먼트" value="4.8%" delta="+0.3%" up icon={TrendingUp} />
          <KpiCard label="수익" value={fmt(3200000) + '원'} delta="+22%" up icon={DollarSign} />
        </div>
        {/* API Connections */}
        <div style={{ marginTop: 12, background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>API 연동 상태</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <StatusChip icon={<CheckCircle2 size={11} color={connected ? '#22C55E' : '#555'} />} label={connected ? (gStatus.email || '구글 연결됨') : '구글 미연결'} ok={connected} onClick={connected ? undefined : () => { window.location.href = '/api/auth/google'; }} />
              {connected && (
                <button onClick={() => { localStorage.removeItem('google_connected'); localStorage.removeItem('google_email'); document.cookie='google_connected=;Path=/;Max-Age=0'; document.cookie='google_refresh_token=;Path=/;Max-Age=0'; document.cookie='google_access_token=;Path=/;Max-Age=0'; setGStatus({ connected: false }); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#555', fontFamily: 'inherit' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#EF4444'} onMouseLeave={e => e.currentTarget.style.color = '#555'}>해제</button>
              )}
            </div>
            <StatusChip icon={<MonitorPlay size={11} color={connected ? '#22C55E' : '#555'} />} label={connected ? '유튜브 연결됨' : '유튜브 미연결'} ok={connected} />
            <StatusChip icon={<Music2 size={11} color={hasTiktok ? '#22C55E' : '#555'} />} label={hasTiktok ? '틱톡 연결됨' : '틱톡 미연결'} ok={hasTiktok} onClick={hasTiktok ? undefined : () => { window.location.href = '/api/auth/tiktok'; }} />
            <StatusChip icon={<HardDrive size={11} color={connected ? '#5E6AD2' : '#555'} />} label={`드라이브 대기 ${uploadStatus?.pending ?? '?'}건`} ok={connected} />
            <StatusChip icon={<FolderSync size={11} color="#5E6AD2" />} label="자동 업로드 5분마다" ok />
          </div>
          {lastUpload && (
            <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 4, background: lastUpload.tiktok?.success !== false && lastUpload.youtube?.success !== false ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${lastUpload.tiktok?.success !== false && lastUpload.youtube?.success !== false ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'}` }}>
              <span style={{ fontSize: 11, color: lastUpload.tiktok?.success !== false && lastUpload.youtube?.success !== false ? '#22C55E' : '#EF4444' }}>
                {lastUpload.tiktok?.success !== false && lastUpload.youtube?.success !== false ? '최근 업로드 성공' : '최근 업로드 실패'} — {lastUpload.fileName} ({timeAgo(lastUpload.timestamp)})
              </span>
            </div>
          )}
        </div>
      </>
    );
  },

  community: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <KpiCard label="오늘 댓글" value="342건" delta="+28%" up icon={MessageCircle} />
      <KpiCard label="오늘 DM" value="89건" delta="+15건" up icon={MessageCircle} />
      <KpiCard label="응대 완료" value="98.2%" delta="+1.2%" up icon={CheckCircle2} />
      <KpiCard label="악성댓글 차단" value="12건" delta="-3건" up icon={XCircle} />
      <KpiCard label="VIP 팔로워" value="1,247명" delta="+32명" up icon={Star} />
      <KpiCard label="팔로워 증가" value="+1,840" delta="+22%" up icon={Users} />
    </div>
  ),

  cs: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <KpiCard label="오늘 상담" value="67건" delta="+8건" up icon={Headphones} />
      <KpiCard label="평균 응답시간" value="2.3분" delta="-0.5분" up icon={TrendingUp} />
      <KpiCard label="만족도" value="4.8/5" delta="+0.2" up icon={Star} />
      <KpiCard label="불만 접수" value="3건" delta="-2건" up icon={XCircle} />
      <KpiCard label="교환/환불" value="5건" delta="-1건" up icon={ShoppingCart} />
      <KpiCard label="FAQ 히트" value="234건" delta="+45건" up icon={FileText} />
    </div>
  ),

  marketer: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <KpiCard label="월 매출" value={fmt(48500000) + '원'} delta="+12.8%" up icon={DollarSign} />
      <KpiCard label="광고 ROAS" value="4.2x" delta="+0.8x" up icon={TrendingUp} />
      <KpiCard label="CAC" value={fmt(8500) + '원'} delta="-12%" up icon={Users} />
      <KpiCard label="전환율" value="3.8%" delta="+0.5%" up icon={ShoppingCart} />
      <KpiCard label="메타 광고비" value={fmt(5200000) + '원'} delta="+8%" up={false} icon={DollarSign} />
      <KpiCard label="네이버 SA" value={fmt(3100000) + '원'} delta="+15%" up={false} icon={BarChart3} />
    </div>
  ),

  admin: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <KpiCard label="월 매출" value={fmt(48500000) + '원'} delta="+12.8%" up icon={DollarSign} />
      <KpiCard label="월 비용" value={fmt(31200000) + '원'} delta="+5%" up={false} icon={DollarSign} />
      <KpiCard label="영업이익" value={fmt(17300000) + '원'} delta="+28%" up icon={TrendingUp} />
      <KpiCard label="재고 SKU" value="48종" delta="-2종" up icon={Package} />
      <KpiCard label="정부지원 신청" value="3건" delta="마감 D-7" up icon={FileText} />
      <KpiCard label="미수금" value={fmt(2400000) + '원'} delta="-15%" up icon={DollarSign} />
    </div>
  ),

  product: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <KpiCard label="신제품 기획" value="3건" delta="+1건" up icon={Package} />
      <KpiCard label="평균 리뷰 평점" value="4.6/5" delta="+0.1" up icon={Star} />
      <KpiCard label="리뷰 분석" value="2,847건" delta="+342건" up icon={MessageCircle} />
      <KpiCard label="경쟁사 모니터링" value="12 브랜드" delta="+2" up icon={Eye} />
      <KpiCard label="평균 원가율" value="32%" delta="-2%" up icon={TrendingUp} />
      <KpiCard label="예상 마진율" value="58%" delta="+3%" up icon={DollarSign} />
    </div>
  ),

  global: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <KpiCard label="해외 매출" value={fmt(4500000) + '원'} delta="+24%" up icon={Globe} />
      <KpiCard label="일본" value={fmt(2100000) + '원'} delta="+18%" up icon={DollarSign} />
      <KpiCard label="미국" value={fmt(1400000) + '원'} delta="+32%" up icon={DollarSign} />
      <KpiCard label="동남아" value={fmt(1000000) + '원'} delta="+45%" up icon={DollarSign} />
      <KpiCard label="바이어 컨택" value="23건" delta="+8건" up icon={Users} />
      <KpiCard label="환율 USD" value="1,342원" delta="-0.8%" up icon={TrendingDown} />
    </div>
  ),
};

// ─── Main ChatView Component ────────────────────────────────

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

  // Handle OAuth callbacks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true') {
      localStorage.setItem('google_connected', 'true');
      localStorage.setItem('google_email', params.get('email') || '');
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('tiktok_connected') === 'true') {
      localStorage.setItem('tiktok_connected', 'true');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const send = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendMessage(activeAgent, text);
  };

  const Icon = agent.icon;
  const AgentDashboard = AGENT_DASHBOARDS[activeAgent];

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
        height: 48, minHeight: 48, padding: '0 20px',
        display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: '1px solid #1A1A1A', flexShrink: 0,
      }}>
        <Icon size={16} strokeWidth={1.5} color="#666" />
        <span style={{ fontSize: 15, fontWeight: 600, color: '#F5F5F5' }}>{agent.name}</span>
        <span style={{ fontSize: 13, color: '#555' }}>{agent.title}</span>
      </div>

      {/* Split Layout: Chat 55% + Dashboard 45% */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* LEFT: Chat Area (55%) */}
        <div style={{ width: '55%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #1A1A1A' }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {messages.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#141414', border: '1px solid #242424', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Icon size={20} strokeWidth={1.5} color="#5E6AD2" />
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#F5F5F5', marginBottom: 4 }}>{agent.name}</div>
                <div style={{ fontSize: 13, color: '#777', marginBottom: 24 }}>{agent.description}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 400 }}>
                  {(quickActions[activeAgent] || []).map((action, i) => (
                    <button key={i} onClick={() => setInput(action)}
                      style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #242424', background: 'transparent', color: '#888', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#CCC'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#242424'; e.currentTarget.style.color = '#888'; }}>
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ padding: 16 }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ marginBottom: 20 }}>
                    {msg.role === 'user' ? (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ background: '#5E6AD2', color: '#FFF', borderRadius: '14px 14px 4px 14px', padding: '10px 16px', maxWidth: '80%', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <div style={{ width: 20, height: 20, borderRadius: 5, background: '#141414', border: '1px solid #242424', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon size={10} strokeWidth={2} color="#5E6AD2" />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 500, color: '#666' }}>{agent.name}</span>
                        </div>
                        <div style={{ paddingLeft: 26, fontSize: 13, lineHeight: 1.75, color: '#DDD', whiteSpace: 'pre-wrap' }}>
                          {msg.content}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 26 }}>
                    <Loader2 size={14} color="#555" style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: '10px 16px 16px', flexShrink: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#141414', border: `1px solid ${inputFocused ? '#333' : '#242424'}`,
              borderRadius: 10, padding: '10px 14px', transition: 'border-color 0.15s',
            }}>
              <input type="text" value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
                onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)}
                placeholder={`${agent.name}에게 메시지...`}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#E8E8E8', fontSize: 13, fontFamily: 'inherit' }} />
              <button onClick={send} disabled={!input.trim() || isLoading}
                style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: input.trim() && !isLoading ? '#5E6AD2' : '#222', color: input.trim() && !isLoading ? '#FFF' : '#555', cursor: input.trim() && !isLoading ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', flexShrink: 0 }}>
                <ArrowUp size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Agent KPI Dashboard (45%) */}
        <div style={{ width: '45%', overflowY: 'auto', padding: 16, background: '#0A0A0A' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Icon size={14} strokeWidth={1.5} color="#5E6AD2" />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {agent.name} Dashboard
            </span>
          </div>
          {AgentDashboard && <AgentDashboard />}
        </div>
      </div>
    </>
  );
}

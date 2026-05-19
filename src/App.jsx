import { useState, useEffect, Component } from 'react';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import Dashboard from './components/Dashboard';
import ChannelView from './components/ChannelView';
import CreatorView from './components/CreatorView';
import CreatorShell from './components/creator/CreatorShell';
import useChatStore from './store/chatStore';

// 에러 바운더리 — 컴포넌트 크래시 시 검정 화면 대신 오류 메시지 표시
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, padding: 32 }}>
          <div style={{ fontSize: 28 }}>⚠️</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1D1D1F' }}>화면 로딩 중 오류가 발생했습니다</div>
          <div style={{ fontSize: 12, color: '#6E6E73', maxWidth: 400, textAlign: 'center', wordBreak: 'break-all' }}>
            {this.state.error?.message || '알 수 없는 오류'}
          </div>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); }}
            style={{ marginTop: 8, padding: '8px 20px', borderRadius: 8, border: '1px solid #E5E5EA', background: '#FFF', fontSize: 13, cursor: 'pointer' }}
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Parse hash → { page, agentId }
// #           → dashboard
// #dashboard  → dashboard
// #channel    → channel
// #chat/chief → chat + chief
function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [page, agentId] = raw.split('/');
  return { page: page || 'dashboard', agentId: agentId || null };
}

function buildHash(page, agentId) {
  return agentId ? `#${page}/${agentId}` : `#${page}`;
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const setActiveAgent = useChatStore(s => s.setActiveAgent);

  // 긴급 승인 대기 배지용 카운트
  const [urgentCount, setUrgentCount] = useState(0);

  const fetchUrgentCount = async () => {
    try {
      const res = await fetch('/api/channel/approval');
      const data = await res.json();
      if (data && !data.error) {
        const ym = (data.yuminhye || []).filter(i => i.status === 'pending').length;
        const mm = (data.millimilli || []).filter(i => i.status === 'pending').length;
        setUrgentCount(ym + mm);
      }
    } catch {}
  };

  // 마운트 시 + 5분마다 긴급 카운트 갱신
  useEffect(() => {
    fetchUrgentCount();
    const interval = setInterval(fetchUrgentCount, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync hash → state (back/forward navigation, hard refresh)
  useEffect(() => {
    const onHash = () => {
      const r = parseHash();
      setRoute(r);
      if (r.page === 'chat' && r.agentId) setActiveAgent(r.agentId);
    };
    window.addEventListener('hashchange', onHash);
    // On mount: sync active agent if hash points to chat
    if (route.page === 'chat' && route.agentId) setActiveAgent(route.agentId);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Navigate programmatically (used by Sidebar)
  const navigate = (page, agentId = null) => {
    const r = { page, agentId };
    window.location.hash = buildHash(page, agentId);
    setRoute(r);
    if (page === 'chat' && agentId) setActiveAgent(agentId);
  };

  const { page } = route;

  return (
    <div style={{ display: 'flex', width: '100%', height: '100vh', overflow: 'hidden', background: '#F5F5F7' }}>
      <div style={{ width: 240, minWidth: 240, maxWidth: 240, height: '100vh', position: 'fixed', left: 0, top: 0, zIndex: 50 }}>
        <Sidebar route={route} onNavigate={navigate} urgentCount={urgentCount} />
      </div>
      <div style={{ marginLeft: 240, width: 'calc(100vw - 240px)', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#F5F5F7' }}>
        {page === 'dashboard' && <ErrorBoundary><Dashboard urgentCount={urgentCount} /></ErrorBoundary>}
        {page === 'channel' && <ErrorBoundary><ChannelView /></ErrorBoundary>}
        {page === 'creator' && <ErrorBoundary><CreatorShell /></ErrorBoundary>}
        {page === 'chat' && <ErrorBoundary><ChatView /></ErrorBoundary>}
      </div>
    </div>
  );
}

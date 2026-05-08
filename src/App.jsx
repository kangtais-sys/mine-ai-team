import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import Dashboard from './components/Dashboard';
import ChannelView from './components/ChannelView';
import useChatStore from './store/chatStore';

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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F5F5F7' }}>
      <div style={{ width: 240, minWidth: 240, maxWidth: 240, height: '100vh', position: 'fixed', left: 0, top: 0, zIndex: 50 }}>
        <Sidebar route={route} onNavigate={navigate} />
      </div>
      <div style={{ marginLeft: 240, width: 'calc(100vw - 240px)', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#F5F5F7' }}>
        {page === 'dashboard' && <Dashboard />}
        {page === 'channel' && <ChannelView />}
        {page === 'chat' && <ChatView />}
      </div>
    </div>
  );
}

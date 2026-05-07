import { useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import Dashboard from './components/Dashboard';
import ExportsView from './components/ExportsView';

export default function App() {
  const [page, setPage] = useState('dashboard');

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F5F5F7' }}>
      <div style={{ width: 240, minWidth: 240, maxWidth: 240, height: '100vh', position: 'fixed', left: 0, top: 0, zIndex: 50 }}>
        <Sidebar page={page} onNavigate={setPage} />
      </div>
      <div style={{ marginLeft: 240, width: 'calc(100vw - 240px)', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#F5F5F7' }}>
        {page === 'dashboard' && <Dashboard />}
        {page === 'exports' && <ExportsView />}
        {page === 'chat' && <ChatView />}
      </div>
    </div>
  );
}

import { useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import Dashboard from './components/Dashboard';

export default function App() {
  const [page, setPage] = useState('dashboard');

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar - fixed 240px */}
      <div style={{ width: 240, minWidth: 240, maxWidth: 240, height: '100vh', position: 'fixed', left: 0, top: 0, zIndex: 50 }}>
        <Sidebar page={page} onNavigate={setPage} />
      </div>

      {/* Main - takes remaining space */}
      <div style={{ marginLeft: 240, width: 'calc(100vw - 240px)', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {page === 'dashboard' ? <Dashboard /> : <ChatView />}
      </div>
    </div>
  );
}

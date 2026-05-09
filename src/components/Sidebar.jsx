import { agents } from '../lib/agents';
import { LayoutDashboard } from 'lucide-react';

export default function Sidebar({ route, onNavigate, urgentCount = 0 }) {
  const { page, agentId } = route || {};

  const menuItem = (active, icon, label, onClick, badge = 0) => (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        height: 32,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '0 8px',
        border: 'none',
        borderRadius: 6,
        background: active ? '#EBEBEF' : 'transparent',
        color: active ? '#1D1D1F' : '#6E6E73',
        cursor: 'pointer',
        fontSize: 13.5,
        fontWeight: active ? 500 : 400,
        fontFamily: 'inherit',
        textAlign: 'left',
        transition: 'background 0.12s, color 0.12s',
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = '#F2F2F5'; e.currentTarget.style.color = '#1D1D1F'; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6E6E73'; } }}
    >
      {icon}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {badge > 0 && (
        <span style={{
          background: '#FF3B30',
          color: '#FFF',
          fontSize: 9,
          fontWeight: 700,
          padding: '1px 5px',
          borderRadius: 8,
          minWidth: 16,
          textAlign: 'center',
          lineHeight: '14px',
          flexShrink: 0,
        }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );

  return (
    <div style={{ width: 240, height: '100vh', background: '#FFFFFF', borderRight: '1px solid #E5E5EA', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Logo */}
      <div style={{ height: 56, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #E5E5EA', flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: '#1D1D1F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 28 28" fill="none">
            <path d="M7 20V8L14 16L21 8V20" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1D1D1F', lineHeight: 1.2 }}>MILLI AI</div>
          <div style={{ fontSize: 11, color: '#AEAEB2', lineHeight: 1.2 }}>Millius Corp.</div>
        </div>
      </div>

      {/* Top nav: Dashboard */}
      <div style={{ padding: '8px 8px 0', flexShrink: 0 }}>
        {menuItem(
          page === 'dashboard',
          <LayoutDashboard size={15} strokeWidth={1.8} />,
          '대시보드',
          () => onNavigate('dashboard'),
          0
        )}
      </div>

      {/* Section Label */}
      <div style={{ padding: '14px 14px 5px', fontSize: 10.5, fontWeight: 600, color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>
        Agents
      </div>

      {/* Agent List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px', minHeight: 0 }}>
        {agents.map((agent) => {
          const Icon = agent.icon;
          const isActive = page === 'chat' && agentId === agent.id;
          // AI 채널운영 에이전트에 긴급 배지
          const badge = agent.id === 'channel' ? urgentCount : 0;
          return (
            <div key={agent.id} style={{ marginBottom: 1 }}>
              {menuItem(
                isActive,
                <Icon size={15} strokeWidth={1.8} />,
                agent.name,
                () => onNavigate('chat', agent.id),
                badge
              )}
            </div>
          );
        })}
      </div>

      {/* User Profile */}
      <div style={{ height: 52, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid #E5E5EA', flexShrink: 0 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#1D1D1F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#FFF', flexShrink: 0 }}>
          M
        </div>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: '#1D1D1F', lineHeight: 1.2 }}>유민혜</div>
          <div style={{ fontSize: 11, color: '#AEAEB2', lineHeight: 1.2 }}>Millius Corp. 대표</div>
        </div>
      </div>
    </div>
  );
}

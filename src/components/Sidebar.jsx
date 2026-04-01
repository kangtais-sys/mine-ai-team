import { agents } from '../lib/agents';
import useChatStore from '../store/chatStore';
import { LayoutDashboard } from 'lucide-react';

export default function Sidebar({ page, onNavigate }) {
  const { activeAgent, setActiveAgent } = useChatStore();

  const menuItem = (active, icon, label, onClick) => (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        height: 32,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 8px',
        border: 'none',
        borderRadius: 6,
        background: active ? '#1F1F1F' : 'transparent',
        color: active ? '#FFFFFF' : '#808080',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: active ? 500 : 400,
        fontFamily: 'inherit',
        textAlign: 'left',
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = '#1A1A1A';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      {icon}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  );

  return (
    <div style={{
      width: 240,
      height: '100vh',
      background: '#0A0A0A',
      borderRight: '1px solid #1A1A1A',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Workspace */}
      <div style={{
        height: 56,
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: '1px solid #1A1A1A',
        flexShrink: 0,
      }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: 'linear-gradient(135deg, #5E6AD2, #8B5CF6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>M</span>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F5F5', lineHeight: 1.2 }}>MINE AI</div>
          <div style={{ fontSize: 11, color: '#555', lineHeight: 1.2 }}>MILLIMILLI Team</div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ padding: '8px 8px 0', flexShrink: 0 }}>
        {menuItem(
          page === 'dashboard',
          <LayoutDashboard size={16} strokeWidth={1.8} />,
          '대시보드',
          () => onNavigate('dashboard')
        )}
      </div>

      {/* Section Label */}
      <div style={{
        padding: '16px 16px 6px',
        fontSize: 11,
        fontWeight: 600,
        color: '#4A4A4A',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        flexShrink: 0,
      }}>
        Agents
      </div>

      {/* Agent List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 8px 8px',
        minHeight: 0,
      }}>
        {agents.map((agent) => {
          const Icon = agent.icon;
          const isActive = page === 'chat' && activeAgent === agent.id;
          return (
            <div key={agent.id} style={{ marginBottom: 1 }}>
              {menuItem(
                isActive,
                <Icon size={16} strokeWidth={1.8} />,
                agent.name,
                () => { setActiveAgent(agent.id); onNavigate('chat'); }
              )}
            </div>
          );
        })}
      </div>

      {/* User Profile */}
      <div style={{
        height: 52,
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderTop: '1px solid #1A1A1A',
        flexShrink: 0,
      }}>
        <div style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: '#1F1F1F',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 600,
          color: '#888',
        }}>
          M
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#CCC', lineHeight: 1.2 }}>MILLIMILLI</div>
          <div style={{ fontSize: 11, color: '#555', lineHeight: 1.2 }}>대표</div>
        </div>
      </div>
    </div>
  );
}

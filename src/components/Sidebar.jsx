import { agents } from '../lib/agents';
import useChatStore from '../store/chatStore';
import { LayoutDashboard } from 'lucide-react';

export default function Sidebar({ currentPage, onNavigate }) {
  const { activeAgent, setActiveAgent } = useChatStore();

  return (
    <aside className="w-[260px] h-screen bg-bg-primary border-r border-border flex flex-col fixed left-0 top-0 z-10">
      <div className="p-5 border-b border-border">
        <h1 className="text-[22px] font-bold tracking-tight">MINE AI</h1>
        <p className="text-[12px] text-text-secondary mt-0.5">MILLIMILLI Team</p>
      </div>

      <div className="p-3">
        <button
          onClick={() => onNavigate('dashboard')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all ${
            currentPage === 'dashboard'
              ? 'bg-white text-black'
              : 'text-text-secondary hover:bg-bg-hover hover:text-white'
          }`}
        >
          <LayoutDashboard size={18} />
          대시보드
        </button>
      </div>

      <div className="px-3 pt-2 pb-1">
        <span className="text-[11px] text-text-muted font-medium uppercase tracking-wider px-3">
          Agents
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {agents.map((agent) => {
          const Icon = agent.icon;
          const isActive = currentPage === 'chat' && activeAgent === agent.id;
          return (
            <button
              key={agent.id}
              onClick={() => {
                setActiveAgent(agent.id);
                onNavigate('chat');
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all mb-0.5 ${
                isActive
                  ? 'bg-white text-black'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-white'
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.5} />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium truncate">{agent.name}</div>
                <div className={`text-[11px] truncate ${isActive ? 'text-black/60' : 'text-text-muted'}`}>
                  {agent.title}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-black font-bold text-[13px]">
            M
          </div>
          <div>
            <div className="text-[13px] font-medium">MILLIMILLI</div>
            <div className="text-[11px] text-text-muted">대표</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

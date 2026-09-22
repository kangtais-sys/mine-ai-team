import { useState } from 'react';
import { agents } from '../lib/agents';
import { Home, Network, Layers, Factory, UserCircle2, BarChart3, ChevronRight, CalendarCheck } from 'lucide-react';

// 사이드바 — 이 앱은 콘텐츠 앱이다. 콘텐츠 메뉴가 전부이고,
// 기존 에이전트 9종은 '기타'로 접어 둔다(지우지 않는다 —
// 자동응대 승인 대기가 여기에만 있고, 뒤에서 크론이 계속 돌기 때문).

// 트랙 A(소재 무한 생성) 먼저, 트랙 B(AI 인플루언서)는 아래.
const CONTENT_MENU = [
  { id: 'daily', label: '오늘의 9칸', icon: CalendarCheck, hint: '트렌드3 · 유형3 · 이미지3', group: null },
  { id: 'home', label: '홈', icon: Home, hint: '두 트랙 현황', group: null },
  { id: 'skeletons', label: '골격 라이브러리', icon: Layers, hint: '무엇으로 채울지', group: 'A' },
  { id: 'board', label: '콘텐츠 보드', icon: Network, hint: '어디를 채울지', group: 'A' },
  { id: 'studio', label: '생성 스튜디오', icon: Factory, hint: '대기→발행', group: 'A' },
  { id: 'performance', label: '소재 성과', icon: BarChart3, hint: '결과 판정', group: 'A' },
  { id: 'personas', label: '페르소나', icon: UserCircle2, hint: 'AI 인플루언서', group: 'B' },
];

export default function Sidebar({ route, onNavigate, urgentCount = 0 }) {
  const { page, agentId } = route;
  const [openOther, setOpenOther] = useState(false);

  const menuItem = (active, icon, label, onClick, badge = 0, hint = null) => (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px', marginBottom: 1, borderRadius: 7, border: 'none',
        background: active ? '#F0F0F3' : 'transparent',
        color: active ? '#1D1D1F' : '#6E6E73',
        fontSize: 13.5, fontWeight: active ? 600 : 400,
        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#F7F7F9'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
        {hint && active && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 400, color: '#AEAEB2', lineHeight: 1.3 }}>{hint}</span>}
      </span>
      {badge > 0 && (
        <span style={{
          minWidth: 16, height: 16, padding: '0 5px', borderRadius: 8, background: '#C0392B',
          color: '#FFF', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{badge}</span>
      )}
    </button>
  );

  const sectionLabel = (t) => (
    <div style={{ padding: '14px 14px 5px', fontSize: 10.5, fontWeight: 600, color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>
      {t}
    </div>
  );

  return (
    <div style={{ width: 240, height: '100vh', background: '#FFFFFF', borderRight: '1px solid #E5E5EA', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Logo */}
      <div style={{ height: 56, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #E5E5EA', flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: '#1D1D1F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 28 28" fill="none">
            <path d="M7 20V8L14 16L21 8V20" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1D1D1F', lineHeight: 1.2 }}>MILLI AI</div>
          <div style={{ fontSize: 11, color: '#AEAEB2', lineHeight: 1.2 }}>콘텐츠</div>
        </div>
      </div>

      {/* 콘텐츠 — 이 앱의 전부 */}
      <div style={{ padding: '10px 8px 0', flexShrink: 0 }}>
        {CONTENT_MENU.map((m, i) => {
          const Icon = m.icon;
          const prev = CONTENT_MENU[i - 1];
          return (
            <div key={m.id}>
              {m.group && m.group !== prev?.group && sectionLabel(m.group === 'A' ? '트랙 A · 소재 무한 생성' : '트랙 B · AI 인플루언서')}
              {menuItem(page === m.id, <Icon size={15} strokeWidth={1.8} />, m.label, () => onNavigate(m.id), 0, m.hint)}
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {/* 기타 — 접어 둔다. 콘텐츠 작업 중에 시야를 뺏지 않게. */}
        {sectionLabel('기타')}
        <div style={{ padding: '0 8px 8px' }}>
          <button
            onClick={() => setOpenOther(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
              borderRadius: 7, border: 'none', background: 'transparent', color: '#6E6E73',
              fontSize: 12.5, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            }}
          >
            <ChevronRight size={13} strokeWidth={2} style={{ transform: openOther ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }} />
            <span style={{ flex: 1 }}>에이전트 · 경영 데이터</span>
            {!openOther && urgentCount > 0 && (
              <span style={{ minWidth: 16, height: 16, padding: '0 5px', borderRadius: 8, background: '#C0392B', color: '#FFF', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {urgentCount}
              </span>
            )}
          </button>

          {openOther && (
            <div style={{ paddingLeft: 6, marginTop: 2 }}>
              {menuItem(page === 'legacy', <span style={{ width: 15, textAlign: 'center', fontSize: 12 }}>◻</span>, '옛 대시보드', () => onNavigate('legacy'))}
              {agents.map(agent => {
                const Icon = agent.icon;
                return (
                  <div key={agent.id}>
                    {menuItem(
                      page === 'chat' && agentId === agent.id,
                      <Icon size={15} strokeWidth={1.8} />,
                      agent.name,
                      () => onNavigate('chat', agent.id),
                      agent.id === 'channel' ? urgentCount : 0,
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* User Profile */}
      <div style={{ height: 52, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid #E5E5EA', flexShrink: 0 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#1D1D1F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#FFF', flexShrink: 0 }}>
          M
        </div>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: '#1D1D1F', lineHeight: 1.2 }}>유민혜</div>
          <div style={{ fontSize: 11, color: '#AEAEB2', lineHeight: 1.2 }}>콘텐츠</div>
        </div>
      </div>
    </div>
  );
}

import { Users, DollarSign, FileText, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import useDashboardStore from '../store/dashboardStore';
import { agents } from '../lib/agents';

const fmt = (v) => {
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억`;
  if (v >= 10000) return `${(v / 10000).toFixed(0)}만`;
  return v.toLocaleString();
};

const tip = {
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 6,
  color: '#E8E8E8',
  fontSize: 13,
  padding: '8px 12px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
};

export default function Dashboard() {
  const { stats, revenueData, followerData, channelRevenue } = useDashboardStore();

  const kpis = [
    { label: '총 팔로워', value: fmt(stats.totalFollowers), icon: Users, delta: '+2.4%', up: true },
    { label: '월 매출', value: `${fmt(stats.monthlyRevenue)}원`, icon: DollarSign, delta: '+12.8%', up: true },
    { label: '콘텐츠 발행', value: `${stats.contentCount}건`, icon: FileText, delta: '+8건', up: true },
    { label: '인게이지먼트', value: `${stats.engagementRate}%`, icon: TrendingUp, delta: '+0.3%', up: true },
  ];

  const activities = [
    { agent: 'creator', action: '인스타 릴스 3개 예약 발행 완료', time: '10분 전' },
    { agent: 'community', action: 'DM 24건 자동 응대 완료', time: '25분 전' },
    { agent: 'cs', action: '교환 요청 3건 처리 완료', time: '1시간 전' },
    { agent: 'marketer', action: '주간 성과 리포트 생성 완료', time: '2시간 전' },
    { agent: 'global', action: '일본 바이어 컨택 메일 5건 발송', time: '3시간 전' },
    { agent: 'admin', action: '3월 매출 정산 보고서 생성', time: '4시간 전' },
    { agent: 'product', action: '봄 시즌 신제품 기획서 초안 완성', time: '5시간 전' },
  ];

  const barColors = ['#5E6AD2', '#7C6BDE', '#9D8AE9', '#BBA8F4'];

  return (
    <>
      {/* Header */}
      <div style={{
        height: 48,
        minHeight: 48,
        padding: '0 28px',
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid #1A1A1A',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#F5F5F5' }}>대시보드</span>
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 24 }}>
          {kpis.map((kpi, i) => {
            const Icon = kpi.icon;
            return (
              <div key={i} style={{
                background: '#141414',
                border: '1px solid #242424',
                borderRadius: 8,
                padding: 24,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: '#777', fontWeight: 500 }}>{kpi.label}</span>
                  <Icon size={16} strokeWidth={1.5} color="#444" />
                </div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#FFFFFF', lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {kpi.value}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, lineHeight: 1.3 }}>
                  {kpi.up
                    ? <ArrowUpRight size={13} color="#22C55E" />
                    : <ArrowDownRight size={13} color="#EF4444" />
                  }
                  <span style={{ fontSize: 12, color: kpi.up ? '#22C55E' : '#EF4444', fontWeight: 500 }}>{kpi.delta}</span>
                  <span style={{ fontSize: 12, color: '#555' }}>vs 지난달</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
          {/* Revenue */}
          <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: '24px 24px 16px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#F5F5F5', marginBottom: 16 }}>채널별 매출 추이</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenueData} barGap={2}>
                <XAxis dataKey="month" stroke="#444" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#444" fontSize={12} tickLine={false} axisLine={false} width={42} tickFormatter={(v) => `${v / 10000000}천만`} />
                <Tooltip contentStyle={tip} formatter={(v) => [`${fmt(v)}원`]} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                <Bar dataKey="올리브영" fill={barColors[0]} radius={[3, 3, 0, 0]} />
                <Bar dataKey="스마트스토어" fill={barColors[1]} radius={[3, 3, 0, 0]} />
                <Bar dataKey="자사몰" fill={barColors[2]} radius={[3, 3, 0, 0]} />
                <Bar dataKey="해외" fill={barColors[3]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, paddingLeft: 42 }}>
              {['올리브영', '스마트스토어', '자사몰', '해외'].map((name, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: barColors[i] }} />
                  <span style={{ fontSize: 12, color: '#666' }}>{name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Followers */}
          <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: '24px 24px 16px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#F5F5F5', marginBottom: 16 }}>팔로워 성장 추이</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={followerData}>
                <defs>
                  <linearGradient id="gInsta" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5E6AD2" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#5E6AD2" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gTiktok" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7C6BDE" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#7C6BDE" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="#444" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#444" fontSize={12} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => `${v / 10000}만`} />
                <Tooltip contentStyle={tip} formatter={(v) => [fmt(v)]} cursor={{ stroke: '#333' }} />
                <Area type="monotone" dataKey="인스타그램" stroke="#5E6AD2" strokeWidth={2} fill="url(#gInsta)" dot={false} />
                <Area type="monotone" dataKey="틱톡" stroke="#7C6BDE" strokeWidth={2} fill="url(#gTiktok)" dot={false} />
                <Area type="monotone" dataKey="유튜브" stroke="#9D8AE9" strokeWidth={1.5} fill="transparent" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, paddingLeft: 36 }}>
              {[
                { name: '인스타그램', color: '#5E6AD2' },
                { name: '틱톡', color: '#7C6BDE' },
                { name: '유튜브', color: '#9D8AE9' },
              ].map((ch, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 3, borderRadius: 2, background: ch.color }} />
                  <span style={{ fontSize: 12, color: '#666' }}>{ch.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 20 }}>
          {/* Channel Breakdown */}
          <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#F5F5F5', marginBottom: 16 }}>채널별 매출 비중</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {channelRevenue.map((ch, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 14, color: '#CCC' }}>{ch.name}</span>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <span style={{ fontSize: 14, color: '#666' }}>{fmt(ch.value)}원</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#F5F5F5', width: 44, textAlign: 'right' }}>{ch.percentage}%</span>
                    </div>
                  </div>
                  <div style={{ height: 4, background: '#1F1F1F', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${ch.percentage}%`, background: barColors[i], borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity */}
          <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#F5F5F5', marginBottom: 14 }}>최근 활동</div>
            {activities.map((item, i) => {
              const ag = agents.find(a => a.id === item.agent);
              const AgIcon = ag?.icon;
              return (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: i < activities.length - 1 ? '1px solid #1F1F1F' : 'none',
                }}>
                  <div style={{
                    width: 30,
                    height: 30,
                    borderRadius: 7,
                    background: '#1A1A1A',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {AgIcon && <AgIcon size={14} strokeWidth={1.5} color="#5E6AD2" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#DDD' }}>{ag?.name}</span>
                    <span style={{ fontSize: 14, color: '#666', marginLeft: 8 }}>{item.action}</span>
                  </div>
                  <span style={{ fontSize: 13, color: '#444', flexShrink: 0 }}>{item.time}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

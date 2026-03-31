import { Users, DollarSign, FileText, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import useDashboardStore from '../store/dashboardStore';

const formatKRW = (value) => {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
  if (value >= 10000) return `${(value / 10000).toFixed(0)}만`;
  return value.toLocaleString();
};

export default function Dashboard() {
  const { stats, revenueData, followerData, channelRevenue } = useDashboardStore();

  const statCards = [
    { label: '총 팔로워', value: formatKRW(stats.totalFollowers), icon: Users, change: '+2.4%' },
    { label: '월 매출', value: `${formatKRW(stats.monthlyRevenue)}원`, icon: DollarSign, change: '+12.8%' },
    { label: '콘텐츠 발행', value: `${stats.contentCount}건`, icon: FileText, change: '+8건' },
    { label: '인게이지먼트', value: `${stats.engagementRate}%`, icon: TrendingUp, change: '+0.3%' },
  ];

  return (
    <div className="flex flex-col h-screen">
      <header className="h-[64px] border-b border-border flex items-center px-6 shrink-0 bg-bg-primary">
        <h2 className="text-[18px] font-bold">대시보드</h2>
        <span className="text-[13px] text-text-secondary ml-3">MILLIMILLI 통합 현황</span>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {statCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <div key={i} className="bg-bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] text-text-secondary">{card.label}</span>
                  <Icon size={16} className="text-text-muted" />
                </div>
                <div className="text-[24px] font-bold">{card.value}</div>
                <div className="text-[12px] text-green-400 mt-1">{card.change} vs 지난달</div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Revenue Chart */}
          <div className="bg-bg-card border border-border rounded-xl p-5">
            <h3 className="text-[16px] font-bold mb-4">채널별 매출 추이</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={revenueData}>
                <XAxis dataKey="month" stroke="#666" fontSize={12} />
                <YAxis stroke="#666" fontSize={12} tickFormatter={(v) => `${v / 10000000}천만`} />
                <Tooltip
                  contentStyle={{ background: '#141414', border: '1px solid #2A2A2A', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  formatter={(value) => [`${formatKRW(value)}원`]}
                />
                <Bar dataKey="올리브영" fill="#FFFFFF" radius={[2, 2, 0, 0]} />
                <Bar dataKey="스마트스토어" fill="#888888" radius={[2, 2, 0, 0]} />
                <Bar dataKey="자사몰" fill="#555555" radius={[2, 2, 0, 0]} />
                <Bar dataKey="해외" fill="#333333" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Follower Chart */}
          <div className="bg-bg-card border border-border rounded-xl p-5">
            <h3 className="text-[16px] font-bold mb-4">팔로워 성장 추이</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={followerData}>
                <XAxis dataKey="month" stroke="#666" fontSize={12} />
                <YAxis stroke="#666" fontSize={12} tickFormatter={(v) => `${v / 10000}만`} />
                <Tooltip
                  contentStyle={{ background: '#141414', border: '1px solid #2A2A2A', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  formatter={(value) => [formatKRW(value)]}
                />
                <Line type="monotone" dataKey="인스타그램" stroke="#FFFFFF" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="틱톡" stroke="#888888" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="유튜브" stroke="#555555" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Channel Revenue Breakdown */}
          <div className="bg-bg-card border border-border rounded-xl p-5">
            <h3 className="text-[16px] font-bold mb-4">채널별 매출 비중</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={channelRevenue}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  stroke="#0A0A0A"
                  strokeWidth={2}
                >
                  {channelRevenue.map((_, i) => (
                    <Cell key={i} fill={['#FFFFFF', '#AAAAAA', '#666666', '#333333'][i]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#141414', border: '1px solid #2A2A2A', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  formatter={(value) => [`${formatKRW(value)}원`]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {channelRevenue.map((ch, i) => (
                <div key={i} className="flex items-center justify-between text-[13px]">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: ['#FFFFFF', '#AAAAAA', '#666666', '#333333'][i] }} />
                    <span className="text-text-secondary">{ch.name}</span>
                  </div>
                  <span className="font-medium">{ch.percentage}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-bg-card border border-border rounded-xl p-5 col-span-2">
            <h3 className="text-[16px] font-bold mb-4">최근 활동</h3>
            <div className="space-y-3">
              {[
                { agent: 'AI 크리에이터', action: '인스타 릴스 3개 예약 발행 완료', time: '10분 전' },
                { agent: 'AI 커뮤니티', action: 'DM 24건 자동 응대 완료', time: '25분 전' },
                { agent: 'AI CS매니저', action: '교환 요청 3건 처리 완료', time: '1시간 전' },
                { agent: 'AI 마케터', action: '주간 성과 리포트 생성 완료', time: '2시간 전' },
                { agent: 'AI 글로벌', action: '일본 바이어 컨택 메일 5건 발송', time: '3시간 전' },
                { agent: 'AI 경영지원', action: '3월 매출 정산 보고서 생성', time: '4시간 전' },
                { agent: 'AI 상품개발', action: '봄 시즌 신제품 기획서 초안 완성', time: '5시간 전' },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <span className="text-[13px] font-medium text-white">{item.agent}</span>
                    <span className="text-[13px] text-text-secondary ml-2">{item.action}</span>
                  </div>
                  <span className="text-[12px] text-text-muted shrink-0">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

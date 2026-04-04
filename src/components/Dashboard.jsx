import { useState, useEffect } from 'react';
import { Users, DollarSign, FileText, TrendingUp, ArrowUpRight, ArrowDownRight, Link2, CheckCircle2, AlertCircle, RefreshCw, MessageCircle } from 'lucide-react';
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

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - (typeof ts === 'number' ? ts : new Date(ts).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function Dashboard() {
  const { stats, revenueData, followerData, channelRevenue, fetchStats } = useDashboardStore();
  const [googleStatus, setGoogleStatus] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchStats();

    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true') {
      const email = params.get('email') || '';
      localStorage.setItem('google_connected', 'true');
      localStorage.setItem('google_email', email);
      setGoogleStatus({ connected: true, email });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('google_error')) {
      setGoogleStatus({ connected: false, reason: 'oauth_error', error: params.get('google_error') });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (localStorage.getItem('google_connected') === 'true') {
      setGoogleStatus({ connected: true, email: localStorage.getItem('google_email') || '' });
      fetch('/api/auth/google-status').then(r => r.json()).then(data => {
        if (!data.connected) { localStorage.removeItem('google_connected'); localStorage.removeItem('google_email'); }
        setGoogleStatus(data);
      }).catch(() => {});
    } else {
      fetch('/api/auth/google-status').then(r => r.json()).then(data => {
        if (data.connected) { localStorage.setItem('google_connected', 'true'); localStorage.setItem('google_email', data.email || ''); }
        setGoogleStatus(data);
      }).catch(() => setGoogleStatus({ connected: false, reason: 'fetch_error' }));
    }
  }, []);

  const refreshIG = () => {
    setRefreshing(true);
    fetch('/api/scrape/instagram-followers')
      .then(() => fetchStats())
      .catch(() => {})
      .finally(() => setRefreshing(false));
  };

  const ym = stats?.yuminhye;
  const ml = stats?.millimilli;
  const engagement = stats?.engagement || {};
  const connections = stats?.connections || {};
  const activityLog = stats?.activityLog || [];

  const kpis = [
    { label: '콘텐츠 발행', value: stats?.contentCount != null ? `${stats.contentCount}건` : '-', icon: FileText, delta: 'Zernio 실데이터', up: true },
    { label: '댓글 응대', value: `${engagement.comments || 0}건`, icon: MessageCircle, delta: 'KV 실데이터', up: true },
    { label: 'DM 응대', value: `${engagement.dm || 0}건`, icon: MessageCircle, delta: 'KV 실데이터', up: true },
  ];

  const barColors = ['#5E6AD2', '#7C6BDE', '#9D8AE9', '#BBA8F4'];

  return (
    <>
      {/* Header */}
      <div style={{ height: 48, minHeight: 48, padding: '0 28px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #1A1A1A', flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#F5F5F5' }}>대시보드</span>
        <div style={{ flex: 1 }} />
        {googleStatus?.connected ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={14} color="#22C55E" />
            <span style={{ fontSize: 12, color: '#666' }}>{googleStatus.email || 'Google 연동됨'}</span>
          </div>
        ) : (
          <button onClick={() => { window.location.href = '/api/auth/google'; }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, border: '1px solid #242424', background: 'transparent', color: '#888', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#CCC'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#242424'; e.currentTarget.style.color = '#888'; }}>
            <Link2 size={13} />구글 계정 연동
          </button>
        )}
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {/* Follower Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#F5F5F5' }}>유민혜</span>
              <button onClick={refreshIG} disabled={refreshing} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                <RefreshCw size={12} color={refreshing ? '#555' : '#5E6AD2'} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
              </button>
            </div>
            {[
              { icon: 'IG', label: '인스타', value: ym?.instagram?.count, color: '#E1306C' },
              { icon: 'TT', label: '틱톡', value: ym?.tiktok?.count, color: '#69C9D0' },
              { icon: 'YT', label: '유튜브', value: ym?.youtube?.count, color: '#FF0000' },
            ].map((ch, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < 2 ? '1px solid #1F1F1F' : 'none' }}>
                <span style={{ fontSize: 10, color: ch.color, fontWeight: 600, width: 18 }}>{ch.icon}</span>
                <span style={{ fontSize: 12, color: '#CCC', flex: 1 }}>{ch.label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#FFF' }}>{ch.value ? fmt(ch.value) : '-'}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid #242424' }}>
              <span style={{ fontSize: 11, color: '#777' }}>합계</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#FFF' }}>{ym?.total ? fmt(ym.total) : '-'}</span>
            </div>
          </div>
          <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F5F5', marginBottom: 14 }}>밀리밀리</div>
            {[
              { icon: 'IG', label: '인스타', value: ml?.instagram?.count, color: '#E1306C' },
              { icon: 'TT', label: '틱톡', value: ml?.tiktok?.count, color: '#69C9D0' },
              { icon: 'YT', label: '유튜브', value: ml?.youtube?.count, color: '#FF0000' },
            ].map((ch, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < 2 ? '1px solid #1F1F1F' : 'none' }}>
                <span style={{ fontSize: 10, color: ch.color, fontWeight: 600, width: 18 }}>{ch.icon}</span>
                <span style={{ fontSize: 12, color: '#CCC', flex: 1 }}>{ch.label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#FFF' }}>{ch.value ? fmt(ch.value) : '-'}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid #242424' }}>
              <span style={{ fontSize: 11, color: '#777' }}>합계</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#FFF' }}>{ml?.total ? fmt(ml.total) : '-'}</span>
            </div>
            <div style={{ fontSize: 9, color: '#444', marginTop: 6 }}>Zernio 실시간 연동</div>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 24 }}>
          {kpis.map((kpi, i) => {
            const Icon = kpi.icon;
            return (
              <div key={i} style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: '#777', fontWeight: 500 }}>{kpi.label}</span>
                  <Icon size={16} strokeWidth={1.5} color="#444" />
                </div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#FFFFFF', lineHeight: 1, letterSpacing: '-0.02em' }}>{kpi.value}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
                  <ArrowUpRight size={13} color="#22C55E" />
                  <span style={{ fontSize: 12, color: '#22C55E', fontWeight: 500 }}>{kpi.delta}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
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
          <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: '24px 24px 16px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#F5F5F5', marginBottom: 16 }}>팔로워 성장 추이</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={followerData}>
                <defs>
                  <linearGradient id="gInsta" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5E6AD2" stopOpacity={0.25} /><stop offset="100%" stopColor="#5E6AD2" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gTiktok" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7C6BDE" stopOpacity={0.15} /><stop offset="100%" stopColor="#7C6BDE" stopOpacity={0} /></linearGradient>
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
              {[{ name: '인스타그램', color: '#5E6AD2' }, { name: '틱톡', color: '#7C6BDE' }, { name: '유튜브', color: '#9D8AE9' }].map((ch, i) => (
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Connection Status */}
            <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#F5F5F5', marginBottom: 14 }}>채널 연결 상태</div>
              {Object.entries(connections).map(([key, val], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < Object.keys(connections).length - 1 ? '1px solid #1F1F1F' : 'none' }}>
                  <span style={{ fontSize: 12 }}>{val?.connected ? '🟢' : '🔴'}</span>
                  <span style={{ fontSize: 12, color: '#CCC', flex: 1 }}>{key}</span>
                  <span style={{ fontSize: 10, color: val?.connected ? '#22C55E' : '#555' }}>{val?.connected ? '연결됨' : '미연결'}</span>
                </div>
              ))}
            </div>
            {/* Channel Revenue */}
            <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#F5F5F5', marginBottom: 16 }}>채널별 매출 비중</div>
              {channelRevenue.map((ch, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 14, color: '#CCC' }}>{ch.name}</span>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <span style={{ fontSize: 14, color: '#666' }}>{fmt(ch.value)}원</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#F5F5F5', width: 44, textAlign: 'right' }}>{ch.percentage}%</span>
                    </div>
                  </div>
                  <div style={{ height: 4, background: '#1F1F1F', borderRadius: 2, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ height: '100%', width: `${ch.percentage}%`, background: barColors[i], borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Log */}
          <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#F5F5F5', marginBottom: 14 }}>최근 활동</div>
            {activityLog.length > 0 ? activityLog.map((item, i) => {
              const ag = agents.find(a => a.name === item.agent) || agents[0];
              const AgIcon = ag?.icon;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < activityLog.length - 1 ? '1px solid #1F1F1F' : 'none' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 7, background: '#1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {AgIcon && <AgIcon size={14} strokeWidth={1.5} color="#5E6AD2" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#DDD' }}>{item.agent}</span>
                    <span style={{ fontSize: 14, color: '#666', marginLeft: 8 }}>{item.action}</span>
                    {item.detail && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{item.detail}</div>}
                  </div>
                  <span style={{ fontSize: 13, color: '#444', flexShrink: 0 }}>{timeAgo(item.timestamp)}</span>
                </div>
              );
            }) : (
              <div style={{ fontSize: 13, color: '#555', padding: '20px 0', textAlign: 'center' }}>
                아직 활동 로그가 없습니다. 댓글/DM 응대 시 자동 기록됩니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

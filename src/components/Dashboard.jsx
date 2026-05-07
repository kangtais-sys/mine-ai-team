import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, Link2, TrendingUp, TrendingDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import useDashboardStore from '../store/dashboardStore';
import { agents } from '../lib/agents';

const fmt = (v) => (v != null && v > 0) ? v.toLocaleString('ko-KR') : v === 0 ? '0' : '-';
const fmtKRW = (v) => (v != null && v >= 0) ? `${v.toLocaleString('ko-KR')}원` : '-';
const fmtUSD = (v) => (v != null && v >= 0) ? `$${v.toLocaleString('ko-KR')}` : '-';

const tip = {
  background: '#FFFFFF',
  border: '1px solid #E5E5EA',
  borderRadius: 8,
  color: '#1D1D1F',
  fontSize: 12,
  padding: '8px 12px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
};

const CARD = {
  background: '#FFFFFF',
  border: '1px solid #E5E5EA',
  borderRadius: 12,
  padding: '20px 22px',
};

const LABEL = { fontSize: 11, color: '#AEAEB2', fontWeight: 500, marginBottom: 4 };
const VALUE_LG = { fontSize: 24, fontWeight: 700, color: '#1D1D1F', letterSpacing: '-0.03em', lineHeight: 1.1 };
const VALUE_SM = { fontSize: 13, fontWeight: 600, color: '#1D1D1F' };
const DIVIDER = { borderTop: '1px solid #F2F2F5', margin: '12px 0' };

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

function StatChip({ value, label, positive }) {
  if (value == null) return null;
  const up = positive !== false && value >= 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {up ? <TrendingUp size={11} color="#34C759" /> : <TrendingDown size={11} color="#FF3B30" />}
      <span style={{ fontSize: 11, color: up ? '#34C759' : '#FF3B30', fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function ChannelRow({ icon, label, value, yearly, iconColor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, color: iconColor, width: 20, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 12.5, color: '#6E6E73', flex: 1 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F' }}>{fmt(value)}</span>
    </div>
  );
}

export default function Dashboard() {
  const { stats, revenueData, fetchStats } = useDashboardStore();
  const [googleStatus, setGoogleStatus] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [revTab, setRevTab] = useState('month'); // 'month' | 'year'

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
      setGoogleStatus({ connected: false });
      window.history.replaceState({}, '', window.location.pathname);
    } else {
      const stored = localStorage.getItem('google_connected') === 'true';
      if (stored) setGoogleStatus({ connected: true, email: localStorage.getItem('google_email') || '' });
      fetch('/api/auth/google-status').then(r => r.json()).then(data => {
        if (data.connected) { localStorage.setItem('google_connected', 'true'); localStorage.setItem('google_email', data.email || ''); }
        else { localStorage.removeItem('google_connected'); localStorage.removeItem('google_email'); }
        setGoogleStatus(data);
      }).catch(() => setGoogleStatus({ connected: false }));
    }
  }, []);

  const refreshIG = () => {
    setRefreshing(true);
    fetch('/api/scrape/instagram-followers').then(() => fetchStats()).catch(() => {}).finally(() => setRefreshing(false));
  };

  const ym = stats?.yuminhye || {};
  const ml = stats?.millimilli || {};
  const connections = stats?.connections || {};
  const activityLog = stats?.activityLog || [];

  const krTotal = revTab === 'year' ? (stats?.totalRevenueYearly || 0) : (stats?.totalRevenue || 0);
  const ch = revTab === 'year' ? stats?.channelSalesYearly : stats?.channelSales;
  const usTotal = ch?.export || 0;

  const chartData = stats?.monthlyRevenue?.length
    ? stats.monthlyRevenue
    : revenueData.map(d => ({ month: d.month, total: (d['올리브영'] || 0) + (d['스마트스토어'] || 0) + (d['자사몰'] || 0) + (d['해외'] || 0) }));

  const tabBtn = (key, label) => (
    <button
      onClick={() => setRevTab(key)}
      style={{ padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: revTab === key ? 600 : 400, background: revTab === key ? '#1D1D1F' : 'transparent', color: revTab === key ? '#FFF' : '#AEAEB2', fontFamily: 'inherit', transition: 'all 0.12s' }}
    >{label}</button>
  );

  const connKeys = {
    zernio: 'Zernio',
    google: 'Google',
    anthropic: 'Anthropic',
    instagram: 'Instagram',
    oliveyoung: '올리브영',
    happytalk: '해피톡',
    naverAds: '네이버광고',
    googleAds: '구글광고',
    ga4: 'GA4',
  };

  return (
    <>
      {/* Header */}
      <div style={{ height: 50, padding: '0 28px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #E5E5EA', background: '#FFFFFF', flexShrink: 0, gap: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F' }}>MILLI AI 대시보드</span>
        <div style={{ flex: 1 }} />
        {googleStatus?.connected ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <CheckCircle2 size={13} color="#34C759" />
            <span style={{ fontSize: 12, color: '#6E6E73' }}>{googleStatus.email || 'Google 연동됨'}</span>
          </div>
        ) : (
          <button onClick={() => { window.location.href = '/api/auth/google'; }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: '1px solid #E5E5EA', background: '#FFF', color: '#6E6E73', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Link2 size={12} />구글 계정 연동
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 32px' }}>

        {/* Row 1: Revenue (국가별) + Chart */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, marginBottom: 16 }}>

          {/* Revenue Summary Card */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F' }}>매출 현황</span>
              <div style={{ display: 'flex', gap: 2 }}>
                {tabBtn('month', '당월')}
                {tabBtn('year', '연간')}
              </div>
            </div>

            {/* Korea */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...LABEL }}>🇰🇷 한국</div>
              <div style={{ ...VALUE_LG }}>{fmtKRW(krTotal - usTotal)}</div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[
                  { label: '올리브영', key: 'oliveyoung', color: '#5E6AD2' },
                  { label: '스마트스토어', key: 'smartstore', color: '#7C6BDE' },
                  { label: '카페24 자사몰', key: 'cafe24', color: '#A78BFA' },
                ].map((c) => (
                  <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 4, height: 4, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, color: '#6E6E73', flex: 1 }}>{c.label}</span>
                    <span style={{ ...VALUE_SM }}>{fmtKRW(ch?.[c.key])}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={DIVIDER} />

            {/* USA */}
            <div>
              <div style={{ ...LABEL }}>🇺🇸 미국</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1D1D1F', letterSpacing: '-0.02em' }}>{fmtUSD(usTotal)}</div>
              <div style={{ fontSize: 11, color: '#AEAEB2', marginTop: 2 }}>Amazon · Shopee · TikTok Shop</div>
            </div>

            <div style={DIVIDER} />

            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#AEAEB2' }}>{revTab === 'year' ? '2026 누적' : '당월 합계'}</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#5E6AD2', letterSpacing: '-0.02em' }}>{fmtKRW(krTotal)}</span>
            </div>
          </div>

          {/* Monthly Chart */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F', marginBottom: 12 }}>2026 월별 매출 추이</div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={chartData}>
                  <XAxis dataKey="month" stroke="#AEAEB2" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#AEAEB2" fontSize={10} tickLine={false} axisLine={false} width={58} tickFormatter={(v) => `${(v / 10000000).toFixed(0)}천만`} />
                  <Tooltip contentStyle={tip} formatter={(v) => [fmtKRW(v), '총매출']} cursor={{ stroke: '#E5E5EA' }} />
                  <Line type="monotone" dataKey="total" stroke="#5E6AD2" strokeWidth={2} dot={{ r: 3, fill: '#5E6AD2', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#5E6AD2' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Row 2: Followers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* 유민혜 */}
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F' }}>유민혜</span>
              <button onClick={refreshIG} disabled={refreshing} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                <RefreshCw size={12} color={refreshing ? '#AEAEB2' : '#5E6AD2'} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
              </button>
            </div>
            {[
              { icon: 'IG', label: '인스타그램', value: ym?.instagram?.count, color: '#E1306C' },
              { icon: 'TT', label: '틱톡', value: ym?.tiktok?.count, color: '#2D3436' },
              { icon: 'YT', label: '유튜브', value: ym?.youtube?.count, color: '#FF0000' },
            ].map((ch, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < 2 ? '1px solid #F5F5F7' : 'none' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: ch.color, width: 20 }}>{ch.icon}</span>
                <span style={{ fontSize: 12.5, color: '#6E6E73', flex: 1 }}>{ch.label}</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1D1D1F' }}>{ch.value > 0 ? fmt(ch.value) : '-'}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid #F2F2F5' }}>
              <span style={{ fontSize: 11, color: '#AEAEB2' }}>합계</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1D1D1F' }}>{ym?.total ? fmt(ym.total) : '-'}</span>
            </div>
          </div>

          {/* 밀리밀리 */}
          <div style={CARD}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F', marginBottom: 12 }}>밀리밀리</div>
            {[
              { icon: 'IG', label: '인스타그램', value: ml?.instagram?.count, color: '#E1306C' },
              { icon: 'TT', label: '틱톡', value: ml?.tiktok?.count, color: '#2D3436' },
              { icon: 'YT', label: '유튜브', value: ml?.youtube?.count, color: '#FF0000' },
            ].map((ch, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < 2 ? '1px solid #F5F5F7' : 'none' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: ch.color, width: 20 }}>{ch.icon}</span>
                <span style={{ fontSize: 12.5, color: '#6E6E73', flex: 1 }}>{ch.label}</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1D1D1F' }}>{ch.value > 0 ? fmt(ch.value) : '-'}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid #F2F2F5' }}>
              <span style={{ fontSize: 11, color: '#AEAEB2' }}>합계</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1D1D1F' }}>{ml?.total ? fmt(ml.total) : '-'}</span>
            </div>
            <div style={{ fontSize: 10, color: '#AEAEB2', marginTop: 5 }}>Zernio 실시간 연동</div>
          </div>

          {/* 얼쎄라 */}
          <div style={CARD}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F', marginBottom: 12 }}>얼쎄라 (ULSERA)</div>
            {[
              { icon: 'IG', label: '인스타그램', color: '#E1306C' },
              { icon: 'TT', label: '틱톡', color: '#2D3436' },
              { icon: 'TH', label: '쓰레드', color: '#6E6E73' },
              { icon: 'YT', label: '유튜브', color: '#FF0000' },
            ].map((ch, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < 3 ? '1px solid #F5F5F7' : 'none' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: ch.color, width: 20 }}>{ch.icon}</span>
                <span style={{ fontSize: 12.5, color: '#6E6E73', flex: 1 }}>{ch.label}</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: '#AEAEB2' }}>-</span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: '#F59E0B', marginTop: 8 }}>Zernio 연결 대기 중</div>
          </div>
        </div>

        {/* Row 3: Connection Status + Agent Activity */}
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
          {/* Connection Status */}
          <div style={CARD}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F', marginBottom: 12 }}>채널 연결 상태</div>
            {Object.entries(connKeys).map(([key, label], i, arr) => {
              const val = connections[key];
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < arr.length - 1 ? '1px solid #F5F5F7' : 'none' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: val?.connected ? '#34C759' : '#D1D1D6', flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, color: '#1D1D1F', flex: 1 }}>{label}</span>
                  <span style={{ fontSize: 11, color: val?.connected ? '#34C759' : '#AEAEB2' }}>
                    {val?.connected ? '연결됨' : '미연결'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Agent Activity Log */}
          <div style={CARD}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F', marginBottom: 12 }}>에이전트 최근 활동</div>
            {activityLog.length > 0 ? activityLog.map((item, i) => {
              const ag = agents.find(a => a.name === item.agent || a.id === item.agentId) || agents[0];
              const AgIcon = ag?.icon;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: i < activityLog.length - 1 ? '1px solid #F5F5F7' : 'none' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#F5F5F7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    {AgIcon && <AgIcon size={13} strokeWidth={1.8} color="#5E6AD2" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>{item.agent}</span>
                      <span style={{ fontSize: 12.5, color: '#6E6E73' }}>{item.action}</span>
                    </div>
                    {item.detail && <div style={{ fontSize: 11.5, color: '#AEAEB2', marginTop: 2 }}>{item.detail}</div>}
                  </div>
                  <span style={{ fontSize: 11, color: '#AEAEB2', flexShrink: 0, marginTop: 2 }}>{timeAgo(item.timestamp)}</span>
                </div>
              );
            }) : (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 12.5, color: '#AEAEB2' }}>아직 활동 내역이 없습니다.</div>
                <div style={{ fontSize: 11.5, color: '#D1D1D6', marginTop: 4 }}>에이전트가 작업을 시작하면 자동으로 기록됩니다.</div>
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  );
}

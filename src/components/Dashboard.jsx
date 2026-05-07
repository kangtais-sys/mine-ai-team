import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, Link2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import useDashboardStore from '../store/dashboardStore';
import { agents } from '../lib/agents';

const fmtKRW = (v) => (v != null && v > 0) ? `${v.toLocaleString('ko-KR')}원` : '-';
const fmtUSD = (v) => (v != null && v > 0) ? `$${v.toLocaleString('ko-KR')}` : '-';
const fmtCount = (v) => (v != null && v > 0) ? v.toLocaleString('ko-KR') : '-';

const tip = {
  background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 8,
  color: '#1D1D1F', fontSize: 12, padding: '8px 12px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
};

const CARD = { background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '20px 22px' };
const LABEL = { fontSize: 11, color: '#AEAEB2', fontWeight: 500, marginBottom: 4 };
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

function nowKST() {
  const d = new Date(Date.now() + 9 * 3600000);
  return d.toISOString().slice(0, 10);
}

function thisMonthLabel() {
  const d = new Date(Date.now() + 9 * 3600000);
  return `${d.getUTCMonth() + 1}월`;
}

function thisYearLabel() {
  return `${new Date().getFullYear()}년`;
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

  const ch = revTab === 'year' ? stats?.channelSalesYearly : stats?.channelSales;
  const krTotal = (ch?.oliveyoung || 0) + (ch?.smartstore || 0) + (ch?.cafe24 || 0) + (ch?.ga4 || 0);
  const usTotal = ch?.export || 0;

  const periodLabel = revTab === 'year' ? `${thisYearLabel()} 누적` : `${thisMonthLabel()} 누적`;

  const chartData = stats?.monthlyRevenue?.length
    ? stats.monthlyRevenue
    : revenueData.map(d => ({ month: d.month, total: (d['올리브영'] || 0) + (d['스마트스토어'] || 0) + (d['자사몰'] || 0) + (d['해외'] || 0) }));

  const tabBtn = (key, label) => (
    <button
      onClick={() => setRevTab(key)}
      style={{ padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: revTab === key ? 600 : 400, background: revTab === key ? '#1D1D1F' : 'transparent', color: revTab === key ? '#FFF' : '#AEAEB2', fontFamily: 'inherit', transition: 'all 0.12s' }}
    >{label}</button>
  );

  // 채널 연결 상태 (해피톡 제거)
  const connKeys = {
    zernio: 'Zernio',
    google: 'Google',
    anthropic: 'Anthropic',
    instagram: 'Instagram',
    oliveyoung: '올리브영',
    naverAds: '네이버광고',
    googleAds: '구글광고',
    ga4: 'GA4',
  };

  return (
    <>
      {/* Header */}
      <div style={{ height: 50, padding: '0 28px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #E5E5EA', background: '#FFFFFF', flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F' }}>MILLI AI 대시보드</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#AEAEB2', marginRight: 14 }}>{nowKST()} 기준</span>
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

        {/* Row 1: Revenue + Chart */}
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

            {/* Period label */}
            <div style={{ fontSize: 10.5, color: '#AEAEB2', marginBottom: 8 }}>{periodLabel}</div>

            {/* Korea */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...LABEL }}>🇰🇷 한국</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#1D1D1F', letterSpacing: '-0.03em', lineHeight: 1.1 }}>{fmtKRW(krTotal) !== '-' ? fmtKRW(krTotal) : '-'}</div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { label: '올리브영', key: 'oliveyoung', color: '#5E6AD2' },
                  { label: '스마트스토어', key: 'smartstore', color: '#7C6BDE' },
                  { label: '카페24 자사몰', key: 'cafe24', color: '#A78BFA' },
                ].map((c) => (
                  <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 4, height: 4, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, color: '#6E6E73', flex: 1 }}>{c.label}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>{fmtKRW(ch?.[c.key])}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={DIVIDER} />

            {/* USA */}
            <div>
              <div style={{ ...LABEL }}>🇺🇸 미국</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1D1D1F', letterSpacing: '-0.02em' }}>
                {usTotal > 0 ? fmtUSD(usTotal) : <span style={{ fontSize: 13, color: '#AEAEB2' }}>아마존 연결 대기 중</span>}
              </div>
            </div>

            <div style={DIVIDER} />

            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#AEAEB2' }}>{periodLabel} 합산</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#5E6AD2', letterSpacing: '-0.02em' }}>{fmtKRW(krTotal + usTotal) !== '-' ? fmtKRW(krTotal + usTotal) : '-'}</span>
            </div>
          </div>

          {/* Monthly Chart */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F' }}>2026 월별 매출 추이</span>
              <span style={{ fontSize: 11, color: '#AEAEB2' }}>한국 전 채널 합산</span>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={chartData}>
                  <XAxis dataKey="month" stroke="#AEAEB2" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#AEAEB2" fontSize={10} tickLine={false} axisLine={false} width={58} tickFormatter={(v) => v >= 10000000 ? `${(v / 10000000).toFixed(0)}천만` : `${(v / 10000).toFixed(0)}만`} />
                  <Tooltip contentStyle={tip} formatter={(v) => [fmtKRW(v), '총매출']} cursor={{ stroke: '#E5E5EA' }} />
                  <Line type="monotone" dataKey="total" stroke="#5E6AD2" strokeWidth={2} dot={{ r: 3, fill: '#5E6AD2', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Row 2: Followers — 유민혜 + 밀리밀리 (얼쎄라 제거) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* 유민혜 */}
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F' }}>유민혜</span>
                <span style={{ fontSize: 10.5, color: '#AEAEB2', marginLeft: 6 }}>팔로워 수 · 실시간</span>
              </div>
              <button onClick={refreshIG} disabled={refreshing} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                <RefreshCw size={12} color={refreshing ? '#AEAEB2' : '#5E6AD2'} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
              </button>
            </div>
            {[
              { icon: 'IG', label: '인스타그램', value: ym?.instagram?.count, color: '#E1306C' },
              { icon: 'TT', label: '틱톡', value: ym?.tiktok?.count, color: '#2D3436' },
              { icon: 'YT', label: '유튜브', value: ym?.youtube?.count, color: '#FF0000' },
            ].map((ch, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < 2 ? '1px solid #F5F5F7' : 'none' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: ch.color, width: 20 }}>{ch.icon}</span>
                <span style={{ fontSize: 12.5, color: '#6E6E73', flex: 1 }}>{ch.label}</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1D1D1F' }}>{fmtCount(ch.value)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid #F2F2F5' }}>
              <span style={{ fontSize: 11, color: '#AEAEB2' }}>전체 팔로워</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1D1D1F' }}>{fmtCount(ym?.total)}</span>
            </div>
          </div>

          {/* 밀리밀리 */}
          <div style={CARD}>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F' }}>밀리밀리</span>
              <span style={{ fontSize: 10.5, color: '#AEAEB2', marginLeft: 6 }}>팔로워 수 · Zernio 실시간</span>
            </div>
            {[
              { icon: 'IG', label: '인스타그램', value: ml?.instagram?.count, color: '#E1306C' },
              { icon: 'TT', label: '틱톡', value: ml?.tiktok?.count, color: '#2D3436' },
              { icon: 'YT', label: '유튜브', value: ml?.youtube?.count, color: '#FF0000' },
            ].map((ch, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < 2 ? '1px solid #F5F5F7' : 'none' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: ch.color, width: 20 }}>{ch.icon}</span>
                <span style={{ fontSize: 12.5, color: '#6E6E73', flex: 1 }}>{ch.label}</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1D1D1F' }}>{fmtCount(ch.value)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid #F2F2F5' }}>
              <span style={{ fontSize: 11, color: '#AEAEB2' }}>전체 팔로워</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1D1D1F' }}>{fmtCount(ml?.total)}</span>
            </div>
          </div>
        </div>

        {/* Row 3: 활동 KPI + 연결상태 + 에이전트 활동 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 16, marginBottom: 16 }}>
          {/* 활동 KPI */}
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F' }}>채널 활동 현황</span>
              <span style={{ fontSize: 10.5, color: '#AEAEB2' }}>오늘 ({nowKST()}) 기준</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: '콘텐츠 발행', value: stats?.contentCount, sub: 'Zernio 누적' },
                { label: '댓글 응대', value: stats?.engagement?.comments, sub: '오늘 누적' },
                { label: 'DM 응대', value: stats?.engagement?.dm, sub: '오늘 누적' },
              ].map((kpi, i) => (
                <div key={i} style={{ background: '#F5F5F7', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#AEAEB2', marginBottom: 6 }}>{kpi.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#1D1D1F', letterSpacing: '-0.03em', lineHeight: 1 }}>{kpi.value != null ? kpi.value.toLocaleString('ko-KR') : '0'}</div>
                  <div style={{ fontSize: 10, color: '#AEAEB2', marginTop: 4 }}>{kpi.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 채널 연결 상태 */}
          <div style={CARD}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F', marginBottom: 12 }}>채널 연결 상태</div>
            {Object.entries(connKeys).map(([key, label], i, arr) => {
              const val = connections[key];
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < arr.length - 1 ? '1px solid #F5F5F7' : 'none' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: val?.connected ? '#34C759' : '#D1D1D6', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#1D1D1F', flex: 1 }}>{label}</span>
                  <span style={{ fontSize: 10.5, color: val?.connected ? '#34C759' : '#AEAEB2' }}>
                    {val?.connected ? '연결' : '미연결'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Row 4: Agent Activity */}
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F' }}>에이전트 최근 활동</span>
            <span style={{ fontSize: 10.5, color: '#AEAEB2' }}>최근 10건</span>
          </div>
          {activityLog.length > 0 ? activityLog.map((item, i) => {
            const ag = agents.find(a => a.name === item.agent || a.id === item.agentId) || agents[0];
            const AgIcon = ag?.icon;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: i < activityLog.length - 1 ? '1px solid #F5F5F7' : 'none' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: '#F5F5F7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
            <div style={{ padding: '28px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 12.5, color: '#AEAEB2' }}>아직 활동 내역이 없습니다.</div>
              <div style={{ fontSize: 11.5, color: '#D1D1D6', marginTop: 4 }}>에이전트가 작업을 시작하면 자동으로 기록됩니다.</div>
            </div>
          )}
        </div>

      </div>
    </>
  );
}

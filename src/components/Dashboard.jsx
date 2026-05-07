import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, Link2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import useDashboardStore from '../store/dashboardStore';
import { agents } from '../lib/agents';

const fmtKRW = (v) => (v != null && v > 0) ? `${v.toLocaleString('ko-KR')}원` : '-';
const fmtCount = (v) => (v != null && v > 0) ? v.toLocaleString('ko-KR') : '-';

const tip = {
  background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 8,
  color: '#1D1D1F', fontSize: 12, padding: '8px 12px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
};
const CARD = { background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '18px 20px' };
const DIVIDER = { borderTop: '1px solid #F2F2F5', margin: '10px 0' };

function nowKST() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}
function thisMonthLabel() {
  const d = new Date(Date.now() + 9 * 3600000);
  return `${d.getUTCMonth() + 1}월`;
}
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

function GrowthBadge({ rate }) {
  if (rate == null) return <span style={{ fontSize: 11, color: '#AEAEB2' }}>전월비 -</span>;
  const n = parseFloat(rate);
  const color = n > 0 ? '#34C759' : n < 0 ? '#FF3B30' : '#AEAEB2';
  const Icon = n > 0 ? TrendingUp : n < 0 ? TrendingDown : Minus;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color }}>
      <Icon size={11} />전월비 {n > 0 ? '+' : ''}{n}%
    </span>
  );
}

function PeriodCol({ period, value, sub }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#AEAEB2', fontWeight: 500, marginBottom: 4 }}>{period}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#1D1D1F', letterSpacing: '-0.03em', lineHeight: 1.1 }}>{fmtKRW(value)}</div>
      {sub && <div style={{ fontSize: 10, color: '#AEAEB2', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { stats, revenueData, fetchStats } = useDashboardStore();
  const [googleStatus, setGoogleStatus] = useState(null);
  const [igRefreshing, setIgRefreshing] = useState(false);

  useEffect(() => {
    fetchStats();
    fetch('/api/auth/google-status').then(r => r.json()).then(data => {
      if (data.connected) { localStorage.setItem('google_connected', 'true'); localStorage.setItem('google_email', data.email || ''); }
      setGoogleStatus(data);
    }).catch(() => {});
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true') {
      localStorage.setItem('google_connected', 'true');
      setGoogleStatus({ connected: true, email: params.get('email') || '' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const ym = stats?.yuminhye || {};
  const ml = stats?.millimilli || {};
  const connections = stats?.connections || {};
  const activityLog = stats?.activityLog || [];
  const chief = stats?.chiefReport;
  const cs = chief?.salesSummary;

  // === 매출 3개 기간 ===
  // 전일 마감: chief-report에서 (매일 8시 갱신)
  const prevDate = cs?.date || '-';
  const krYesterday = cs?.korea?.total || 0; // 당월 누적(전일 마감 기준)
  const krMonth = (stats?.channelSales?.oliveyoung || 0) + (stats?.channelSales?.smartstore || 0) + (stats?.channelSales?.cafe24 || 0);
  const krYear = (stats?.channelSalesYearly?.oliveyoung || 0) + (stats?.channelSalesYearly?.smartstore || 0) + (stats?.channelSalesYearly?.cafe24 || 0);

  const chMonth = stats?.channelSales || {};
  const chYear = stats?.channelSalesYearly || {};

  const growthRate = cs?.growthRate;

  const chartData = stats?.monthlyRevenue?.length
    ? stats.monthlyRevenue
    : revenueData.map(d => ({ month: d.month, total: (d['올리브영'] || 0) + (d['스마트스토어'] || 0) + (d['자사몰'] || 0) + (d['해외'] || 0) }));

  const connKeys = {
    zernio: 'Zernio (SNS)',
    google: 'Google',
    anthropic: 'Anthropic',
    instagram: 'Instagram',
    oliveyoung: '올리브영',
    naverAds: '네이버광고',
    googleAds: '구글광고',
    ga4: 'GA4',
  };

  const channels = [
    { label: '올리브영', key: 'oliveyoung', dot: '#5E6AD2' },
    { label: '스마트스토어', key: 'smartstore', dot: '#7C6BDE' },
    { label: '카페24 자사몰', key: 'cafe24', dot: '#A78BFA' },
  ];

  return (
    <>
      {/* Header */}
      <div style={{ height: 50, padding: '0 24px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #E5E5EA', background: '#FFFFFF', flexShrink: 0, gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F' }}>MILLI AI 대시보드</span>
        <span style={{ fontSize: 11, color: '#AEAEB2' }}>· {nowKST()} 기준</span>
        <div style={{ flex: 1 }} />
        {googleStatus?.connected ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <CheckCircle2 size={13} color="#34C759" />
            <span style={{ fontSize: 12, color: '#6E6E73' }}>{googleStatus.email}</span>
          </div>
        ) : (
          <button onClick={() => { window.location.href = '/api/auth/google'; }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: '1px solid #E5E5EA', background: '#FFF', color: '#6E6E73', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Link2 size={12} />구글 계정 연동
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 32px' }}>

        {/* ── 매출 섹션 ── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>매출 현황</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 12 }}>

            {/* 한국 매출 카드 */}
            <div style={CARD}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>🇰🇷 한국 매출</span>
                <GrowthBadge rate={growthRate} />
              </div>

              {/* 3열 기간 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #F2F2F5' }}>
                <PeriodCol period={`전일 마감 (${prevDate})`} value={krYesterday} sub="당월 누적 기준" />
                <div style={{ width: 1, background: '#F2F2F5' }} />
                <PeriodCol period={`${thisMonthLabel()} 누적`} value={krMonth} />
                <div style={{ width: 1, background: '#F2F2F5' }} />
                <PeriodCol period="2026년 누적" value={krYear} />
              </div>

              {/* 채널 breakdown: 당월 vs 연간 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 10, color: '#AEAEB2', width: 80 }}></span>
                  <span style={{ fontSize: 10, color: '#AEAEB2', flex: 1, textAlign: 'right' }}>당월</span>
                  <span style={{ fontSize: 10, color: '#5E6AD2', width: 70, textAlign: 'right' }}>연간YTD</span>
                </div>
                {channels.map((c) => (
                  <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 4, height: 4, borderRadius: 2, background: c.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, color: '#6E6E73', width: 76 }}>{c.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', flex: 1, textAlign: 'right' }}>{fmtKRW(chMonth[c.key])}</span>
                    <span style={{ fontSize: 11, color: '#5E6AD2', width: 70, textAlign: 'right' }}>{fmtKRW(chYear[c.key])}</span>
                  </div>
                ))}
              </div>

              <div style={DIVIDER} />

              {/* 미국 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>🇺🇸 미국 매출</span>
                <span style={{ fontSize: 12, color: '#AEAEB2' }}>아마존 연결 대기 중</span>
              </div>
              {cs?.usa?.amazon > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <PeriodCol period="당월" value={cs.usa.amazon} />
                  <div style={{ width: 1, background: '#F2F2F5' }} />
                  <PeriodCol period="2026년 YTD" value={cs.usa.ytd} />
                </div>
              )}
            </div>

            {/* 월별 추이 차트 */}
            <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>2026 월별 매출 추이</span>
                <span style={{ fontSize: 11, color: '#AEAEB2' }}>한국 전채널 합산</span>
              </div>
              <div style={{ flex: 1, minHeight: 160 }}>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="month" stroke="#AEAEB2" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#AEAEB2" fontSize={10} tickLine={false} axisLine={false} width={60}
                      tickFormatter={v => v >= 10000000 ? `${(v / 10000000).toFixed(0)}천만` : `${(v / 10000).toFixed(0)}만`} />
                    <Tooltip contentStyle={tip} formatter={v => [fmtKRW(v), '총매출']} cursor={{ stroke: '#E5E5EA' }} />
                    <Line type="monotone" dataKey="total" stroke="#5E6AD2" strokeWidth={2}
                      dot={{ r: 3, fill: '#5E6AD2', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {chief?.report && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F2F2F5' }}>
                  <div style={{ fontSize: 10.5, color: '#AEAEB2', marginBottom: 4 }}>AI 커머스MD 아침 8시 보고 · {prevDate}</div>
                  <div style={{ fontSize: 12, color: '#1D1D1F', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{chief.report.slice(0, 200)}{chief.report.length > 200 ? '...' : ''}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 팔로워 섹션 ── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>채널 팔로워</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { name: '유민혜', data: ym, source: 'Zernio + 스크래핑', refresh: true },
              { name: '밀리밀리', data: ml, source: 'Zernio 실시간', refresh: false },
            ].map((acc) => (
              <div key={acc.name} style={CARD}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>{acc.name}</span>
                    <span style={{ fontSize: 10.5, color: '#AEAEB2', marginLeft: 6 }}>팔로워 · {acc.source}</span>
                  </div>
                  {acc.refresh && (
                    <button onClick={() => { setIgRefreshing(true); fetch('/api/scrape/instagram-followers').then(() => fetchStats()).catch(() => {}).finally(() => setIgRefreshing(false)); }}
                      disabled={igRefreshing} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                      <RefreshCw size={12} color={igRefreshing ? '#AEAEB2' : '#5E6AD2'} />
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    { icon: 'IG', label: '인스타그램', key: 'instagram', color: '#E1306C' },
                    { icon: 'TT', label: '틱톡', key: 'tiktok', color: '#2D3436' },
                    { icon: 'YT', label: '유튜브', key: 'youtube', color: '#FF0000' },
                  ].map((ch) => (
                    <div key={ch.key} style={{ background: '#F5F5F7', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: ch.color, marginBottom: 4 }}>{ch.icon}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1D1D1F', letterSpacing: '-0.02em' }}>{fmtCount(acc.data?.[ch.key]?.count)}</div>
                      <div style={{ fontSize: 10, color: '#AEAEB2', marginTop: 2 }}>{ch.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid #F2F2F5' }}>
                  <span style={{ fontSize: 11, color: '#AEAEB2' }}>전체 팔로워</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#1D1D1F' }}>{fmtCount(acc.data?.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 활동 현황 + 연결 상태 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12, marginBottom: 14 }}>
          {/* 채널 활동 KPI */}
          <div style={CARD}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', marginBottom: 12 }}>
              채널 활동 현황
              <span style={{ fontSize: 10.5, color: '#AEAEB2', fontWeight: 400, marginLeft: 6 }}>오늘 ({nowKST()}) 기준</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { label: '콘텐츠 발행', value: stats?.contentCount ?? 0, sub: 'Zernio 누적' },
                { label: '댓글 응대', value: stats?.engagement?.comments ?? 0, sub: '오늘 누적' },
                { label: 'DM 응대', value: stats?.engagement?.dm ?? 0, sub: '오늘 누적' },
              ].map((k, i) => (
                <div key={i} style={{ background: '#F5F5F7', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10.5, color: '#AEAEB2', marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: '#1D1D1F', letterSpacing: '-0.03em', lineHeight: 1 }}>{k.value.toLocaleString()}</div>
                  <div style={{ fontSize: 10, color: '#AEAEB2', marginTop: 4 }}>{k.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 채널 연결 상태 */}
          <div style={CARD}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>채널 연결 상태</div>
            {Object.entries(connKeys).map(([key, label], i, arr) => {
              const val = connections[key];
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', borderBottom: i < arr.length - 1 ? '1px solid #F5F5F7' : 'none' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: val?.connected ? '#34C759' : '#D1D1D6', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#1D1D1F', flex: 1 }}>{label}</span>
                  <span style={{ fontSize: 10.5, color: val?.connected ? '#34C759' : '#AEAEB2' }}>{val?.connected ? '연결' : '-'}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 에이전트 활동 로그 ── */}
        <div style={CARD}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', marginBottom: 12 }}>
            에이전트 최근 활동
            <span style={{ fontSize: 10.5, color: '#AEAEB2', fontWeight: 400, marginLeft: 6 }}>최근 10건</span>
          </div>
          {activityLog.length > 0 ? activityLog.map((item, i) => {
            const ag = agents.find(a => a.name === item.agent || a.id === item.agentId) || agents[0];
            const AgIcon = ag?.icon;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: i < activityLog.length - 1 ? '1px solid #F5F5F7' : 'none' }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: '#F5F5F7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {AgIcon && <AgIcon size={12} strokeWidth={1.8} color="#5E6AD2" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>{item.agent}</span>
                  <span style={{ fontSize: 12.5, color: '#6E6E73', marginLeft: 6 }}>{item.action}</span>
                  {item.detail && <div style={{ fontSize: 11.5, color: '#AEAEB2', marginTop: 1 }}>{item.detail}</div>}
                </div>
                <span style={{ fontSize: 11, color: '#AEAEB2', flexShrink: 0, marginTop: 2 }}>{timeAgo(item.timestamp)}</span>
              </div>
            );
          }) : (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 12.5, color: '#AEAEB2' }}>아직 활동 내역이 없습니다.</div>
              <div style={{ fontSize: 11.5, color: '#D1D1D6', marginTop: 4 }}>에이전트 작업 시작 시 자동 기록됩니다.</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, Link2, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import useDashboardStore from '../store/dashboardStore';
import { agents } from '../lib/agents';

const fmtKRW = (v) => (v != null && v > 0) ? `${v.toLocaleString('ko-KR')}원` : '-';
const fmtCount = (v) => (v != null && v > 0) ? v.toLocaleString('ko-KR') : '-';
const fmtM = (v) => v >= 100000000 ? `${(v / 100000000).toFixed(1)}억` : v >= 10000000 ? `${(v / 10000000).toFixed(0)}천만` : v >= 10000 ? `${(v / 10000).toFixed(0)}만` : v > 0 ? v.toLocaleString() : '0';

const tip = {
  background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 8,
  color: '#1D1D1F', fontSize: 12, padding: '8px 12px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
};
const CARD = { background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '18px 20px' };
const SEC_LABEL = { fontSize: 11, fontWeight: 600, color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 };

function nowKST() { return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); }
function thisMonthLabel() { const d = new Date(Date.now() + 9 * 3600000); return `${d.getUTCMonth() + 1}월`; }
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

function PeriodBlock({ label, value, sub, accent }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: '#AEAEB2', fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent || '#1D1D1F', letterSpacing: '-0.03em', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#AEAEB2', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const CH_COLORS = {
  oliveyoung: '#5E6AD2',
  smartstore: '#F59E0B',
  cafe24: '#10B981',
  total: '#1D1D1F',
};
const CH_LABELS = { oliveyoung: '올리브영', smartstore: '스마트스토어', cafe24: '카페24 자사몰', total: '한국 합계' };

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
  // connections — 해피톡 제외
  const RAW_CONN = stats?.connections || {};
  const connections = Object.fromEntries(Object.entries(RAW_CONN).filter(([k]) => k !== 'happytalk'));
  const activityLog = stats?.activityLog || [];
  const chief = stats?.chiefReport;
  const cs = chief?.salesSummary;
  const oyStatus = stats?.oliveyoungRevenue?.status;

  // === 매출 데이터 ===
  const chMonth = stats?.channelSales || {};
  const chYear = stats?.channelSalesYearly || {};

  const krMonth = (chMonth.oliveyoung || 0) + (chMonth.smartstore || 0) + (chMonth.cafe24 || 0);
  const krYear  = (chYear.oliveyoung  || 0) + (chYear.smartstore  || 0) + (chYear.cafe24  || 0);
  const krYesterday = cs?.korea?.total || 0; // chief report 전일 마감 기준 당월 누적

  const usMonth = chMonth.export || 0;
  const usYear  = chYear.export  || 0;
  const usYesterday = cs?.usa?.amazon || 0;

  // 전월 성장률
  const growthRate = cs?.growthRate;
  const prevDate = cs?.date || '-';

  // === 차트 데이터 ===
  const chartData = stats?.monthlyRevenue?.length
    ? stats.monthlyRevenue
    : revenueData.map(d => ({
        month: d.month,
        oliveyoung: d['올리브영'] || 0,
        smartstore: d['스마트스토어'] || 0,
        cafe24: d['자사몰'] || 0,
        total: (d['올리브영'] || 0) + (d['스마트스토어'] || 0) + (d['자사몰'] || 0),
      }));

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

  return (
    <>
      {/* Header */}
      <div style={{ height: 50, padding: '0 24px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #E5E5EA', background: '#FFFFFF', flexShrink: 0, gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F' }}>MILLI AI 대시보드</span>
        <span style={{ fontSize: 11, color: '#AEAEB2' }}>· {nowKST()} 기준</span>
        <div style={{ flex: 1 }} />
        {oyStatus === 'error' && (
          <button onClick={() => { window.location.href = '/api/auth/google'; }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 7, border: '1px solid #FF3B30', background: '#FFF5F5', color: '#FF3B30', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', marginRight: 8 }}>
            <AlertCircle size={12} />올리브영 Google 재연동 필요
          </button>
        )}
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

        {/* ── 매출 현황 ── */}
        <div style={{ marginBottom: 14 }}>
          <div style={SEC_LABEL}>매출 현황</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

            {/* 한국 매출 */}
            <div style={CARD}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>
                🇰🇷 한국
                {growthRate != null && (
                  <span style={{ fontSize: 11, color: parseFloat(growthRate) >= 0 ? '#34C759' : '#FF3B30', marginLeft: 8 }}>
                    {parseFloat(growthRate) >= 0 ? '▲' : '▼'} 전월비 {parseFloat(growthRate) >= 0 ? '+' : ''}{growthRate}%
                  </span>
                )}
              </div>
              {/* 전일/당월/연간 */}
              <div style={{ display: 'flex', gap: 8, paddingBottom: 10, borderBottom: '1px solid #F2F2F5' }}>
                <PeriodBlock label={`전일 마감 (${prevDate})`} value={fmtKRW(krYesterday) !== '-' ? fmtKRW(krYesterday) : fmtKRW(krMonth)} sub="당월 누적 기준" />
                <div style={{ width: 1, background: '#F2F2F5' }} />
                <PeriodBlock label={`${thisMonthLabel()} 누적`} value={fmtKRW(krMonth)} />
                <div style={{ width: 1, background: '#F2F2F5' }} />
                <PeriodBlock label="2026 YTD" value={fmtKRW(krYear)} accent="#5E6AD2" />
              </div>
              {/* 채널 breakdown */}
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex' }}>
                  <span style={{ fontSize: 10, color: '#AEAEB2', flex: 1 }}></span>
                  <span style={{ fontSize: 10, color: '#AEAEB2', width: 72, textAlign: 'right' }}>당월</span>
                  <span style={{ fontSize: 10, color: '#5E6AD2', width: 72, textAlign: 'right' }}>연간</span>
                </div>
                {[
                  { label: '올리브영', key: 'oliveyoung', dot: CH_COLORS.oliveyoung },
                  { label: '스마트스토어', key: 'smartstore', dot: CH_COLORS.smartstore },
                  { label: '카페24 자사몰', key: 'cafe24', dot: CH_COLORS.cafe24 },
                ].map((c) => (
                  <div key={c.key} style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: 5, height: 5, borderRadius: 2, background: c.dot, flexShrink: 0, marginRight: 5 }} />
                    <span style={{ fontSize: 11.5, color: '#6E6E73', flex: 1 }}>{c.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', width: 72, textAlign: 'right' }}>{fmtKRW(chMonth[c.key])}</span>
                    <span style={{ fontSize: 11, color: '#5E6AD2', width: 72, textAlign: 'right' }}>{fmtKRW(chYear[c.key])}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 미국 매출 */}
            <div style={CARD}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>🇺🇸 미국 수출</div>
              <div style={{ display: 'flex', gap: 8, paddingBottom: 10, borderBottom: '1px solid #F2F2F5' }}>
                <PeriodBlock label="전일 마감" value={usYesterday > 0 ? `$${usYesterday.toLocaleString()}` : '-'} />
                <div style={{ width: 1, background: '#F2F2F5' }} />
                <PeriodBlock label={`${thisMonthLabel()} 누적`} value={usMonth > 0 ? `$${usMonth.toLocaleString()}` : '-'} />
                <div style={{ width: 1, background: '#F2F2F5' }} />
                <PeriodBlock label="2026 YTD" value={usYear > 0 ? `$${usYear.toLocaleString()}` : '-'} accent="#5E6AD2" />
              </div>
              <div style={{ marginTop: 10 }}>
                {[
                  { label: 'Amazon US', status: false },
                  { label: 'TikTok Shop US', status: false },
                  { label: 'Shopee', status: false },
                  { label: 'Qoo10', status: false },
                ].map((ch, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: i < 3 ? '1px solid #F5F5F7' : 'none' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: ch.status ? '#34C759' : '#D1D1D6' }} />
                    <span style={{ fontSize: 11.5, color: '#6E6E73', flex: 1 }}>{ch.label}</span>
                    <span style={{ fontSize: 11, color: '#AEAEB2' }}>연결 대기 중</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 월별 추이 — 풀너비 */}
          <div style={{ ...CARD, marginTop: 12, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>2026 월별 채널별 추이</span>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <XAxis dataKey="month" stroke="#AEAEB2" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#AEAEB2" fontSize={9} tickLine={false} axisLine={false} width={48}
                  tickFormatter={v => v >= 100000000 ? `${(v/100000000).toFixed(1)}억` : v >= 10000000 ? `${(v/10000000).toFixed(0)}천만` : v >= 10000 ? `${(v/10000).toFixed(0)}만` : '0'} />
                <Tooltip contentStyle={tip}
                  formatter={(v, name) => [fmtKRW(v), CH_LABELS[name] || name]}
                  cursor={{ stroke: '#E5E5EA' }} />
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                  formatter={(v) => CH_LABELS[v] || v} />
                <Line type="monotone" dataKey="oliveyoung" stroke={CH_COLORS.oliveyoung} strokeWidth={1.8}
                  dot={{ r: 2.5, fill: CH_COLORS.oliveyoung, strokeWidth: 0 }} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="smartstore" stroke={CH_COLORS.smartstore} strokeWidth={1.8}
                  dot={{ r: 2.5, fill: CH_COLORS.smartstore, strokeWidth: 0 }} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="cafe24" stroke={CH_COLORS.cafe24} strokeWidth={1.8}
                  dot={{ r: 2.5, fill: CH_COLORS.cafe24, strokeWidth: 0 }} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="total" stroke={CH_COLORS.total} strokeWidth={2.5}
                  strokeDasharray="4 2"
                  dot={{ r: 2.5, fill: CH_COLORS.total, strokeWidth: 0 }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
            {chief?.report && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #F2F2F5' }}>
                <div style={{ fontSize: 10, color: '#AEAEB2', marginBottom: 3 }}>AI 커머스MD · {prevDate} 보고</div>
                <div style={{ fontSize: 11.5, color: '#1D1D1F', lineHeight: 1.6 }}>{chief.report.slice(0, 120)}...</div>
              </div>
            )}
          </div>
        </div>

        {/* ── 팔로워 ── */}
        <div style={{ marginBottom: 14 }}>
          <div style={SEC_LABEL}>채널 팔로워</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { name: '유민혜', data: ym, source: 'Zernio + 스크래핑', refresh: true },
              { name: '밀리밀리', data: ml, source: 'Zernio 실시간', refresh: false },
            ].map((acc) => (
              <div key={acc.name} style={CARD}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>{acc.name}</span>
                    <span style={{ fontSize: 10.5, color: '#AEAEB2', marginLeft: 6 }}>{acc.source}</span>
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
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1D1D1F', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                        {fmtCount(acc.data?.[ch.key]?.count)}
                      </div>
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

        {/* ── 활동 + 연결 상태 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 210px', gap: 12, marginBottom: 14 }}>
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

          <div style={CARD}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>채널 연결 상태</div>
            {Object.entries(connKeys).map(([key, label], i, arr) => {
              const val = connections[key];
              const hasError = key === 'oliveyoung' && oyStatus === 'error';
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', borderBottom: i < arr.length - 1 ? '1px solid #F5F5F7' : 'none' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: hasError ? '#FF3B30' : val?.connected ? '#34C759' : '#D1D1D6', flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, color: '#1D1D1F', flex: 1 }}>{label}</span>
                  <span style={{ fontSize: 10.5, color: hasError ? '#FF3B30' : val?.connected ? '#34C759' : '#AEAEB2' }}>
                    {hasError ? '오류' : val?.connected ? '연결' : '-'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 에이전트 활동 ── */}
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
                <span style={{ fontSize: 11, color: '#AEAEB2', flexShrink: 0 }}>{timeAgo(item.timestamp)}</span>
              </div>
            );
          }) : (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 12.5, color: '#AEAEB2' }}>아직 활동 내역이 없습니다.</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

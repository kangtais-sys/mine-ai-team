import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, Link2, AlertCircle, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import useDashboardStore from '../store/dashboardStore';
import { agents } from '../lib/agents';

const fmtKRW = (v) => (v != null && v > 0) ? `${Math.round(v).toLocaleString('ko-KR')}원` : '-';
const fmtUSD = (v) => (v != null && v > 0) ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '-';
const fmtCount = (v) => (v != null && v > 0) ? v.toLocaleString('ko-KR') : '-';
const fmtM = (v) => v >= 100000000 ? `${(v / 100000000).toFixed(1)}억` : v >= 10000000 ? `${(v / 10000000).toFixed(0)}천만` : v >= 10000 ? `${(v / 10000).toFixed(0)}만` : v > 0 ? v.toLocaleString() : '0';

const CARD = { background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '18px 20px' };
const SEC_LABEL = { fontSize: 11, fontWeight: 600, color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 };
const tip = { background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 8, color: '#1D1D1F', fontSize: 12, padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' };

const CH_COLORS = { oliveyoung: '#5E6AD2', smartstore: '#F59E0B', cafe24: '#10B981', total: '#1D1D1F' };
const CH_LABELS = { oliveyoung: '올리브영', smartstore: '스마트스토어', cafe24: '카페24 자사몰', total: '한국 합계' };

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

function SectionTitle({ children }) {
  return <div style={SEC_LABEL}>{children}</div>;
}

function ConnDot({ ok, size = 7 }) {
  return <div style={{ width: size, height: size, borderRadius: '50%', background: ok ? '#34C759' : '#D1D1D6', flexShrink: 0 }} />;
}

function SalesTable({ title, flag, rows, currency = 'KRW' }) {
  const fmt = currency === 'USD' ? fmtUSD : fmtKRW;
  return (
    <div style={{ ...CARD }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', marginBottom: 12 }}>{flag} {title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', fontSize: 10, color: '#AEAEB2', fontWeight: 500, paddingBottom: 6, borderBottom: '1px solid #F2F2F5' }}>채널</th>
            <th style={{ textAlign: 'right', fontSize: 10, color: '#AEAEB2', fontWeight: 500, paddingBottom: 6, borderBottom: '1px solid #F2F2F5' }}>전일</th>
            <th style={{ textAlign: 'right', fontSize: 10, color: '#AEAEB2', fontWeight: 500, paddingBottom: 6, borderBottom: '1px solid #F2F2F5' }}>{thisMonthLabel()} 누적</th>
            <th style={{ textAlign: 'right', fontSize: 10, color: '#5E6AD2', fontWeight: 500, paddingBottom: 6, borderBottom: '1px solid #F2F2F5' }}>2026 YTD</th>
            <th style={{ textAlign: 'center', fontSize: 10, color: '#AEAEB2', fontWeight: 500, paddingBottom: 6, borderBottom: '1px solid #F2F2F5' }}>연결</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={{ padding: '7px 0', borderBottom: i < rows.length - 1 ? '1px solid #F5F5F7' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {row.dot && <div style={{ width: 5, height: 5, borderRadius: 2, background: row.dot }} />}
                  <span style={{ color: '#1D1D1F' }}>{row.label}</span>
                </div>
              </td>
              <td style={{ textAlign: 'right', padding: '7px 0', borderBottom: i < rows.length - 1 ? '1px solid #F5F5F7' : 'none', color: '#6E6E73' }}>
                {row.daily != null ? fmt(row.daily) : '-'}
              </td>
              <td style={{ textAlign: 'right', padding: '7px 0', borderBottom: i < rows.length - 1 ? '1px solid #F5F5F7' : 'none', fontWeight: 600, color: '#1D1D1F' }}>
                {fmt(row.monthly)}
              </td>
              <td style={{ textAlign: 'right', padding: '7px 0', borderBottom: i < rows.length - 1 ? '1px solid #F5F5F7' : 'none', color: '#5E6AD2', fontWeight: 600 }}>
                {fmt(row.yearly)}
              </td>
              <td style={{ textAlign: 'center', padding: '7px 0', borderBottom: i < rows.length - 1 ? '1px solid #F5F5F7' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
                  <ConnDot ok={row.connected} />
                  <span style={{ fontSize: 10, color: row.connected ? '#34C759' : '#AEAEB2' }}>
                    {row.connected ? row.sourceLabel || '연결' : '미연결'}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const chMonth = stats?.channelSales || {};
  const chYear = stats?.channelSalesYearly || {};
  const yday = stats?.yesterdaySales || {};
  const agentConns = stats?.agentConnections || {};
  const agentReps = stats?.agentReports || {};

  // 한국 B2C
  const krMonth = stats?.krMonthTotal || (chMonth.oliveyoung || 0) + (chMonth.smartstore || 0) + (chMonth.cafe24 || 0);
  const krYear = stats?.krYearTotal || (chYear.oliveyoung || 0) + (chYear.smartstore || 0) + (chYear.cafe24 || 0);
  const krDaily = yday.total || yday.oliveyoung || 0;

  // 미국 B2C (Amazon US + TikTok Shop US)
  const usB2c = stats?.usB2cSales || {};
  const usB2cYear = stats?.usB2cSalesYearly || {};
  const usMonth = stats?.usMonthTotal || usB2c.amazon || 0;
  const usYear = stats?.usYearTotal || usB2cYear.amazon || 0;

  // 수출 B2B (수출시트)
  const b2bData = stats?.b2bExportRevenue || null;
  const b2bConnected = b2bData?.status === 'connected';

  const conn = stats?.connections || {};
  const agentKeyList = ['creator','community','cs','marketer','commerce','management','brand','export','chief'];

  // 차트 데이터
  const chartData = stats?.monthlyRevenue?.length
    ? stats.monthlyRevenue
    : revenueData.map(d => ({
        month: d.month,
        oliveyoung: d['올리브영'] || 0,
        smartstore: d['스마트스토어'] || 0,
        cafe24: d['자사몰'] || 0,
        total: (d['올리브영'] || 0) + (d['스마트스토어'] || 0) + (d['자사몰'] || 0),
      }));

  return (
    <>
      {/* Header */}
      <div style={{ height: 50, padding: '0 24px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #E5E5EA', background: '#FFFFFF', flexShrink: 0, gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F' }}>MILLI AI 대시보드</span>
        <span style={{ fontSize: 11, color: '#AEAEB2' }}>· {nowKST()} KST</span>
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

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 40px' }}>

        {/* ── 1. 전체 매출 합계 (일/월/연) ── */}
        <div style={{ marginBottom: 14 }}>
          <SectionTitle>전체 매출 합계</SectionTitle>
          <div style={{ ...CARD, padding: '16px 20px' }}>
            {/* 헤더 행 */}
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr', gap: 0, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #F2F2F5' }}>
              <div />
              <div style={{ fontSize: 10, color: '#AEAEB2', fontWeight: 500, textAlign: 'right' }}>전일</div>
              <div style={{ fontSize: 10, color: '#AEAEB2', fontWeight: 500, textAlign: 'right' }}>{thisMonthLabel()} 누적</div>
              <div style={{ fontSize: 10, color: '#5E6AD2', fontWeight: 500, textAlign: 'right' }}>2026 YTD</div>
            </div>
            {/* 한국 B2C */}
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr', gap: 0, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #F5F5F7' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F' }}>🇰🇷 한국</div>
              <div style={{ textAlign: 'right', fontSize: 13, color: '#6E6E73' }}>{krDaily > 0 ? fmtKRW(krDaily) : '-'}</div>
              <div style={{ textAlign: 'right', fontSize: 17, fontWeight: 700, color: '#1D1D1F', letterSpacing: '-0.02em' }}>{fmtM(krMonth)}</div>
              <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: '#5E6AD2' }}>{fmtM(krYear)}</div>
            </div>
            {/* 미국 B2C */}
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr', gap: 0, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #F5F5F7' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F' }}>🇺🇸 미국 B2C</div>
              <div style={{ textAlign: 'right', fontSize: 13, color: '#6E6E73' }}>-</div>
              <div style={{ textAlign: 'right', fontSize: 17, fontWeight: 700, color: '#1D1D1F', letterSpacing: '-0.02em' }}>{usMonth > 0 ? fmtUSD(usMonth) : '-'}</div>
              <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: '#5E6AD2' }}>{usYear > 0 ? fmtUSD(usYear) : '-'}</div>
            </div>
            {/* 수출 B2B */}
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr', gap: 0, alignItems: 'center', padding: '7px 0' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F' }}>📦 수출 B2B</div>
              <div style={{ textAlign: 'right', fontSize: 13, color: '#6E6E73' }}>-</div>
              <div style={{ textAlign: 'right', fontSize: 13, color: b2bConnected ? '#6E6E73' : '#AEAEB2' }}>
                {b2bConnected ? `${b2bData.totalRows || 0}건` : '미연결'}
              </div>
              <div style={{ textAlign: 'right', fontSize: 13, color: b2bConnected ? '#6E6E73' : '#AEAEB2' }}>
                {b2bConnected ? '시트 연결됨' : '수출시트 미연결'}
              </div>
            </div>
          </div>
        </div>

        {/* ── 2. 한국 채널별 매출 ── */}
        <div style={{ marginBottom: 14 }}>
          <SectionTitle>한국 채널별 매출</SectionTitle>
          <SalesTable
            title="한국"
            flag="🇰🇷"
            currency="KRW"
            rows={[
              {
                label: '올리브영',
                dot: CH_COLORS.oliveyoung,
                daily: yday.oliveyoung,
                monthly: chMonth.oliveyoung,
                yearly: chYear.oliveyoung,
                connected: !!process.env.OLIVEYOUNG_SHEET_ID || conn.oliveyoung?.connected,
                sourceLabel: 'Sheets',
              },
              {
                label: '네이버 스마트스토어',
                dot: CH_COLORS.smartstore,
                daily: null,
                monthly: chMonth.smartstore,
                yearly: chYear.smartstore,
                connected: conn.smartstore?.connected,
                sourceLabel: 'Naver API',
              },
              {
                label: '카페24 자사몰',
                dot: CH_COLORS.cafe24,
                daily: null,
                monthly: chMonth.cafe24,
                yearly: chYear.cafe24,
                connected: conn.cafe24?.connected,
                sourceLabel: 'API',
              },
            ]}
          />
        </div>

        {/* ── 3. 미국 B2C 채널별 매출 ── */}
        <div style={{ marginBottom: 14 }}>
          <SectionTitle>미국 B2C 채널별 매출</SectionTitle>
          <SalesTable
            title="미국 B2C"
            flag="🇺🇸"
            currency="USD"
            rows={[
              {
                label: 'Amazon US',
                dot: '#FF9900',
                daily: null,
                monthly: usB2c.amazon,
                yearly: usB2cYear.amazon,
                connected: conn.amazon?.connected,
                sourceLabel: 'SP-API',
              },
              { label: 'TikTok Shop US', dot: '#2D3436', daily: null, monthly: 0, yearly: 0, connected: false, sourceLabel: '' },
            ]}
          />
        </div>

        {/* ── 3b. 수출 B2B ── */}
        <div style={{ marginBottom: 14 }}>
          <SectionTitle>수출 B2B</SectionTitle>
          <div style={{ ...CARD }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>📦 수출 현황</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #F5F5F7' }}>
              <ConnDot ok={b2bConnected} />
              <span style={{ fontSize: 12, color: '#1D1D1F', flex: 1 }}>수출 시트 (EXPORT_SHEET_ID)</span>
              <span style={{ fontSize: 11, color: b2bConnected ? '#34C759' : '#AEAEB2' }}>
                {b2bConnected ? `${b2bData.totalRows}건 · Google Sheets` : '미연결'}
              </span>
            </div>
            {b2bConnected && b2bData.headers?.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 10, color: '#AEAEB2' }}>
                컬럼: {b2bData.headers.slice(0, 6).join(' · ')}
              </div>
            )}
            {!b2bConnected && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#AEAEB2' }}>
                EXPORT_SHEET_ID 환경변수를 설정하면 수출 B2B 데이터가 연결됩니다.
              </div>
            )}
          </div>
        </div>

        {/* ── 4. 채널 현황 (팔로워 + 게시물) ── */}
        <div style={{ marginBottom: 14 }}>
          <SectionTitle>채널 현황</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { name: '유민혜', data: ym, handle: '@lala_lounge_ / @yuminhye', refresh: true },
              { name: '밀리밀리', data: ml, handle: '@millimilli_official', refresh: false },
            ].map((acc) => (
              <div key={acc.name} style={CARD}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>{acc.name}</span>
                    <span style={{ fontSize: 10, color: '#AEAEB2', marginLeft: 6 }}>{acc.handle}</span>
                  </div>
                  {acc.refresh && (
                    <button onClick={() => { setIgRefreshing(true); fetch('/api/scrape/instagram-followers').then(() => fetchStats()).catch(() => {}).finally(() => setIgRefreshing(false)); }}
                      disabled={igRefreshing} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                      <RefreshCw size={12} color={igRefreshing ? '#AEAEB2' : '#5E6AD2'} />
                    </button>
                  )}
                </div>
                {/* 팔로워 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                  {[
                    { icon: 'IG', label: '인스타그램', key: 'instagram', color: '#E1306C' },
                    { icon: 'TT', label: '틱톡', key: 'tiktok', color: '#2D3436' },
                    { icon: 'YT', label: '유튜브', key: 'youtube', color: '#FF0000' },
                  ].map((ch) => (
                    <div key={ch.key} style={{ background: '#F5F5F7', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: ch.color, marginBottom: 3 }}>{ch.icon}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1D1D1F', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                        {fmtCount(acc.data?.[ch.key]?.count)}
                      </div>
                      <div style={{ fontSize: 9, color: '#AEAEB2', marginTop: 1 }}>{ch.label}</div>
                    </div>
                  ))}
                </div>
                {/* 합계 + 최근 7일 */}
                <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid #F2F2F5' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: '#AEAEB2' }}>전체 팔로워</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1D1D1F' }}>{fmtCount(acc.data?.total)}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: '#AEAEB2' }}>최근 7일 게시물</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1D1D1F' }}>
                      {stats?.contentCount != null ? '-' : '-'}
                    </div>
                    <div style={{ fontSize: 9, color: '#AEAEB2' }}>Zernio 데이터 준비중</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: '#AEAEB2' }}>평균 댓글</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1D1D1F' }}>
                      {stats?.engagement?.comments > 0 ? Math.round(stats.engagement.comments / 7) : '-'}
                    </div>
                    <div style={{ fontSize: 9, color: '#AEAEB2' }}>7일 평균</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 5. 에이전트 현황 ── */}
        <div style={{ marginBottom: 14 }}>
          <SectionTitle>에이전트 현황</SectionTitle>
          <div style={{ ...CARD, padding: '14px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
              {agentKeyList.map((id, i) => {
                const ag = agentConns[id] || {};
                const rep = agentReps[id];
                const isLast = i >= agentKeyList.length - 3;
                return (
                  <div key={id} style={{
                    padding: '10px 12px',
                    borderRight: (i + 1) % 3 !== 0 ? '1px solid #F2F2F5' : 'none',
                    borderBottom: !isLast ? '1px solid #F2F2F5' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <ConnDot ok={ag.connected} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F' }}>{ag.name || id}</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#AEAEB2', marginBottom: 2 }}>{ag.source || '-'}</div>
                    <div style={{ fontSize: 10, color: '#6E6E73', marginBottom: 3 }}>{ag.description || ''}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{
                        fontSize: 9.5, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                        background: ag.connected ? '#F0FFF4' : '#F5F5F7',
                        color: ag.connected ? '#34C759' : '#AEAEB2',
                      }}>
                        {ag.connected ? '연결' : '미연결'}
                      </span>
                      {rep?.generatedAt && (
                        <span style={{ fontSize: 9.5, color: '#AEAEB2' }}>· 오늘 보고 완료</span>
                      )}
                      {!rep?.generatedAt && ag.connected && (
                        <span style={{ fontSize: 9.5, color: '#AEAEB2' }}>· 8AM 보고 대기</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── 6. 연결 현황 상세 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12, marginBottom: 14 }}>
          {/* 월별 추이 차트 */}
          <div style={{ ...CARD }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>
              2026 월별 채널별 매출 추이
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
          </div>

          {/* 데이터 소스 연결 상태 */}
          <div style={CARD}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>데이터 소스 연결</div>
            {[
              { key: 'zernio', label: 'Zernio SNS', sub: 'SNS 자동화' },
              { key: 'anthropic', label: 'Anthropic', sub: 'Claude AI' },
              { key: 'amazon', label: 'Amazon', sub: 'SP-API' },
              { key: 'cafe24', label: 'Cafe24', sub: 'OAuth API' },
              { key: 'oliveyoung', label: '올리브영', sub: 'Sheets CSV' },
              { key: 'smartstore', label: '스마트스토어', sub: 'Naver API' },
              { key: 'instagram', label: 'Instagram', sub: 'Graph API' },
              { key: 'naverAds', label: '네이버 광고', sub: 'Ads API' },
              { key: 'googleAds', label: '구글 광고', sub: 'Google Ads' },
            ].map(({ key, label, sub }, i, arr) => {
              const c = conn[key];
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: i < arr.length - 1 ? '1px solid #F5F5F7' : 'none' }}>
                  <ConnDot ok={c?.connected} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 11.5, color: '#1D1D1F' }}>{label}</span>
                    <span style={{ fontSize: 9.5, color: '#AEAEB2', marginLeft: 4 }}>{sub}</span>
                  </div>
                  <span style={{ fontSize: 10.5, color: c?.connected ? '#34C759' : '#AEAEB2' }}>
                    {c?.connected ? '연결' : '-'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 7. 에이전트 활동 로그 ── */}
        <div style={CARD}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', marginBottom: 12 }}>
            에이전트 최근 활동
            <span style={{ fontSize: 10.5, color: '#AEAEB2', fontWeight: 400, marginLeft: 6 }}>최근 10건</span>
          </div>
          {(stats?.activityLog || []).length > 0 ? (stats.activityLog).map((item, i, arr) => {
            const ag = agents.find(a => a.name === item.agent || a.id === item.agentId) || agents[0];
            const AgIcon = ag?.icon;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid #F5F5F7' : 'none' }}>
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

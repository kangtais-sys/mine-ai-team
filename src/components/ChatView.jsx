import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Loader2, TrendingUp, TrendingDown, Users, MessageCircle, DollarSign, Star, Globe, Package, Headphones, ShoppingCart, FileText, BarChart3, CheckCircle2, XCircle, Circle, Target, Percent, Clock, Plus, Trash2, RefreshCw, Send, BookOpen, Zap } from 'lucide-react';
import useChatStore from '../store/chatStore';
import { getAgent } from '../lib/agents';

// ─── Helpers ────────────────────────────────────────────────

const fmtKRW = (v) => v > 0 ? `${Math.round(v).toLocaleString('ko-KR')}원` : '-';
const fmtUSD = (v) => v > 0 ? `$${Number(v).toFixed(0)}` : '-';
const fmt = (v) => {
  if (!v || v === 0) return '0';
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억`;
  if (v >= 10000000) return `${(v / 10000000).toFixed(0)}천만`;
  if (v >= 10000) return `${(v / 10000).toFixed(0)}만`;
  return v.toLocaleString();
};

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

// ─── Reusable Components ────────────────────────────────────

function KpiCard({ label, value, sub, accent, icon: Icon }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#AEAEB2', fontWeight: 500 }}>{label}</span>
        {Icon && <Icon size={13} strokeWidth={1.5} color="#D1D1D6" />}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || '#1D1D1F', lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#AEAEB2', marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function ConnBadge({ connected, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: connected ? 'rgba(52,199,89,0.06)' : '#F5F5F7' }}>
      {connected
        ? <CheckCircle2 size={11} color="#34C759" />
        : <Circle size={11} color="#D1D1D6" />}
      <span style={{ fontSize: 11, color: connected ? '#1D1D1F' : '#6E6E73', flex: 1 }}>{label}</span>
      <span style={{ fontSize: 10, color: connected ? '#34C759' : '#AEAEB2', fontWeight: 500 }}>
        {connected ? '연결됨' : '미연결'}
      </span>
    </div>
  );
}

// ─── ZernioStatusPanel ──────────────────────────────────────

function ZernioStatusPanel({ creatorData }) {
  const connected = creatorData?.status === 'connected';
  const followers = creatorData?.followers || {};

  const platforms = [
    { key: 'instagram', label: 'Instagram', abbr: 'IG', color: '#E1306C' },
    { key: 'tiktok', label: 'TikTok', abbr: 'TT', color: '#69C9D0' },
    { key: 'youtube', label: 'YouTube', abbr: 'YT', color: '#FF0000' },
  ];
  const accounts = ['yuminhye', 'millimilli'];

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F' }}>SNS 연동 상태</span>
        <span style={{ fontSize: 10, color: connected ? '#34C759' : '#AEAEB2', fontWeight: 500 }}>
          {connected ? 'Zernio 연동됨' : 'Zernio 미연결'}
        </span>
      </div>
      {accounts.map((acct) => (
        <div key={acct} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#6E6E73', marginBottom: 4 }}>
            @{acct}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {platforms.map((p) => {
              const count = followers[acct]?.[p.key];
              return (
                <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 8px', borderRadius: 6, background: connected ? 'rgba(52,199,89,0.06)' : '#F5F5F7' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: p.color, width: 18 }}>{p.abbr}</span>
                  <span style={{ fontSize: 11, color: connected ? '#1D1D1F' : '#6E6E73', flex: 1 }}>{p.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#1D1D1F' }}>
                    {connected && count ? fmt(count) : connected ? 'Zernio 연동됨' : '미연결'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Daily Report Card (공통) ───────────────────────────────

function DailyReportCard({ agentId }) {
  const [report, setReport] = useState(undefined);
  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(data => {
      const rep = data?.agentReports?.[agentId];
      setReport(rep || null);
    }).catch(() => setReport(null));
  }, [agentId]);

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F' }}>📋 오늘 8시 자동 보고</div>
        <span style={{
          fontSize: 9.5, fontWeight: 500,
          color: report?.generatedAt ? '#34C759' : '#AEAEB2',
          background: report?.generatedAt ? '#F0FFF4' : '#F5F5F7',
          padding: '2px 8px', borderRadius: 4,
        }}>
          {report === undefined ? '로딩 중' : report?.generatedAt ? '✓ 보고 완료' : '대기 중'}
        </span>
      </div>
      {report?.report ? (
        <>
          <div style={{ fontSize: 12, color: '#1D1D1F', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{report.report}</div>
          <div style={{ fontSize: 9, color: '#AEAEB2', marginTop: 6 }}>{report.date} · 매일 오전 8시 자동 생성</div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: '#AEAEB2', lineHeight: 1.6 }}>
          아직 보고가 없습니다.{' '}
          <span style={{ fontSize: 10 }}>매일 오전 8시에 자동 생성됩니다.</span>
        </div>
      )}
    </div>
  );
}

// ─── Agent KPI Dashboards ───────────────────────────────────

const AGENT_DASHBOARDS = {

  // ── Chief ──────────────────────────────────────────────────
  chief: () => {
    const [data, setData] = useState(null);
    useEffect(() => {
      fetch('/api/stats').then(r => r.json()).then(setData).catch(() => {});
    }, []);

    const stats = data || {};
    const agentConns = stats.agentConnections || stats.connections || {};
    const report = stats.agentReports?.chief || stats.chiefReport;
    const totalFollowers = (stats.yuminhye?.total || 0) + (stats.millimilli?.total || 0);
    const connectedCount = Object.values(agentConns).filter(v => v?.connected).length;
    const totalCount = Object.keys(agentConns).length;

    const connLabels = {
      zernio: 'Zernio',
      google: 'Google',
      anthropic: 'Claude API',
      instagram: 'Instagram',
      oliveyoung: '올리브영 시트',
      naverAds: '네이버 광고',
      ga4: 'GA4',
      googleAds: '구글 광고',
      meta: 'Meta 광고',
      tiktok: 'TikTok',
    };

    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="당월 매출 (한국합산)" value={stats.totalRevenue ? fmtKRW(stats.totalRevenue) : '-'} sub="이번 달 누적" icon={DollarSign} />
          <KpiCard label="총 팔로워" value={totalFollowers > 0 ? fmt(totalFollowers) : '-'} sub="유민혜 + 밀리밀리" icon={Users} />
          <KpiCard label="연결된 에이전트" value={totalCount > 0 ? `${connectedCount}/${totalCount}` : '-'} sub="실시간 연결 현황" icon={Target} />
          <KpiCard label="Amazon YTD" value={stats.amazonYTD ? fmtUSD(stats.amazonYTD) : '-'} sub="2026년 누적" icon={Globe} />
        </div>

        {totalCount > 0 && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>에이전트 연결 현황</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {Object.entries(agentConns).map(([key, val], i) => {
                const connected = val?.connected;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 6, background: connected ? 'rgba(52,199,89,0.06)' : '#F5F5F7' }}>
                    {connected ? <CheckCircle2 size={11} color="#34C759" /> : <Circle size={11} color="#D1D1D6" />}
                    <span style={{ fontSize: 11, color: '#1D1D1F', flex: 1 }}>{connLabels[key] || key}</span>
                    <span style={{ fontSize: 10, color: connected ? '#34C759' : '#AEAEB2', fontWeight: 500 }}>
                      {connected ? '연결됨' : '미연결'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 8 }}>오늘의 종합 보고</div>
          {report?.report ? (
            <>
              <div style={{ fontSize: 12, color: '#1D1D1F', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{report.report}</div>
              <div style={{ fontSize: 9, color: '#AEAEB2', marginTop: 6 }}>{report.date} · 매일 오전 8시 자동 생성</div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#AEAEB2' }}>매일 오전 8시 자동 생성됩니다. (첫 보고 대기 중)</div>
          )}
        </div>
      </>
    );
  },

  // ── Channel ────────────────────────────────────────────────
  channel: () => {
    const [tab, setTab] = useState('yuminhye');
    const [historyTab, setHistoryTab] = useState('comment');
    const [personaData, setPersonaData] = useState(null);
    const [settings, setSettings] = useState({ yuminhye: { autoComment: false, autoDm: false }, millimilli: { autoComment: false, autoDm: false } });
    const [history, setHistory] = useState({ yuminhye: { comments: [], dms: [], commentCount: 0, dmCount: 0 }, millimilli: { comments: [], dms: [], commentCount: 0, dmCount: 0 } });
    const [igStats, setIgStats] = useState({ yuminhye: { followers: null, avgComments: null }, millimilli: { followers: null, avgComments: null } });
    const [rules, setRules] = useState([]);
    const [newRule, setNewRule] = useState('');
    const [ruleAccount, setRuleAccount] = useState('전체');
    const [addingRule, setAddingRule] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [togglingRule, setTogglingRule] = useState(null);
    const [learning, setLearning] = useState(false);
    const [learnResult, setLearnResult] = useState(null);
    const [togglingSettings, setTogglingSettings] = useState({});

    // accent per account
    const ACCENT = { yuminhye: '#FF6B6B', millimilli: '#5E6AD2' };
    const accent = ACCENT[tab];

    useEffect(() => {
      // Load persona + rules
      fetch('/api/channel/persona').then(r => r.json()).then(d => {
        setPersonaData(d);
        setRules(d?.rules || []);
      }).catch(() => {});
      // Load settings
      fetch('/api/channel/settings').then(r => r.json()).then(d => {
        if (d && !d.error) setSettings(d);
      }).catch(() => {});
      // Load history for both accounts
      ['yuminhye', 'millimilli'].forEach(acct => {
        fetch(`/api/channel/history?account=${acct}`).then(r => r.json()).then(d => {
          if (d && !d.error) {
            setHistory(prev => ({ ...prev, [acct]: d }));
          }
        }).catch(() => {});
        // Load IG stats (posts for avg comments + followers)
        fetch(`/api/channel/posts?account=${acct}`).then(r => r.json()).then(d => {
          if (d && !d.error) {
            const posts = d.posts || [];
            const followers = d.followers || null;
            const sevenDayPosts = posts.slice(0, 7);
            const avgComments = sevenDayPosts.length > 0
              ? Math.round(sevenDayPosts.reduce((s, p) => s + (p.comments_count || 0), 0) / sevenDayPosts.length)
              : null;
            setIgStats(prev => ({ ...prev, [acct]: { followers, avgComments } }));
          }
        }).catch(() => {});
      });
    }, []);

    const persona = personaData?.personas?.[tab] || personaData?.[tab] || null;
    const acctSettings = settings[tab] || { autoComment: false, autoDm: false };
    const acctHistory = history[tab] || { comments: [], dms: [], commentCount: 0, dmCount: 0 };
    const acctStats = igStats[tab] || { followers: null, avgComments: null };

    // Toggle autoComment / autoDm
    const handleToggleSetting = async (field) => {
      const key = `${tab}_${field}`;
      setTogglingSettings(prev => ({ ...prev, [key]: true }));
      const newVal = !acctSettings[field];
      setSettings(prev => ({ ...prev, [tab]: { ...prev[tab], [field]: newVal } }));
      try {
        await fetch('/api/channel/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account: tab, [field]: newVal }),
        });
      } catch { /* revert on fail */ }
      setTogglingSettings(prev => ({ ...prev, [key]: false }));
    };

    // Toggle rule enabled/disabled
    const handleToggleRule = async (id) => {
      setTogglingRule(id);
      const rule = rules.find(r => r.id === id);
      if (!rule) { setTogglingRule(null); return; }
      const newEnabled = !rule.enabled;
      setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: newEnabled } : r));
      try {
        const res = await fetch('/api/channel/persona', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'toggle_rule', data: { id } }),
        });
        const d = await res.json();
        if (d.rules) setRules(d.rules);
      } catch { /* keep optimistic state */ }
      setTogglingRule(null);
    };

    const handleAddRule = async () => {
      const text = newRule.trim();
      if (!text) return;
      setAddingRule(true);
      try {
        const res = await fetch('/api/channel/persona', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'rule', account: ruleAccount, data: { text } }),
        });
        const d = await res.json();
        if (d.rules) setRules(d.rules);
        else setRules(prev => [...prev, { id: Date.now(), text, account: ruleAccount, enabled: true, addedAt: new Date().toISOString() }]);
        setNewRule('');
      } catch { /* silent */ }
      setAddingRule(false);
    };

    const handleDeleteRule = async (id) => {
      setDeletingId(id);
      try {
        const res = await fetch('/api/channel/persona', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'delete_rule', data: { id } }),
        });
        const d = await res.json();
        if (d.rules) setRules(d.rules);
        else setRules(prev => prev.filter(r => r.id !== id));
      } catch { setRules(prev => prev.filter(r => r.id !== id)); }
      setDeletingId(null);
    };

    const handleLearn = async () => {
      setLearning(true);
      setLearnResult(null);
      try {
        const res = await fetch('/api/channel/learn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account: tab }),
        });
        const d = await res.json();
        setLearnResult(d);
        // Refresh persona
        fetch('/api/channel/persona').then(r => r.json()).then(pd => {
          setPersonaData(pd);
          setRules(pd?.rules || []);
        }).catch(() => {});
      } catch (e) { setLearnResult({ error: e.message }); }
      setLearning(false);
    };

    // Toggle switch component
    const Toggle = ({ value, onToggle, loading, accentColor }) => (
      <div
        onClick={!loading ? onToggle : undefined}
        style={{
          width: 36, height: 20, borderRadius: 10, cursor: loading ? 'default' : 'pointer',
          background: value ? (accentColor || '#34C759') : '#D1D1D6',
          position: 'relative', transition: 'background 0.2s', opacity: loading ? 0.6 : 1, flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: value ? 18 : 2, width: 16, height: 16,
          borderRadius: '50%', background: '#FFF', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.2s',
        }} />
      </div>
    );

    const tabAccountLabel = { yuminhye: '유민혜', millimilli: '밀리밀리' };

    return (
      <>
        <DailyReportCard agentId="creator" />
        {/* Account tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {[['yuminhye', '유민혜', '#FF6B6B'], ['millimilli', '밀리밀리', '#5E6AD2']].map(([id, label, color]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                fontSize: 13, padding: '6px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: tab === id ? 600 : 400,
                background: tab === id ? color : '#F5F5F7',
                color: tab === id ? '#FFF' : '#6E6E73',
                boxShadow: tab === id ? `0 2px 8px ${color}44` : 'none',
                transition: 'all 0.15s',
              }}
            >{label}</button>
          ))}
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
          <KpiCard label="팔로워" value={acctStats.followers !== null ? fmt(acctStats.followers) : '-'} sub="Instagram" icon={Users} accent={accent} />
          <KpiCard label="7일 평균 댓글" value={acctStats.avgComments !== null ? `${acctStats.avgComments}개` : '-'} sub="최근 게시물" icon={MessageCircle} />
          <KpiCard label="자동댓글 누적" value={`${acctHistory.commentCount || 0}건`} sub="전체 기간" icon={Send} />
          <KpiCard label="자동DM 누적" value={`${acctHistory.dmCount || 0}건`} sub="전체 기간" icon={Zap} />
        </div>

        {/* Auto toggles */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>자동응대 설정</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { field: 'autoComment', label: '자동 댓글', desc: '게시물 댓글에 AI가 자동 응답' },
              { field: 'autoDm', label: '자동 DM', desc: 'DM 수신 시 AI가 자동 응답' },
            ].map(({ field, label, desc }) => (
              <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Toggle
                  value={acctSettings[field]}
                  onToggle={() => handleToggleSetting(field)}
                  loading={togglingSettings[`${tab}_${field}`]}
                  accentColor={accent}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#1D1D1F' }}>{label}</div>
                  <div style={{ fontSize: 10, color: '#AEAEB2' }}>{desc}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: acctSettings[field] ? accent : '#AEAEB2' }}>
                  {acctSettings[field] ? 'ON' : 'OFF'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Persona card */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F' }}>{tabAccountLabel[tab]} 페르소나</div>
            <button
              onClick={handleLearn}
              disabled={learning}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6,
                border: 'none', cursor: learning ? 'default' : 'pointer', fontFamily: 'inherit',
                background: learning ? '#F5F5F7' : `${accent}15`,
                color: learning ? '#AEAEB2' : accent,
                fontSize: 11, fontWeight: 600,
              }}
            >
              <RefreshCw size={11} style={{ animation: learning ? 'spin 1s linear infinite' : 'none' }} />
              {learning ? '학습 중...' : '재학습'}
            </button>
          </div>

          {learnResult && !learnResult.error && (
            <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 7, background: `${accent}0D`, border: `1px solid ${accent}33` }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: accent, marginBottom: 4 }}>AI 학습 완료 — 최근 게시물 분석 결과</div>
              {learnResult.mainTopics && <div style={{ fontSize: 10, color: '#1D1D1F' }}>주요 주제: {Array.isArray(learnResult.mainTopics) ? learnResult.mainTopics.join(', ') : learnResult.mainTopics}</div>}
              {learnResult.toneInsights && <div style={{ fontSize: 10, color: '#1D1D1F', marginTop: 2 }}>톤: {learnResult.toneInsights}</div>}
            </div>
          )}
          {learnResult?.error && (
            <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 7, background: '#FFF0F0', border: '1px solid #FFD0D0', fontSize: 10, color: '#FF6B6B' }}>
              학습 실패: {learnResult.error}
            </div>
          )}

          {persona ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['캐릭터', persona.character],
                ['톤 & 매너', persona.tone],
                ['주요 주제', Array.isArray(persona.topics) ? persona.topics.join(', ') : persona.topics],
                ['댓글 스타일', persona.commentStyle],
                ['DM 스타일', persona.dmStyle],
                ['고참여 유형', persona.highEngagementType],
                ['추천사항', Array.isArray(persona.recommendations) ? persona.recommendations.join(' / ') : persona.recommendations],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, color: '#AEAEB2', fontWeight: 500, marginBottom: 2 }}>{k}</div>
                  <div style={{ fontSize: 11, color: '#1D1D1F', lineHeight: 1.6 }}>{v}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#AEAEB2' }}>
              {personaData === null ? '로딩 중...' : '페르소나 없음. 재학습 버튼으로 AI 분석을 시작하세요.'}
            </div>
          )}
        </div>

        {/* Context rules */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>컨텍스트 규칙</div>

          {rules.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {rules.map((rule) => (
                <div key={rule.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px',
                  borderRadius: 7, background: rule.enabled !== false ? '#F5F5F7' : '#FAFAFA',
                  border: `1px solid ${rule.enabled !== false ? '#E5E5EA' : '#F0F0F0'}`,
                  opacity: rule.enabled !== false ? 1 : 0.6,
                }}>
                  {/* enable/disable toggle */}
                  <div style={{ paddingTop: 1, flexShrink: 0 }}>
                    <Toggle
                      value={rule.enabled !== false}
                      onToggle={() => handleToggleRule(rule.id)}
                      loading={togglingRule === rule.id}
                      accentColor={accent}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#1D1D1F', lineHeight: 1.5 }}>{rule.text}</div>
                    <div style={{ display: 'flex', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, color: accent, fontWeight: 600, background: `${accent}15`, padding: '1px 5px', borderRadius: 3 }}>
                        {rule.account || '전체'}
                      </span>
                      <span style={{ fontSize: 9, color: '#AEAEB2' }}>
                        {rule.enabled !== false ? '반영 중' : '미반영'}
                      </span>
                      {(rule.addedAt || rule.createdAt) && (
                        <span style={{ fontSize: 9, color: '#AEAEB2' }}>{timeAgo(rule.addedAt || rule.createdAt)}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    disabled={deletingId === rule.id}
                    style={{ padding: '2px 4px', borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', opacity: deletingId === rule.id ? 0.3 : 1, flexShrink: 0 }}
                  >
                    <Trash2 size={12} color="#AEAEB2" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#AEAEB2', marginBottom: 10 }}>규칙 없음. 아래에서 추가하세요.</div>
          )}

          {/* Add rule */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {['전체', '유민혜', '밀리밀리'].map(acct => (
                <button
                  key={acct}
                  onClick={() => setRuleAccount(acct)}
                  style={{ fontSize: 10, padding: '3px 9px', borderRadius: 5, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: ruleAccount === acct ? accent : '#F5F5F7', color: ruleAccount === acct ? '#FFF' : '#6E6E73', fontWeight: ruleAccount === acct ? 600 : 400 }}
                >{acct}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={newRule}
                onChange={e => setNewRule(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAddRule()}
                placeholder="새 컨텍스트 규칙 입력..."
                style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #E5E5EA', background: '#F5F5F7', fontSize: 11, fontFamily: 'inherit', color: '#1D1D1F', outline: 'none' }}
              />
              <button
                onClick={handleAddRule}
                disabled={addingRule || !newRule.trim()}
                style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: newRule.trim() && !addingRule ? accent : '#E5E5EA', color: newRule.trim() && !addingRule ? '#FFF' : '#AEAEB2', cursor: newRule.trim() && !addingRule ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'inherit', flexShrink: 0 }}
              >
                <Plus size={13} />
                {addingRule ? '추가 중...' : '추가'}
              </button>
            </div>
          </div>
        </div>

        {/* Auto-response history */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>응대 히스토리</div>

          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {[['comment', '댓글'], ['dm', 'DM']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setHistoryTab(id)}
                style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: historyTab === id ? accent : '#F5F5F7', color: historyTab === id ? '#FFF' : '#6E6E73', fontWeight: historyTab === id ? 600 : 400 }}
              >{label}</button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#AEAEB2', alignSelf: 'center' }}>
              총 {historyTab === 'comment' ? (acctHistory.commentCount || 0) : (acctHistory.dmCount || 0)}건
            </span>
          </div>

          {/* History list */}
          {(() => {
            const logs = historyTab === 'comment' ? (acctHistory.comments || []) : (acctHistory.dms || []);
            if (logs.length === 0) {
              return <div style={{ fontSize: 11, color: '#AEAEB2', textAlign: 'center', padding: '16px 0' }}>기록 없음</div>;
            }
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {logs.slice(0, 10).map((log, i) => (
                  <div key={i} style={{ padding: '8px 10px', borderRadius: 7, background: '#F5F5F7', border: '1px solid #F0F0F0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#1D1D1F' }}>{log.author || log.from || '익명'}</span>
                      <span style={{ fontSize: 9, color: '#AEAEB2' }}>{timeAgo(log.timestamp || log.createdAt)}</span>
                    </div>
                    {log.text && <div style={{ fontSize: 10, color: '#6E6E73', marginBottom: 3, lineHeight: 1.4 }}>↳ {log.text}</div>}
                    {log.reply && <div style={{ fontSize: 10, color: '#1D1D1F', lineHeight: 1.4 }}>AI: {log.reply}</div>}
                    <div style={{ marginTop: 3 }}>
                      <span style={{ fontSize: 9, color: log.success !== false ? '#34C759' : '#FF6B6B', fontWeight: 500 }}>
                        {log.success !== false ? '✓ 발송 완료' : '✗ 실패'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </>
    );
  },

  // ── CS ────────────────────────────────────────────────────
  cs: () => {
    const [d, setD] = useState(null);
    useEffect(() => {
      fetch('/api/agents/cs').then(r => r.json()).then(setD).catch(() => {});
    }, []);

    const ts = d?.typeStats || {};
    const typeTotal = (ts.exchange || 0) + (ts.delivery || 0) + (ts.product || 0) + (ts.other || 0) || 1;
    const kakaoConnected = d?.channels?.kakao?.status === 'connected';
    const hasData = d !== null;

    if (hasData && !d?.today && !d?.monthly) {
      return (
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 24, textAlign: 'center' }}>
          <XCircle size={28} color="#D1D1D6" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F', marginBottom: 6 }}>카카오채널 미연결</div>
          <div style={{ fontSize: 11, color: '#AEAEB2', lineHeight: 1.6 }}>
            카카오 비즈니스 채널 API를 연결하면<br />CS 현황을 자동으로 수집합니다.
          </div>
        </div>
      );
    }

    return (
      <>
        <DailyReportCard agentId="cs" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="오늘 문의" value={`${d?.today?.total || 0}건`} sub="오늘 누적" icon={Headphones} />
          <KpiCard label="당월 문의" value={`${d?.monthly?.total || 0}건`} sub="당월 누적" icon={Headphones} />
          <KpiCard label="완료" value={`${d?.today?.done || 0}건`} sub="오늘 처리" icon={CheckCircle2} accent="#34C759" />
          <KpiCard label="미완료" value={`${d?.today?.pending || 0}건`} sub="처리 대기" icon={Clock} accent={d?.today?.pending > 0 ? '#FF3B30' : undefined} />
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>CS 유형 분류 (오늘)</div>
          {[
            { label: '교환/반품', key: 'exchange', color: '#FF3B30' },
            { label: '배송문의', key: 'delivery', color: '#F59E0B' },
            { label: '제품문의', key: 'product', color: '#5E6AD2' },
            { label: '기타', key: 'other', color: '#AEAEB2' },
          ].map((t, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: '#1D1D1F' }}>{t.label}</span>
                <span style={{ fontSize: 11, color: '#6E6E73' }}>{ts[t.key] || 0}건</span>
              </div>
              <div style={{ height: 3, background: '#F5F5F7', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${((ts[t.key] || 0) / typeTotal) * 100}%`, background: t.color, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>카카오 채널 CS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <ConnBadge connected={kakaoConnected} label="카카오 비즈니스 채널" />
          </div>
          {!kakaoConnected && (
            <div style={{ fontSize: 10, color: '#AEAEB2', marginTop: 8, lineHeight: 1.5 }}>
              KAKAO_CHANNEL_ID, KAKAO_ADMIN_KEY 환경변수 설정 후 연결됩니다.
            </div>
          )}
        </div>
      </>
    );
  },

  // ── Marketer ───────────────────────────────────────────────
  marketer: () => {
    const [d, setD] = useState(null);
    useEffect(() => {
      fetch('/api/agents/marketer').then(r => r.json()).then(setD).catch(() => {});
    }, []);

    const m = d?.meta || {};
    const allDisconnected = d && !m.totalSpend && !d.totalSpend;
    const roasColor = (v) => { const n = Number(v); return n >= 3 ? '#22C55E' : n >= 2 ? '#F59E0B' : '#EF4444'; };

    if (allDisconnected && Object.keys(d || {}).every(k => !d[k]?.spend && d[k]?.status !== 'connected')) {
      return (
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 24, textAlign: 'center' }}>
          <XCircle size={28} color="#D1D1D6" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F', marginBottom: 6 }}>광고 API 연결 필요</div>
          <div style={{ fontSize: 11, color: '#AEAEB2', lineHeight: 1.8, textAlign: 'left' }}>
            연결에 필요한 환경변수:<br />
            <code style={{ fontSize: 10, color: '#5E6AD2' }}>META_AD_ACCOUNTS</code> — Meta 광고 계정 JSON<br />
            <code style={{ fontSize: 10, color: '#5E6AD2' }}>META_ACCESS_TOKEN</code> — Meta 액세스 토큰<br />
            <code style={{ fontSize: 10, color: '#5E6AD2' }}>NAVER_API_KEY</code> — 네이버 광고 키<br />
            <code style={{ fontSize: 10, color: '#5E6AD2' }}>GOOGLE_ADS_CUSTOMER_ID</code> — 구글 광고
          </div>
        </div>
      );
    }

    return (
      <>
        <DailyReportCard agentId="marketer" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="Meta 광고비" value={m.totalSpend ? fmtKRW(m.totalSpend) : m.status === 'disconnected' ? '미연결' : '-'} sub="주간 누적" icon={DollarSign} />
          <KpiCard label="총 광고비" value={d?.totalSpend ? fmtKRW(d.totalSpend) : '-'} sub="당월 누적" icon={DollarSign} />
        </div>

        {m.accounts?.length > 0 && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>Meta 계정별 ROAS</div>
            {m.accounts.map((acc, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < m.accounts.length - 1 ? '1px solid #F5F5F7' : 'none' }}>
                <span style={{ fontSize: 11, color: '#1D1D1F', flex: 1 }}>{acc.name}</span>
                <span style={{ fontSize: 10, color: '#6E6E73' }}>{acc.spend ? fmtKRW(acc.spend) : '-'}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: acc.roas && acc.roas !== '-' ? roasColor(acc.roas) : '#AEAEB2', width: 44, textAlign: 'right' }}>
                  {acc.roas && acc.roas !== '-' ? `${acc.roas}x` : '-'}
                </span>
              </div>
            ))}
            <div style={{ fontSize: 9, color: '#D1D1D6', marginTop: 6 }}>목표 ROAS 3.0x · 초록 3.0+ 노랑 2.0~3.0 빨강 2.0 미만</div>
          </div>
        )}

        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>광고 채널 연결 현황</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { key: 'meta', label: 'Meta Ads (5계정)' },
              { key: 'naver', label: '네이버 광고' },
              { key: 'google', label: '구글 광고' },
              { key: 'tiktok', label: '틱톡 광고' },
              { key: 'ga', label: 'GA4' },
            ].map(({ key, label }) => (
              <ConnBadge key={key} connected={d?.[key]?.status === 'connected'} label={label} />
            ))}
          </div>
          {d && [d.meta, d.naver, d.google, d.tiktok, d.ga].every(ch => !ch || ch.status !== 'connected') && (
            <div style={{ fontSize: 10, color: '#AEAEB2', marginTop: 8, lineHeight: 1.5 }}>
              광고 API 미연결 상태입니다. 환경변수를 확인해주세요.
            </div>
          )}
        </div>

        {d?.suggestions && (
          <div style={{ background: '#FFFFFF', border: '1px solid #F59E0B33', borderRadius: 10, padding: 14, marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B', marginBottom: 8 }}>광고 최적화 제안</div>
            {d.suggestions.lowRoas?.length > 0 && (
              <div style={{ fontSize: 11, color: '#FF3B30', marginBottom: 6 }}>ROAS 2.0 미만 캠페인: {d.suggestions.lowRoas.length}개</div>
            )}
            {d.suggestions.suggestion && (
              <div style={{ fontSize: 11, color: '#1D1D1F', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{d.suggestions.suggestion}</div>
            )}
            <div style={{ fontSize: 9, color: '#D1D1D6', marginTop: 6 }}>{d.suggestions.updatedAt?.slice(0, 10)}</div>
          </div>
        )}
      </>
    );
  },

  // ── Commerce ───────────────────────────────────────────────
  commerce: () => {
    const [stats, setStats] = useState(null);
    const [commerceData, setCommerceData] = useState(null);

    useEffect(() => {
      fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {});
      fetch('/api/agents/commerce').then(r => r.json()).then(setCommerceData).catch(() => {});
    }, []);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const promos = commerceData?.promotions?.upcoming || commerceData?.promotions?.thisMonth || [];

    const importColor = { high: '#EF4444', medium: '#F59E0B', low: '#AEAEB2' };
    const promoByDate = {};
    for (const p of promos) {
      const pd = p.date?.slice(8, 10);
      if (pd && p.date?.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)) promoByDate[Number(pd)] = p;
    }

    const channels = [
      { key: 'oliveyoung', label: '올리브영' },
      { key: 'smartstore', label: '스마트스토어' },
      { key: 'cafe24', label: '카페24' },
    ];

    const krTotal = (stats?.oliveyoung?.monthly || 0) + (stats?.smartstore?.monthly || 0) + (stats?.cafe24?.monthly || 0);

    return (
      <>
        <DailyReportCard agentId="commerce" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="당월 합계 (한국)" value={krTotal > 0 ? fmtKRW(krTotal) : '-'} sub="올리브영+스마트+카페24" icon={ShoppingCart} />
          <KpiCard label="올리브영" value={stats?.oliveyoung?.monthly ? fmtKRW(stats.oliveyoung.monthly) : '-'} sub="이번 달" icon={ShoppingCart} />
          <KpiCard label="스마트스토어" value={stats?.smartstore?.monthly ? fmtKRW(stats.smartstore.monthly) : '-'} sub="이번 달" icon={ShoppingCart} />
          <KpiCard label="카페24" value={stats?.cafe24?.monthly ? fmtKRW(stats.cafe24.monthly) : '-'} sub="이번 달" icon={ShoppingCart} />
        </div>

        {/* Channel connection status */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>판매 채널 연결 현황</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { key: 'oliveyoung', label: '올리브영' },
              { key: 'smartstore', label: '스마트스토어' },
              { key: 'cafe24', label: '카페24' },
              { key: 'amazon', label: '아마존' },
              { key: 'shopee', label: '쇼피' },
              { key: 'qoo10', label: '큐텐' },
              { key: 'tiktokShop', label: '틱톡샵' },
            ].map(({ key, label }) => {
              const s = commerceData?.[key] || {};
              const monthly = stats?.[key]?.monthly;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 6, background: s.status === 'connected' ? 'rgba(52,199,89,0.06)' : '#F5F5F7' }}>
                  {s.status === 'connected' ? <CheckCircle2 size={11} color="#34C759" /> : <Circle size={11} color="#D1D1D6" />}
                  <span style={{ fontSize: 11, color: '#1D1D1F', flex: 1 }}>{label}</span>
                  {monthly ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#1D1D1F' }}>{fmtKRW(monthly)}</span>
                  ) : (
                    <span style={{ fontSize: 10, color: s.status === 'connected' ? '#34C759' : '#AEAEB2', fontWeight: 500 }}>
                      {s.status === 'connected' ? '연결됨' : '미연결'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Promo calendar */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>
            {year}년 {month + 1}월 프로모션 캘린더
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
            {['일', '월', '화', '수', '목', '금', '토'].map(dd => (
              <div key={dd} style={{ fontSize: 9, color: '#AEAEB2', padding: '2px 0' }}>{dd}</div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const promo = promoByDate[day];
              const isToday = day === now.getDate();
              return (
                <div key={day} title={promo?.name || ''} style={{ padding: '3px 0', borderRadius: 4, fontSize: 10, cursor: promo ? 'pointer' : 'default', background: isToday ? '#5E6AD222' : promo ? `${importColor[promo.importance] || '#AEAEB2'}18` : 'transparent', color: isToday ? '#5E6AD2' : '#444', fontWeight: isToday || promo ? 600 : 400, border: promo ? `1px solid ${importColor[promo.importance] || '#AEAEB2'}44` : '1px solid transparent' }}>
                  {day}
                  {promo && <div style={{ width: 4, height: 4, borderRadius: 2, background: importColor[promo.importance] || '#AEAEB2', margin: '1px auto 0' }} />}
                </div>
              );
            })}
          </div>
          {promos.length === 0 && (
            <div style={{ fontSize: 10, color: '#AEAEB2', marginTop: 8, textAlign: 'center' }}>
              프로모션 데이터 없음 — 매주 월요일 자동 업데이트
            </div>
          )}
        </div>

        {promos.length > 0 && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>다가오는 프로모션</div>
            {promos.slice(0, 5).map((p, i) => {
              const pDate = new Date(p.date);
              const dDay = Math.ceil((pDate - now) / 86400000);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < Math.min(promos.length, 5) - 1 ? '1px solid #F5F5F7' : 'none' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: importColor[p.importance] || '#AEAEB2', width: 32 }}>
                    {dDay >= 0 ? `D-${dDay}` : 'END'}
                  </span>
                  <span style={{ fontSize: 11, color: '#1D1D1F', flex: 1 }}>{p.name}</span>
                  <span style={{ fontSize: 9, color: '#AEAEB2' }}>{p.channel}</span>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  },

  // ── Admin ─────────────────────────────────────────────────
  admin: () => {
    const [d, setD] = useState(null);
    useEffect(() => {
      fetch('/api/agents/management').then(r => r.json()).then(setD).catch(() => {});
    }, []);

    const voucher = d?.exportVoucher;
    const govItems = d?.govAnnouncements?.items || [];
    const now = new Date();

    const defaultSteps = [
      { name: '신청', status: 'done' },
      { name: '선정', status: 'done' },
      { name: '계획제출', status: 'done' },
      { name: '진행중', status: 'active' },
      { name: '정산', status: 'pending' },
    ];

    return (
      <>
        <DailyReportCard agentId="management" />
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 12 }}>수출바우처 현황</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', marginBottom: 14, rowGap: 6 }}>
            {(voucher?.steps || defaultSteps).map((s, i, arr) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: s.status === 'done' ? '#22C55E22' : s.status === 'active' ? '#5E6AD222' : '#F5F5F7', color: s.status === 'done' ? '#22C55E' : s.status === 'active' ? '#5E6AD2' : '#AEAEB2', border: `1px solid ${s.status === 'done' ? '#22C55E44' : s.status === 'active' ? '#5E6AD244' : '#E5E5EA'}` }}>
                  {s.status === 'done' ? '✓ ' : s.status === 'active' ? '● ' : '○ '}{s.name}
                </div>
                {i < arr.length - 1 && <span style={{ color: '#D1D1D6', margin: '0 4px', fontSize: 10 }}>→</span>}
              </div>
            ))}
          </div>
          {(voucher?.programs || [{ name: '해외마케팅', status: 'active' }, { name: 'IP/인증 획득', status: 'active' }]).map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: '#34C759' }} />
              <span style={{ fontSize: 11, color: '#1D1D1F' }}>{p.name}</span>
              <span style={{ fontSize: 10, color: '#34C759', marginLeft: 'auto' }}>진행중</span>
            </div>
          ))}
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 16, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>정부지원사업 공고</div>
          {govItems.length > 0 ? govItems.slice(0, 8).map((item, i) => {
            const deadline = item.deadline ? new Date(item.deadline) : null;
            const daysLeft = deadline ? Math.ceil((deadline - now) / 86400000) : null;
            const urgent = daysLeft !== null && daysLeft <= 7 && daysLeft >= 0;
            return (
              <div key={i} style={{ padding: '6px 0', borderBottom: i < Math.min(govItems.length, 8) - 1 ? '1px solid #F5F5F7' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {urgent && <span style={{ fontSize: 8, background: '#EF4444', color: '#FFF', padding: '1px 4px', borderRadius: 3, fontWeight: 600, flexShrink: 0 }}>D-{daysLeft}</span>}
                  <span style={{ fontSize: 11, color: '#1D1D1F', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                </div>
                <div style={{ fontSize: 9, color: '#AEAEB2', marginTop: 2 }}>
                  {item.source}{item.deadline ? ` · 마감 ${item.deadline}` : ''}
                </div>
              </div>
            );
          }) : (
            <div style={{ fontSize: 11, color: '#AEAEB2', padding: '12px 0', textAlign: 'center' }}>
              {d?.govAnnouncements?.status === 'no_data' ? '매주 월요일 자동 업데이트' : d === null ? '로딩 중...' : '공고 데이터 없음'}
            </div>
          )}
          <div style={{ fontSize: 9, color: '#D1D1D6', marginTop: 8 }}>
            K-스타트업 · 코트라 · 중기부 공고 자동 수집{d?.govAnnouncements?.updatedAt ? ` · ${d.govAnnouncements.updatedAt.slice(0, 10)}` : ''}
          </div>
        </div>
      </>
    );
  },

  // ── Brand ─────────────────────────────────────────────────
  brand: () => {
    const [d, setD] = useState(null);
    const [stats, setStats] = useState(null);
    useEffect(() => {
      fetch('/api/agents/brand').then(r => r.json()).then(setD).catch(() => {});
      fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {});
    }, []);

    const rankings = d?.rankings;
    const reviews = d?.reviews;
    const proposal = d?.suggestions;

    return (
      <>
        <DailyReportCard agentId="brand" />
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>카테고리 랭킹</div>
          {rankings?.status === 'connected' && rankings.items?.length > 0 ? (
            rankings.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < rankings.items.length - 1 ? '1px solid #F5F5F7' : 'none' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: item.ours ? '#5E6AD2' : '#AEAEB2', width: 22 }}>{item.rank}</span>
                <span style={{ fontSize: 11, color: '#1D1D1F', flex: 1 }}>{item.name}</span>
                <span style={{ fontSize: 9, color: '#AEAEB2' }}>{item.category}</span>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 11, color: '#AEAEB2', padding: '8px 0' }}>
              랭킹 데이터 수집 대기 중 — 주간 자동 업데이트
            </div>
          )}
          <div style={{ fontSize: 9, color: '#D1D1D6', marginTop: 8 }}>마지막: {rankings?.updatedAt || '대기 중'}</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 4 }}>올리브영 당월 매출</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1D1D1F', letterSpacing: '-0.02em' }}>
            {stats?.oliveyoung?.monthly ? fmtKRW(stats.oliveyoung.monthly) : '-'}
          </div>
          <div style={{ fontSize: 10, color: '#AEAEB2', marginTop: 4 }}>이번 달 누적</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>상품별 리뷰</div>
          {reviews?.status === 'connected' && reviews.products?.length > 0 ? (
            reviews.products.map((p, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: i < reviews.products.length - 1 ? '1px solid #F5F5F7' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#1D1D1F' }}>{p.name}</span>
                  {p.attention > 0 && <span style={{ fontSize: 8, background: '#EF4444', color: '#FFF', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>관리 {p.attention}건</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, color: '#F59E0B' }}>{'★'.repeat(Math.floor(p.rating || 0))}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#1D1D1F' }}>{p.rating}</span>
                  <span style={{ fontSize: 10, color: '#AEAEB2' }}>({p.count}건)</span>
                </div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 11, color: '#AEAEB2', padding: '8px 0' }}>
              리뷰 모니터링 데이터 대기 중
            </div>
          )}
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 8 }}>주간 상품 제안</div>
          {proposal?.status === 'connected' ? (
            <div style={{ fontSize: 11, color: '#1D1D1F', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {proposal.content || proposal.text || '제안 내용 로딩 중...'}
              <div style={{ fontSize: 9, color: '#D1D1D6', marginTop: 6 }}>{proposal.updatedAt?.slice(0, 10)}</div>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#AEAEB2' }}>매주 월요일 리뷰 분석 후 AI 제안 자동 생성</div>
          )}
        </div>
      </>
    );
  },

  // ── Global ─────────────────────────────────────────────────
  global: () => {
    const [d, setD] = useState(null);
    const [stats, setStats] = useState(null);
    useEffect(() => {
      fetch('/api/agents/export').then(r => r.json()).then(setD).catch(() => {});
      fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {});
    }, []);

    const rates = d?.exchangeRates || {};
    const pipeline = d?.buyerPipeline || {};
    const countries = d?.byCountry || [];
    const maxAmount = countries.length > 0 ? Math.max(...countries.map(c => c.amount || 0)) || 1 : 1;

    return (
      <>
        <DailyReportCard agentId="export" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="Amazon YTD" value={stats?.amazonYTD ? fmtUSD(stats.amazonYTD) : d?.exports?.totalAmount ? fmtKRW(d.exports.totalAmount) : '-'} sub="2026년 누적" icon={Globe} />
          <KpiCard label="당월 아마존" value={stats?.amazon?.monthly ? fmtUSD(stats.amazon.monthly) : '-'} sub="이번 달" icon={Globe} />
          <KpiCard label="USD/KRW" value={rates.USD ? `${rates.USD.toLocaleString()}원` : '-'} sub="현재 환율" icon={DollarSign} />
          <KpiCard label="JPY/KRW" value={rates.JPY ? `${(rates.JPY * 100).toFixed(1)}원` : '-'} sub="100엔 기준" icon={DollarSign} />
        </div>

        {countries.length > 0 && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>국가별 수출 현황</div>
            {countries.slice(0, 8).map((c, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: '#1D1D1F' }}>{c.name}</span>
                  <span style={{ fontSize: 10, color: '#6E6E73' }}>{fmt(c.amount)}원 ({c.products || 0}건)</span>
                </div>
                <div style={{ height: 4, background: '#F5F5F7', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${((c.amount || 0) / maxAmount) * 100}%`, background: '#5E6AD2', borderRadius: 2 }} />
                </div>
              </div>
            ))}
            <div style={{ fontSize: 9, color: '#D1D1D6', marginTop: 4 }}>2026년 누적 · 구글시트 연동</div>
          </div>
        )}

        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>바이어 파이프라인</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'nowrap', overflowX: 'auto' }}>
            {[
              { label: 'DB확보', value: pipeline.db },
              { label: '1차메일', value: pipeline.firstMail },
              { label: '답장', value: pipeline.replied },
              { label: '샘플', value: pipeline.sample },
              { label: '제안서', value: pipeline.proposal },
              { label: '계약', value: pipeline.contract },
            ].map((step, i, arr) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ textAlign: 'center', padding: '6px 8px', borderRadius: 6, background: '#F5F5F7', border: '1px solid #E5E5EA', minWidth: 46 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1D1D1F' }}>{step.value ?? 0}</div>
                  <div style={{ fontSize: 8, color: '#6E6E73' }}>{step.label}</div>
                </div>
                {i < arr.length - 1 && <span style={{ color: '#D1D1D6', margin: '0 3px', fontSize: 10 }}>→</span>}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: '#D1D1D6', marginTop: 6 }}>당월 누적</div>
        </div>

        {d?.dailyReport && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 8 }}>일간 성과 보고</div>
            <div style={{ fontSize: 11, color: '#1D1D1F', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {d.dailyReport.summary || d.dailyReport.text}
            </div>
            <div style={{ fontSize: 9, color: '#D1D1D6', marginTop: 4 }}>{d.dailyReport.updatedAt?.slice(0, 10)}</div>
          </div>
        )}

        <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1D1D1F', marginBottom: 10 }}>해외 채널</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(d?.channels || {}).length > 0 ? (
              Object.entries(d.channels).map(([ch, s], i) => (
                <ConnBadge key={i} connected={s?.status === 'connected'} label={ch} />
              ))
            ) : (
              <div style={{ fontSize: 11, color: '#AEAEB2' }}>채널 연결 데이터 없음</div>
            )}
          </div>
        </div>
      </>
    );
  },

};

// ─── Quick Actions ──────────────────────────────────────────

const quickActions = {
  chief: ['오늘 전체 브리핑해줘', '각 에이전트 업무 지시해줘', '이번 주 우선순위 정리해줘'],
  channel: ['유민혜 이번 주 콘텐츠 기획해줘', '밀리밀리 인스타 캡션 작성해줘', '팔로워 증대 전략 제안해줘'],
  cs: ['오늘 CS 현황 요약해줘', 'CS 유형별 분류 리포트', 'CS 감소 방안 제안해줘'],
  marketer: ['오늘 광고 ROAS 분석해줘', '채널별 광고비 현황', '광고 최적화 제안해줘'],
  commerce: ['채널별 매출 현황 보고해줘', '이번 달 프로모션 제안해줘', '올리브영 운영 전략'],
  admin: ['대금출금 현황 보고해줘', '정부지원사업 공고 알려줘', '임직원 현황 정리해줘'],
  brand: ['이번 주 리뷰 분석해줘', '경쟁사 분석해줘', '상품 개선안 제안해줘'],
  global: ['수출 현황 보고해줘', '아마존 판매 분석해줘', '바이어 컨택 메일 작성해줘'],
};

// ─── Main ChatView ──────────────────────────────────────────

export default function ChatView() {
  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const endRef = useRef(null);
  const { activeAgent, conversations, isLoading, sendMessage } = useChatStore();
  const agent = getAgent(activeAgent);
  const messages = conversations[activeAgent] || [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true') {
      localStorage.setItem('google_connected', 'true');
      localStorage.setItem('google_email', params.get('email') || '');
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('tiktok_connected') === 'true') {
      localStorage.setItem('tiktok_connected', 'true');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const send = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendMessage(activeAgent, text);
  };

  const Icon = agent.icon;
  const AgentDashboard = AGENT_DASHBOARDS[activeAgent];

  return (
    <>
      {/* Header */}
      <div style={{ height: 48, minHeight: 48, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #E5E5EA', background: '#FFFFFF', flexShrink: 0 }}>
        <Icon size={16} strokeWidth={1.5} color="#5E6AD2" />
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F' }}>{agent.name}</span>
        <span style={{ fontSize: 13, color: '#AEAEB2' }}>{agent.title}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* LEFT: KPI Dashboard 65% */}
        <div style={{ width: '65%', overflowY: 'auto', padding: 16, background: '#F5F5F7', borderRight: '1px solid #E5E5EA', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Icon size={14} strokeWidth={1.5} color="#5E6AD2" />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {agent.name} Dashboard
            </span>
          </div>
          {AgentDashboard && <AgentDashboard />}
        </div>

        {/* RIGHT: Chat 35% */}
        <div style={{ width: '35%', display: 'flex', flexDirection: 'column', background: '#FFFFFF', minWidth: 0 }}>
          {/* Messages area */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {messages.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: '#F5F5F7', border: '1px solid #E5E5EA', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Icon size={18} strokeWidth={1.5} color="#5E6AD2" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#1D1D1F', marginBottom: 4 }}>{agent.name}</div>
                <div style={{ fontSize: 12, color: '#6E6E73', marginBottom: 20, textAlign: 'center', lineHeight: 1.5 }}>{agent.description}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center' }}>
                  {(quickActions[activeAgent] || []).map((action, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(action)}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E5E5EA', background: '#FFFFFF', color: '#6E6E73', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#5E6AD2'; e.currentTarget.style.color = '#5E6AD2'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E5EA'; e.currentTarget.style.color = '#6E6E73'; }}
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ padding: 14 }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ marginBottom: 18 }}>
                    {msg.role === 'user' ? (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ background: '#5E6AD2', color: '#FFF', borderRadius: '14px 14px 4px 14px', padding: '9px 14px', maxWidth: '85%', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <div style={{ width: 20, height: 20, borderRadius: 5, background: '#F5F5F7', border: '1px solid #E5E5EA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Icon size={10} strokeWidth={2} color="#5E6AD2" />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 500, color: '#AEAEB2' }}>{agent.name}</span>
                        </div>
                        <div style={{ paddingLeft: 26, fontSize: 13, lineHeight: 1.75, color: msg.error ? '#FF3B30' : '#1D1D1F', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {msg.content}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 26 }}>
                    <Loader2 size={14} color="#AEAEB2" style={{ animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: 12, color: '#AEAEB2' }}>생각 중...</span>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div style={{ padding: '10px 14px 16px', flexShrink: 0, background: '#FFFFFF', borderTop: '1px solid #F5F5F7' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F5F5F7', border: `1px solid ${inputFocused ? '#5E6AD2' : '#E5E5EA'}`, borderRadius: 10, padding: '9px 12px', transition: 'border-color 0.15s' }}>
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder={`${agent.name}에게 메시지...`}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#1D1D1F', fontSize: 13, fontFamily: 'inherit', minWidth: 0 }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || isLoading}
                style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: input.trim() && !isLoading ? '#5E6AD2' : '#E5E5EA', color: input.trim() && !isLoading ? '#FFF' : '#AEAEB2', cursor: input.trim() && !isLoading ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', flexShrink: 0 }}
              >
                <ArrowUp size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

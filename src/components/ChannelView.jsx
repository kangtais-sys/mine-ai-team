import { useState, useEffect, useRef } from 'react';
import {
  RefreshCw, Plus, Trash2, ToggleLeft, ToggleRight, BookOpen,
  MessageCircle, Send, Users, TrendingUp, Clock, CheckCircle2, XCircle,
  ChevronRight, AlertCircle, Zap, Loader2,
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────
const ACCOUNTS = {
  yuminhye: {
    label: '유민혜',
    subLabel: '@lala_lounge_ · @yuminhye',
    emoji: '👤',
    color: '#FF6B6B',
    lightBg: '#FFF5F5',
    ig: 'lala_lounge_',
  },
  millimilli: {
    label: '밀리밀리',
    subLabel: '@millimilli_official',
    emoji: '🏷️',
    color: '#5E6AD2',
    lightBg: '#F0F0FF',
    ig: 'millimilli_official',
  },
};

const CARD = { background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '18px 20px' };

function fmt(n) {
  if (!n || n === 0) return '0';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  return n.toLocaleString('ko-KR');
}
function timeAgo(ts) {
  if (!ts) return '';
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

// ─── Toggle component ───────────────────────────────────────
function Toggle({ on, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: on ? '#34C759' : '#D1D1D6', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: on ? 22 : 2, width: 20, height: 20,
        borderRadius: '50%', background: '#FFF', boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
        transition: 'left 0.2s',
      }} />
    </button>
  );
}

// ─── KPI Card ───────────────────────────────────────────────
function KpiCard({ label, value, sub, accent, icon: Icon }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 10, padding: '14px 16px', flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <span style={{ fontSize: 10.5, color: '#AEAEB2', fontWeight: 500 }}>{label}</span>
        {Icon && <Icon size={13} strokeWidth={1.5} color="#D1D1D6" />}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || '#1D1D1F', lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#AEAEB2', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Section Title ───────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
      {children}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────
export default function ChannelView() {
  const [tab, setTab] = useState('yuminhye');
  const [persona, setPersona] = useState({ yuminhye: {}, millimilli: {} });
  const [rules, setRules] = useState([]);
  const [settings, setSettings] = useState({
    yuminhye: { autoComment: false, autoDm: false },
    millimilli: { autoComment: false, autoDm: false },
  });
  const [history, setHistory] = useState({
    yuminhye: { comments: [], dms: [], counts: { comment: 0, dm: 0 } },
    millimilli: { comments: [], dms: [], counts: { comment: 0, dm: 0 } },
  });
  const [posts, setPosts] = useState({ yuminhye: [], millimilli: [] });
  const [followers, setFollowers] = useState({ yuminhye: null, millimilli: null });

  const [loading, setLoading] = useState(true);
  const [learning, setLearning] = useState(false);
  const [postsLoading, setPostsLoading] = useState({ yuminhye: false, millimilli: false });
  const [togglingComment, setTogglingComment] = useState(false);
  const [togglingDm, setTogglingDm] = useState(false);

  const [newRule, setNewRule] = useState('');
  const [ruleAccount, setRuleAccount] = useState('current'); // 'current' | 'all'
  const [addingRule, setAddingRule] = useState(false);

  const [historyTab, setHistoryTab] = useState('comment');
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load all data
  const loadAll = async () => {
    setLoading(true);
    try {
      const [personaRes, settingsRes, historyRes] = await Promise.all([
        fetch('/api/channel/persona').then(r => r.json()),
        fetch('/api/channel/settings').then(r => r.json()),
        fetch('/api/channel/history').then(r => r.json()),
      ]);

      setPersona({ yuminhye: personaRes.yuminhye || {}, millimilli: personaRes.millimilli || {} });
      setRules(personaRes.rules || []);
      setSettings(settingsRes);
      setHistory(historyRes);
    } catch (e) {
      console.error('Load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadPosts = async (account, refresh = false) => {
    setPostsLoading(prev => ({ ...prev, [account]: true }));
    try {
      const url = `/api/channel/posts?account=${account}${refresh ? '&refresh=1' : ''}`;
      const data = await fetch(url).then(r => r.json());
      setPosts(prev => ({ ...prev, [account]: data.posts || [] }));
    } catch (e) {
      console.error('Posts load error:', e);
    } finally {
      setPostsLoading(prev => ({ ...prev, [account]: false }));
    }
  };

  const loadFollowers = async () => {
    try {
      const statsRes = await fetch('/api/stats').then(r => r.json());
      const ym = statsRes?.yuminhye?.instagram;
      const mm = statsRes?.millimilli?.instagram;
      setFollowers({ yuminhye: ym?.count || 0, millimilli: mm?.count || 0 });
    } catch {}
  };

  useEffect(() => {
    loadAll();
    loadPosts('yuminhye');
    loadPosts('millimilli');
    loadFollowers();
  }, []);

  // ── Handlers ─────────────────────────────────────────────
  const toggleAutoComment = async (account) => {
    setTogglingComment(true);
    const newVal = !settings[account].autoComment;
    try {
      await fetch('/api/channel/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, autoComment: newVal }),
      });
      setSettings(prev => ({ ...prev, [account]: { ...prev[account], autoComment: newVal } }));
      showToast(`자동 댓글 ${newVal ? 'ON' : 'OFF'}`);
    } catch { showToast('오류 발생', 'error'); }
    setTogglingComment(false);
  };

  const toggleAutoDm = async (account) => {
    setTogglingDm(true);
    const newVal = !settings[account].autoDm;
    try {
      await fetch('/api/channel/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, autoDm: newVal }),
      });
      setSettings(prev => ({ ...prev, [account]: { ...prev[account], autoDm: newVal } }));
      showToast(`자동 DM ${newVal ? 'ON' : 'OFF'}`);
    } catch { showToast('오류 발생', 'error'); }
    setTogglingDm(false);
  };

  const addRule = async () => {
    if (!newRule.trim()) return;
    setAddingRule(true);
    try {
      const account = ruleAccount === 'current' ? tab : 'all';
      const res = await fetch('/api/channel/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'rule', account, data: newRule.trim() }),
      });
      const data = await res.json();
      if (data.rule) {
        setRules(prev => [data.rule, ...prev]);
        setNewRule('');
        showToast('규칙 추가됨');
      }
    } catch { showToast('오류 발생', 'error'); }
    setAddingRule(false);
  };

  const toggleRule = async (id) => {
    try {
      await fetch('/api/channel/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'toggle_rule', data: { id } }),
      });
      setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
    } catch { showToast('오류 발생', 'error'); }
  };

  const deleteRule = async (id) => {
    try {
      await fetch('/api/channel/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'delete_rule', data: { id } }),
      });
      setRules(prev => prev.filter(r => r.id !== id));
      showToast('규칙 삭제됨');
    } catch { showToast('오류 발생', 'error'); }
  };

  const learnPersona = async () => {
    setLearning(true);
    try {
      const res = await fetch('/api/channel/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: tab }),
      });
      const data = await res.json();
      if (data.success) {
        // Reload persona
        const personaRes = await fetch('/api/channel/persona').then(r => r.json());
        setPersona({ yuminhye: personaRes.yuminhye || {}, millimilli: personaRes.millimilli || {} });
        showToast(`✅ 페르소나 재학습 완료 (${data.learnedFrom}개 게시물)`);
      } else {
        showToast(data.message || '게시물 데이터 없음', 'error');
      }
    } catch { showToast('재학습 오류', 'error'); }
    setLearning(false);
  };

  // ── Derived data ──────────────────────────────────────────
  const acc = ACCOUNTS[tab];
  const p = persona[tab] || {};
  const s = settings[tab] || {};
  const h = history[tab] || { comments: [], dms: [], counts: { comment: 0, dm: 0 } };
  const tabPosts = posts[tab] || [];
  const tabFollowers = followers[tab];

  // 7일 이내 게시물 평균 댓글
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const recentPosts = tabPosts.filter(p => new Date(p.timestamp) >= sevenDaysAgo);
  const avgComments7d = recentPosts.length > 0
    ? Math.round(recentPosts.reduce((s, p) => s + (p.comments_count || 0), 0) / recentPosts.length)
    : tabPosts.length > 0
      ? Math.round(tabPosts.reduce((s, p) => s + (p.comments_count || 0), 0) / tabPosts.length)
      : 0;

  // Filter rules for current account
  const accountRules = rules.filter(r => r.account === tab || r.account === 'all');
  const historyData = historyTab === 'comment' ? h.comments : h.dms;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#F5F5F7' }}>

      {/* ── Header ───────────────────────────────────────── */}
      <div style={{ height: 50, padding: '0 24px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #E5E5EA', background: '#FFFFFF', flexShrink: 0, gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F' }}>채널 운영</span>
        <span style={{ fontSize: 11, color: '#AEAEB2' }}>· Instagram 자동 응대 & 페르소나 관리</span>
        <div style={{ flex: 1 }} />
        {loading && <Loader2 size={14} color="#AEAEB2" style={{ animation: 'spin 1s linear infinite' }} />}
      </div>

      {/* ── Tab bar ───────────────────────────────────────── */}
      <div style={{ display: 'flex', background: '#FFFFFF', borderBottom: '1px solid #E5E5EA', flexShrink: 0, padding: '0 20px' }}>
        {Object.entries(ACCOUNTS).map(([key, info]) => {
          const isActive = tab === key;
          const tabSettings = settings[key] || {};
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                height: 44, padding: '0 20px', border: 'none', cursor: 'pointer',
                background: 'transparent', color: isActive ? info.color : '#6E6E73',
                fontWeight: isActive ? 600 : 400, fontSize: 13.5,
                borderBottom: isActive ? `2px solid ${info.color}` : '2px solid transparent',
                transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 16 }}>{info.emoji}</span>
              <span>{info.label}</span>
              <span style={{ fontSize: 10.5, color: '#AEAEB2', fontWeight: 400 }}>{info.subLabel}</span>
              {/* 자동응대 active 표시 */}
              {(tabSettings.autoComment || tabSettings.autoDm) && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34C759', flexShrink: 0 }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Body ─────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 40px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* Left column */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── 1. KPI ──────────────────────────────── */}
          <div>
            <SectionTitle>채널 지표</SectionTitle>
            <div style={{ display: 'flex', gap: 10 }}>
              <KpiCard
                label="팔로워"
                value={tabFollowers != null ? fmt(tabFollowers) : '-'}
                sub={`@${acc.ig}`}
                accent={acc.color}
                icon={Users}
              />
              <KpiCard
                label="7일 평균 댓글"
                value={tabPosts.length > 0 ? `${avgComments7d}개` : '-'}
                sub={recentPosts.length > 0 ? `최근 ${recentPosts.length}개 게시물 기준` : '게시물 로드 필요'}
                icon={MessageCircle}
              />
              <KpiCard
                label="자동댓글 누적"
                value={`${(h.counts?.comment || 0).toLocaleString()}건`}
                sub="전체 기간"
                icon={Zap}
              />
              <KpiCard
                label="자동DM 누적"
                value={`${(h.counts?.dm || 0).toLocaleString()}건`}
                sub="전체 기간"
                icon={Send}
              />
            </div>
          </div>

          {/* ── 2. 자동 응대 설정 ────────────────────── */}
          <div>
            <SectionTitle>자동 응대 ON / OFF</SectionTitle>
            <div style={{ ...CARD, padding: '14px 20px' }}>
              <div style={{ display: 'flex', gap: 24 }}>
                {/* 자동 댓글 */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: s.autoComment ? '#F0FFF4' : '#F5F5F7',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <MessageCircle size={16} color={s.autoComment ? '#34C759' : '#AEAEB2'} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F' }}>자동 댓글 답변</div>
                    <div style={{ fontSize: 11, color: '#AEAEB2' }}>
                      {s.autoComment ? `활성 · ${acc.label} 페르소나로 자동 응대 중` : '비활성 · 댓글에 자동 답변하지 않음'}
                    </div>
                  </div>
                  <Toggle on={s.autoComment} onChange={() => toggleAutoComment(tab)} disabled={togglingComment} />
                </div>

                <div style={{ width: 1, background: '#F2F2F5' }} />

                {/* 자동 DM */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: s.autoDm ? '#F0FFF4' : '#F5F5F7',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Send size={16} color={s.autoDm ? '#34C759' : '#AEAEB2'} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F' }}>자동 DM 답변</div>
                    <div style={{ fontSize: 11, color: '#AEAEB2' }}>
                      {s.autoDm ? `활성 · DM 수신 시 자동 응대 중` : '비활성 · DM에 자동 답변하지 않음'}
                    </div>
                  </div>
                  <Toggle on={s.autoDm} onChange={() => toggleAutoDm(tab)} disabled={togglingDm} />
                </div>
              </div>
            </div>
          </div>

          {/* ── 3. 컨텍스트 규칙 ─────────────────────── */}
          <div>
            <SectionTitle>컨텍스트 규칙</SectionTitle>
            <div style={{ ...CARD, padding: '16px 20px' }}>
              {/* 규칙 추가 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input
                  value={newRule}
                  onChange={e => setNewRule(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addRule()}
                  placeholder={`${acc.label} 페르소나에 적용할 규칙 입력... (예: 가격 문의 시 항상 자사몰 먼저 안내)`}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E5EA',
                    fontSize: 12.5, outline: 'none', fontFamily: 'inherit', color: '#1D1D1F',
                    background: '#FAFAFA',
                  }}
                />
                {/* Account scope */}
                <select
                  value={ruleAccount}
                  onChange={e => setRuleAccount(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 12, background: '#FAFAFA', color: '#6E6E73', outline: 'none', fontFamily: 'inherit' }}
                >
                  <option value="current">{acc.label}만</option>
                  <option value="all">전체 계정</option>
                </select>
                <button
                  onClick={addRule}
                  disabled={!newRule.trim() || addingRule}
                  style={{
                    padding: '8px 14px', borderRadius: 8, border: 'none',
                    background: newRule.trim() ? acc.color : '#E5E5EA',
                    color: newRule.trim() ? '#FFF' : '#AEAEB2',
                    cursor: newRule.trim() ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontFamily: 'inherit',
                  }}
                >
                  <Plus size={13} />추가
                </button>
              </div>

              {/* 규칙 목록 */}
              {accountRules.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#AEAEB2', fontSize: 12.5 }}>
                  추가된 규칙이 없습니다. 위에서 규칙을 추가하세요.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {accountRules.map(rule => (
                    <div
                      key={rule.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        borderRadius: 8,
                        background: rule.enabled ? '#FAFAFA' : '#F5F5F7',
                        border: `1px solid ${rule.enabled ? '#E5E5EA' : '#F2F2F5'}`,
                        opacity: rule.enabled ? 1 : 0.6,
                      }}
                    >
                      {/* Account badge */}
                      <span style={{
                        fontSize: 9.5, fontWeight: 600, padding: '1px 6px', borderRadius: 4, flexShrink: 0,
                        background: rule.account === 'all' ? '#F5F5F7' : acc.lightBg,
                        color: rule.account === 'all' ? '#6E6E73' : acc.color,
                      }}>
                        {rule.account === 'all' ? '전체' : ACCOUNTS[rule.account]?.label || rule.account}
                      </span>
                      <span style={{ flex: 1, fontSize: 12.5, color: rule.enabled ? '#1D1D1F' : '#AEAEB2' }}>
                        {rule.text}
                      </span>
                      <span style={{ fontSize: 10, color: '#AEAEB2', flexShrink: 0 }}>{timeAgo(rule.addedAt)}</span>
                      {/* 반영 toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, color: rule.enabled ? '#34C759' : '#AEAEB2' }}>
                          {rule.enabled ? '반영' : '미반영'}
                        </span>
                        <Toggle on={rule.enabled} onChange={() => toggleRule(rule.id)} />
                      </div>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', opacity: 0.5 }}
                      >
                        <Trash2 size={12} color="#FF3B30" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── 4. 응대 히스토리 ─────────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <SectionTitle>응대 히스토리</SectionTitle>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['comment', `댓글 ${h.counts?.comment || 0}건`], ['dm', `DM ${h.counts?.dm || 0}건`]].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setHistoryTab(key)}
                    style={{
                      padding: '4px 10px', borderRadius: 6, border: `1px solid ${historyTab === key ? acc.color : '#E5E5EA'}`,
                      background: historyTab === key ? acc.lightBg : '#FFF',
                      color: historyTab === key ? acc.color : '#6E6E73',
                      fontSize: 11, fontWeight: historyTab === key ? 600 : 400,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
              {historyData.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#AEAEB2', fontSize: 12.5 }}>
                  {historyTab === 'comment' ? '자동 댓글 응대 기록이 없습니다.' : '자동 DM 응대 기록이 없습니다.'}
                  {!s.autoComment && historyTab === 'comment' && (
                    <div style={{ fontSize: 11, marginTop: 4 }}>자동 댓글을 활성화하면 기록이 쌓입니다.</div>
                  )}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ background: '#FAFAFA' }}>
                      <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, color: '#AEAEB2', fontWeight: 500, borderBottom: '1px solid #F2F2F5' }}>작성자</th>
                      <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, color: '#AEAEB2', fontWeight: 500, borderBottom: '1px solid #F2F2F5' }}>원본 댓글</th>
                      <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, color: '#AEAEB2', fontWeight: 500, borderBottom: '1px solid #F2F2F5' }}>AI 응답</th>
                      <th style={{ padding: '8px 14px', textAlign: 'right', fontSize: 10, color: '#AEAEB2', fontWeight: 500, borderBottom: '1px solid #F2F2F5' }}>시간</th>
                      <th style={{ padding: '8px 14px', textAlign: 'center', fontSize: 10, color: '#AEAEB2', fontWeight: 500, borderBottom: '1px solid #F2F2F5' }}>결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyData.slice(0, 20).map((item, i, arr) => (
                      <tr key={i}>
                        <td style={{ padding: '7px 14px', borderBottom: i < arr.length - 1 ? '1px solid #F5F5F7' : 'none', color: '#6E6E73', fontWeight: 500, whiteSpace: 'nowrap' }}>
                          @{item.author || '-'}
                        </td>
                        <td style={{ padding: '7px 14px', borderBottom: i < arr.length - 1 ? '1px solid #F5F5F7' : 'none', color: '#AEAEB2', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.text || '-'}
                        </td>
                        <td style={{ padding: '7px 14px', borderBottom: i < arr.length - 1 ? '1px solid #F5F5F7' : 'none', color: '#1D1D1F', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.reply || '-'}
                        </td>
                        <td style={{ padding: '7px 14px', borderBottom: i < arr.length - 1 ? '1px solid #F5F5F7' : 'none', textAlign: 'right', color: '#AEAEB2', whiteSpace: 'nowrap' }}>
                          {timeAgo(item.timestamp)}
                        </td>
                        <td style={{ padding: '7px 14px', borderBottom: i < arr.length - 1 ? '1px solid #F5F5F7' : 'none', textAlign: 'center' }}>
                          {item.success ? <CheckCircle2 size={13} color="#34C759" /> : <XCircle size={13} color="#FF3B30" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>

        {/* Right column: 페르소나 + 게시물 */}
        <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── 5. 페르소나 ──────────────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <SectionTitle>페르소나</SectionTitle>
              <button
                onClick={learnPersona}
                disabled={learning || tabPosts.length === 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7,
                  border: `1px solid ${acc.color}`, background: 'transparent',
                  color: acc.color, fontSize: 11.5, cursor: learning || tabPosts.length === 0 ? 'default' : 'pointer',
                  opacity: tabPosts.length === 0 ? 0.5 : 1, fontFamily: 'inherit',
                }}
              >
                {learning ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <BookOpen size={11} />}
                {learning ? '재학습 중...' : '재학습'}
              </button>
            </div>
            <div style={{ ...CARD, padding: '14px 16px' }}>
              {/* 기본 페르소나 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: acc.lightBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  {acc.emoji}
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1D1D1F' }}>{acc.label}</div>
                  <div style={{ fontSize: 10.5, color: '#AEAEB2' }}>{acc.subLabel}</div>
                </div>
              </div>

              {[
                { label: '성격', value: p.character },
                { label: '말투', value: p.tone },
                { label: '주제', value: Array.isArray(p.topics) ? p.topics.join(', ') : p.topics },
                { label: '댓글 스타일', value: p.commentStyle },
                { label: '금지 사항', value: Array.isArray(p.forbid) ? p.forbid.join(' · ') : p.forbid },
              ].map(({ label, value }) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 600, color: '#AEAEB2', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 11.5, color: '#1D1D1F', lineHeight: 1.45 }}>{value || '-'}</div>
                </div>
              ))}

              {/* 학습된 인사이트 */}
              {p.learned && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: acc.lightBg, borderRadius: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: acc.color, marginBottom: 6 }}>
                    🧠 AI 학습 결과 · {timeAgo(p.learnedAt)}
                  </div>
                  {p.learned.mainTopics && (
                    <div style={{ marginBottom: 5 }}>
                      <span style={{ fontSize: 10, color: '#6E6E73' }}>최근 주제: </span>
                      <span style={{ fontSize: 11, color: '#1D1D1F' }}>{p.learned.mainTopics.join(', ')}</span>
                    </div>
                  )}
                  {p.learned.recentFocus && (
                    <div style={{ marginBottom: 5 }}>
                      <span style={{ fontSize: 10, color: '#6E6E73' }}>트렌드: </span>
                      <span style={{ fontSize: 11, color: '#1D1D1F' }}>{p.learned.recentFocus}</span>
                    </div>
                  )}
                  {p.learned.avgEngagement && (
                    <div style={{ fontSize: 10, color: '#6E6E73' }}>
                      평균 좋아요 {p.learned.avgEngagement.likes}개 · 댓글 {p.learned.avgEngagement.comments}개
                    </div>
                  )}
                </div>
              )}

              {!p.learned && p.learnedAt == null && (
                <div style={{ marginTop: 10, padding: '8px 10px', background: '#FFFBEB', borderRadius: 8, border: '1px solid #FDE68A' }}>
                  <div style={{ fontSize: 11, color: '#92400E' }}>
                    ℹ️ 아직 학습하지 않았습니다. 게시물을 불러온 후 "재학습"을 실행하세요.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── 6. 최근 게시물 ───────────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <SectionTitle>최근 10개 게시물</SectionTitle>
              <button
                onClick={() => loadPosts(tab, true)}
                disabled={postsLoading[tab]}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6,
                  border: '1px solid #E5E5EA', background: '#FFF', color: '#6E6E73',
                  fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {postsLoading[tab] ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={11} />}
                새로고침
              </button>
            </div>
            <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
              {postsLoading[tab] ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#AEAEB2', fontSize: 12 }}>불러오는 중...</div>
              ) : tabPosts.length === 0 ? (
                <div style={{ padding: '16px 18px' }}>
                  <div style={{ fontSize: 12.5, color: '#AEAEB2', textAlign: 'center', marginBottom: 4 }}>
                    게시물 데이터 없음
                  </div>
                  <div style={{ fontSize: 11, color: '#AEAEB2', textAlign: 'center' }}>
                    Instagram Graph API 토큰 및 User ID 설정 필요
                  </div>
                </div>
              ) : (
                tabPosts.map((post, i) => {
                  const date = post.timestamp ? new Date(post.timestamp).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '';
                  const caption = (post.caption || '').slice(0, 60);
                  return (
                    <div key={post.id || i} style={{
                      padding: '8px 14px',
                      borderBottom: i < tabPosts.length - 1 ? '1px solid #F5F5F7' : 'none',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: acc.lightBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 600, color: acc.color }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, color: '#1D1D1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {caption || '(캡션 없음)'}
                        </div>
                        <div style={{ fontSize: 10, color: '#AEAEB2', marginTop: 1 }}>{date}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, color: '#6E6E73' }}>❤️ {post.like_count || 0}</span>
                        <span style={{ fontSize: 10, color: '#6E6E73' }}>💬 {post.comments_count || 0}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Toast ──────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 500,
          background: toast.type === 'error' ? '#FF3B30' : '#1D1D1F', color: '#FFF',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 9999,
          animation: 'fadeIn 0.2s ease',
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      `}</style>
    </div>
  );
}

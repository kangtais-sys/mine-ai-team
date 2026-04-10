import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Loader2, TrendingUp, TrendingDown, Users, Eye, MessageCircle, DollarSign, Star, Globe, Package, Headphones, ShoppingCart, FileText, BarChart3, CheckCircle2, XCircle, Circle, Target, Percent, Play, Clock } from 'lucide-react';
import useChatStore from '../store/chatStore';
import { getAgent } from '../lib/agents';

// ─── Helpers ────────────────────────────────────────────────

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

const fmt = (v) => {
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억`;
  if (v >= 10000000) return `${(v / 10000000).toFixed(1)}천만`;
  if (v >= 10000) return `${(v / 10000).toFixed(0)}만`;
  return v.toLocaleString();
};

// ─── Reusable Components ────────────────────────────────────

function KpiCard({ label, value, delta, up, icon: Icon }) {
  return (
    <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#777', fontWeight: 500 }}>{label}</span>
        {Icon && <Icon size={13} strokeWidth={1.5} color="#444" />}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#FFF', lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      {delta && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 6 }}>
          {up ? <TrendingUp size={11} color="#22C55E" /> : <TrendingDown size={11} color="#EF4444" />}
          <span style={{ fontSize: 11, color: up ? '#22C55E' : '#EF4444', fontWeight: 500 }}>{delta}</span>
        </div>
      )}
    </div>
  );
}

function ApiStatusPanel({ agent }) {
  const apis = agent.apis || [];
  if (apis.length === 0) return null;

  // Check real connection status from localStorage
  const getStatus = (api) => {
    if (api.connected) return 'connected';
    const keyMap = {
      google_drive: 'google_connected',
      youtube: 'google_connected',
      tiktok: 'tiktok_connected',
    };
    if (api.key === 'instagram') return 'automated';
    const lsKey = keyMap[api.key];
    if (lsKey && localStorage.getItem(lsKey) === 'true') return 'connected';
    return 'disconnected';
  };

  return (
    <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>API 연동 상태</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {apis.map((api, i) => {
          const status = getStatus(api);
          const color = (status === 'connected' || status === 'automated') ? '#22C55E' : status === 'error' ? '#EF4444' : '#555';
          const bg = (status === 'connected' || status === 'automated') ? 'rgba(34,197,94,0.06)' : status === 'error' ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)';
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
              borderRadius: 4, background: bg, cursor: status === 'disconnected' ? 'pointer' : 'default',
            }}
              onClick={() => {
                if (status !== 'disconnected') return;
                if (api.key === 'google_drive' || api.key === 'youtube' || api.key === 'google_sheets' || api.key === 'adsense') window.location.href = '/api/auth/google';
                else if (api.key === 'tiktok' || api.key === 'tiktok_ads' || api.key === 'tiktokshop') window.location.href = '/api/auth/tiktok';
              }}
            >
              {status === 'connected' ? <CheckCircle2 size={11} color={color} /> : status === 'error' ? <XCircle size={11} color={color} /> : <Circle size={11} color={color} />}
              <span style={{ fontSize: 11, color: status === 'connected' ? '#CCC' : '#666', flex: 1 }}>{api.name}</span>
              <span style={{ fontSize: 10, color, fontWeight: 500 }}>
                {status === 'automated' ? '자동화 연결됨' : status === 'connected' ? '연결됨' : status === 'error' ? '오류' : '미연결'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── API-connected sub-components ───────────────────────────

function CommunityKpis() {
  const [d, setD] = useState(null);
  const [platTab, setPlatTab] = useState('all');
  useEffect(() => { fetch('/api/agents/community').then(r => r.json()).then(setD).catch(() => {}); }, []);
  const ts = d?.typeStats || {};
  const typeTotal = ts.event + ts.product + ts.claim + ts.other || 1;
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <KpiCard label="오늘 댓글" value={d ? `${d.today?.comments || 0}건` : '-'} delta="오늘 누적" up icon={MessageCircle} />
        <KpiCard label="오늘 DM" value={d ? `${d.today?.dm || 0}건` : '-'} delta="오늘 누적" up icon={MessageCircle} />
        <KpiCard label="당월 댓글" value={d ? `${d.monthly?.comments || 0}건` : '-'} delta="당월 누적" up icon={CheckCircle2} />
        <KpiCard label="당월 DM" value={d ? `${d.monthly?.dm || 0}건` : '-'} delta="당월 누적" up icon={Users} />
      </div>
      {/* Type breakdown */}
      <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>댓글 유형 분류 (오늘)</div>
        {[
          { label: '이벤트 참여', key: 'event', color: '#5E6AD2' },
          { label: '상품/배송 문의', key: 'product', color: '#7C6BDE' },
          { label: '클레임', key: 'claim', color: '#EF4444' },
          { label: '기타', key: 'other', color: '#555' },
        ].map((t, i) => (
          <div key={i} style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: '#CCC' }}>{t.label}</span>
              <span style={{ fontSize: 11, color: '#888' }}>{ts[t.key] || 0}건</span>
            </div>
            <div style={{ height: 3, background: '#1F1F1F', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${((ts[t.key] || 0) / typeTotal) * 100}%`, background: t.color, borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </div>
      {/* Platform tabs + recent comments */}
      <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[['all','전체'],['instagram','인스타'],['youtube','유튜브'],['threads','쓰레드']].map(([id,label]) => (
            <button key={id} onClick={() => setPlatTab(id)} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: platTab === id ? '#5E6AD2' : '#1A1A1A', color: platTab === id ? '#FFF' : '#777' }}>{label}</button>
          ))}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 8 }}>최근 댓글</div>
        {(d?.recentComments || []).filter(c => platTab === 'all' || c.platform === platTab).slice(0, 6).map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: i < 5 ? '1px solid #1F1F1F' : 'none' }}>
            <span style={{ fontSize: 9, color: '#5E6AD2', width: 16, flexShrink: 0 }}>{c.platform?.slice(0,2).toUpperCase()}</span>
            <span style={{ fontSize: 10, color: '#CCC', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.text}</span>
            <span style={{ fontSize: 9, color: '#555', flexShrink: 0 }}>{c.date?.slice(5,10)}</span>
          </div>
        ))}
        {(!d?.recentComments || d.recentComments.length === 0) && (
          <div style={{ fontSize: 11, color: '#555', padding: '8px 0' }}>댓글 데이터 로딩 중...</div>
        )}
      </div>
    </>
  );
}

// ─── Sisuru Proposals ───────────────────────────────────────

function SisuruProposals() {
  const [proposals, setProposals] = useState(null);
  const [selecting, setSelecting] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch('/api/sisuru-select').then(r => r.json()).then(d => setProposals(d)).catch(() => {});
  }, []);

  const select = async (id) => {
    setSelecting(id);
    setResult(null);
    try {
      const r = await fetch('/api/sisuru-select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const d = await r.json();
      setResult(d);
    } catch (e) { setResult({ error: e.message }); }
    setSelecting(null);
  };

  // API: { proposals: { date, proposals: [...] }, selected: {...} }
  const raw = proposals?.proposals;
  const items = (raw?.proposals || (Array.isArray(raw) ? raw : []));
  const selected = proposals?.selected;

  return (
    <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5' }}>시수르더쿠 오늘의 주제</div>
        {selected && <span style={{ fontSize: 9, background: '#22C55E22', color: '#22C55E', padding: '2px 6px', borderRadius: 3 }}>선택됨</span>}
      </div>
      {selected && (
        <div style={{ background: '#5E6AD215', border: '1px solid #5E6AD233', borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#5E6AD2' }}>{selected.topic}</div>
          <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{selected.hook}</div>
        </div>
      )}
      {items.length > 0 ? items.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: i < items.length - 1 ? '1px solid #1F1F1F' : 'none' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#5E6AD2', width: 16, flexShrink: 0, marginTop: 2 }}>{p.id}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#CCC', fontWeight: 500 }}>{p.topic}</div>
            <div style={{ fontSize: 10, color: '#777', marginTop: 2 }}>{p.hook}</div>
            <div style={{ fontSize: 9, color: '#555', marginTop: 1 }}>{p.type} · 참여도 {p.engagement_score}/10</div>
          </div>
          <button
            onClick={() => select(p.id)}
            disabled={selecting === p.id}
            style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: selecting === p.id ? '#333' : '#5E6AD2', color: '#FFF', flexShrink: 0, marginTop: 2 }}
          >
            {selecting === p.id ? '...' : '선택'}
          </button>
        </div>
      )) : (
        <div style={{ fontSize: 11, color: '#555', padding: '8px 0' }}>
          {proposals ? '제안 없음 — 매일 아침 9시 자동 생성' : '로딩 중...'}
        </div>
      )}
      {result?.success && (
        <div style={{ fontSize: 10, color: '#22C55E', marginTop: 8, background: '#22C55E11', padding: '4px 8px', borderRadius: 4 }}>
          제작 시작: {result.selected?.topic}
        </div>
      )}
      {result?.error && (
        <div style={{ fontSize: 10, color: '#EF4444', marginTop: 8 }}>{result.error}</div>
      )}
    </div>
  );
}

// ─── Agent KPI Dashboards ───────────────────────────────────

const AGENT_DASHBOARDS = {
  chief: () => {
    const [data, setData] = useState(null);
    useEffect(() => { fetch('/api/agents/strategy').then(r => r.json()).then(setData).catch(() => {}); }, []);
    const c = data?.connections || {};
    const costs = data?.costs || {};
    const report = data?.dailyReport;
    return (
      <>
        {/* Core KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <KpiCard label="연결 상태" value={`${data?.connCount || 0}/${data?.totalConnections || 9}`} delta="실시간" up icon={Users} />
          <KpiCard label="댓글+DM" value={data?.summary?.community ? `${(data.summary.community.comments||0)+(data.summary.community.dm||0)}건` : '-'} delta="누적" up icon={MessageCircle} />
          <KpiCard label="API 호출" value={`${data?.claudeCalls?.today || 0}회`} delta="오늘" icon={Target} />
        </div>

        {/* Connection status */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>API 연결 현황</div>
          {Object.entries(c).map(([name, val], i) => {
            const st = val?.status || val;
            const color = st === 'connected' ? '#22C55E' : st === 'pending' ? '#F59E0B' : '#555';
            const icon = st === 'connected' ? '🟢' : st === 'pending' ? '🟡' : '🔴';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < Object.keys(c).length - 1 ? '1px solid #1F1F1F' : 'none' }}>
                <span style={{ fontSize: 10 }}>{icon}</span>
                <span style={{ fontSize: 11, color: '#CCC', flex: 1 }}>{name}</span>
                <span style={{ fontSize: 10, color }}>{st === 'connected' ? '정상' : st === 'pending' ? '대기' : '미연결'}</span>
              </div>
            );
          })}
        </div>

        {/* Monthly costs */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5' }}>월간 비용 현황</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#F59E0B' }}>${data?.totalCostUSD || '-'}/월</span>
          </div>
          {Object.values(costs).map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < Object.values(costs).length - 1 ? '1px solid #1F1F1F' : 'none' }}>
              <span style={{ fontSize: 11, color: '#CCC', flex: 1 }}>{item.name}</span>
              <span style={{ fontSize: 11, color: '#888' }}>
                {item.currency === 'EUR' ? '\u20AC' : '$'}{item.amount}
              </span>
              {item.note && <span style={{ fontSize: 9, color: '#555' }}>{item.note}</span>}
            </div>
          ))}
        </div>

        {/* Token usage */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 8 }}>Claude API 사용량</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#FFF' }}>{data?.claudeCalls?.today || 0}<span style={{ fontSize: 12, color: '#555', fontWeight: 400 }}> calls today</span></div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>예상 일비용: ~${((data?.claudeCalls?.today || 0) * 0.002).toFixed(3)}</div>
          <div style={{ fontSize: 9, color: '#444', marginTop: 6 }}>절감 팁: 반복 댓글 캐싱, 배치 처리, 짧은 프롬프트</div>
        </div>

        {/* Daily report */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 8 }}>종합 일간 보고</div>
          {report ? (
            <>
              <div style={{ fontSize: 11, color: '#CCC', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{report.report}</div>
              <div style={{ fontSize: 9, color: '#444', marginTop: 6 }}>{report.date} · 매일 오전 8시 자동 생성</div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: '#555' }}>매일 오전 8시 자동 생성 (첫 보고 대기 중)</div>
          )}
        </div>
      </>
    );
  },

  creator: () => {
    const [tab, setTab] = useState('millimilli');
    const [data, setData] = useState(null);

    useEffect(() => {
      fetch('/api/agents/creator').then(r => r.json()).then(setData).catch(() => {});
    }, []);

    const tabBtn = (id, label) => (
      <button onClick={() => setTab(id)} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: tab === id ? '#5E6AD2' : '#1A1A1A', color: tab === id ? '#FFF' : '#777' }}>{label}</button>
    );

    const f = data?.followers || {};
    const c = data?.counts || {};

    // Mini calendar
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const byDate = data?.byDate || {};

    return (
      <>
        {/* Tab Selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {tabBtn('millimilli', '밀리밀리')}
          {tabBtn('yuminhye', '유민혜')}
          {tabBtn('ulsera', '얼쎄라')}
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="오늘 발행" value={`${c.today || 0}건`} delta="오늘 누적" up icon={FileText} />
          <KpiCard label="당월 발행" value={`${c.thisMonth || 0}건`} delta="당월 누적" up icon={FileText} />
        </div>

        {/* Followers for selected tab */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 8 }}>
            {tab === 'yuminhye' ? '유민혜' : tab === 'ulsera' ? '얼쎄라 (ULSERA)' : '밀리밀리'} 채널별 팔로워
          </div>
          {tab === 'ulsera' ? (
            <div style={{ fontSize: 11, color: '#F59E0B', padding: '8px 0' }}>Zernio 미연결 — 연결 후 자동 표시</div>
          ) : (
            Object.entries(f[tab] || {}).map(([plat, count], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < Object.keys(f[tab] || {}).length - 1 ? '1px solid #1F1F1F' : 'none' }}>
                <span style={{ fontSize: 10, color: plat === 'instagram' ? '#E1306C' : plat === 'tiktok' ? '#69C9D0' : '#FF0000', fontWeight: 600, width: 18 }}>
                  {plat === 'instagram' ? 'IG' : plat === 'tiktok' ? 'TT' : 'YT'}
                </span>
                <span style={{ fontSize: 11, color: '#CCC', flex: 1 }}>{plat}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#FFF' }}>{count ? fmt(count) : '-'}</span>
              </div>
            ))
          )}
          <div style={{ fontSize: 9, color: '#444', marginTop: 6 }}>실시간</div>
        </div>

        {/* Mini Calendar */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>
            {year}년 {month + 1}월 발행 캘린더
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
            {['일','월','화','수','목','금','토'].map(d => (
              <div key={d} style={{ fontSize: 9, color: '#555', padding: '2px 0' }}>{d}</div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const count = byDate[dateStr] || 0;
              const isToday = day === now.getDate();
              return (
                <div key={day} style={{
                  padding: '3px 0', borderRadius: 4, fontSize: 10, position: 'relative',
                  background: isToday ? '#5E6AD222' : 'transparent',
                  color: isToday ? '#5E6AD2' : count > 0 ? '#CCC' : '#333',
                  fontWeight: isToday ? 600 : 400,
                }}>
                  {day}
                  {count > 0 && <div style={{ width: 4, height: 4, borderRadius: 2, background: '#22C55E', margin: '1px auto 0' }} />}
                  {count === 0 && day <= now.getDate() && <div style={{ width: 4, height: 4, borderRadius: 2, background: '#333', margin: '1px auto 0' }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sisuru Proposals */}
        <SisuruProposals />

        {/* Recent posts */}
        {data?.recent?.length > 0 && (
          <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 8 }}>최근 발행</div>
            {data.recent.slice(0, 5).map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < Math.min(data.recent.length, 5) - 1 ? '1px solid #1F1F1F' : 'none' }}>
                <span style={{ fontSize: 10, color: '#5E6AD2', width: 24 }}>{(p.platforms || [])[0]?.slice(0, 2).toUpperCase()}</span>
                <span style={{ fontSize: 11, color: '#CCC', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{p.createdAt?.slice(5, 10)}</span>
              </div>
            ))}
          </div>
        )}
      </>
    );
  },

  community: () => {
    const [igLogs, setIgLogs] = useState(null);
    const [igLoading, setIgLoading] = useState(true);
    const [igRunning, setIgRunning] = useState(false);
    const [igError, setIgError] = useState(null);
    const mockLogs = [
      { time: '18:02', user: '@beauty_fan_kr', comment: '이 세럼 진짜 좋아요!', reply: '감사합니다 💕 꾸준히 사용하시면 더 좋은 결과 보실 거예요!', status: 'replied' },
      { time: '18:01', user: '@skincare_daily', comment: '가격이 얼마인가요?', reply: '공식 스마트스토어에서 29,000원입니다! 😊', status: 'replied' },
      { time: '18:01', user: '@ad_spam_bot', comment: '팔로우하면 선물...', reply: '-', status: 'skipped' },
      { time: '13:03', user: '@glow_up_jin', comment: '성분이 궁금해요', reply: '500달톤 저분자 콜라겐 + 나이아신아마이드가 핵심입니다!', status: 'replied' },
      { time: '13:02', user: '@jp_beauty', comment: '日本に配送できますか?', reply: 'はい！Qoo10 Japanで購入可能です ✨', status: 'replied' },
      { time: '09:05', user: '@random_user', comment: 'ㅋㅋㅋㅋ', reply: '-', status: 'skipped' },
    ];
    const logs = igLogs || mockLogs;
    const replied = logs.filter(l => l.status === 'replied').length;
    const skipped = logs.filter(l => l.status === 'skipped').length;
    const hour = new Date().getHours();
    const schedules = [
      { time: '09:00', done: hour >= 9 },
      { time: '13:00', done: hour >= 13 },
      { time: '18:00', done: hour >= 18 },
      { time: '22:00', done: hour >= 22 },
    ];

    const fetchLogs = () => {
      fetch('/api/instagram-logs')
        .then(r => r.json())
        .then(d => { if (d.logs && d.logs.length > 0) setIgLogs(d.logs); })
        .catch(() => {})
        .finally(() => setIgLoading(false));
    };

    useEffect(() => { fetchLogs(); }, []);

    const runNow = () => {
      setIgRunning(true);
      setIgError(null);
      fetch('/api/cron/instagram-comments', { method: 'POST' })
        .then(r => r.json())
        .then(d => {
          if (d.success) setTimeout(fetchLogs, 5000);
          else setIgError(d.error || '실행 실패');
        })
        .catch(e => setIgError(e.message))
        .finally(() => setIgRunning(false));
    };

    return (
      <>
        <CommunityKpis />

        {/* Instagram 댓글 자동화 */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5' }}>Instagram 댓글 자동화</div>
            <button
              onClick={runNow}
              disabled={igRunning}
              style={{
                fontSize: 10, padding: '3px 10px', borderRadius: 4,
                border: 'none', background: '#5E6AD2', color: '#FFF',
                cursor: igRunning ? 'default' : 'pointer', opacity: igRunning ? 0.5 : 1,
                fontFamily: 'inherit',
              }}
            >
              {igRunning ? '실행 중...' : '지금 실행'}
            </button>
          </div>

          {/* Schedule */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            {schedules.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {s.done
                  ? <CheckCircle2 size={11} color="#22C55E" />
                  : <Clock size={11} color="#555" />
                }
                <span style={{ fontSize: 11, color: s.done ? '#22C55E' : '#555' }}>{s.time}</span>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={{ background: '#1A1A1A', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#777' }}>댓글 수신</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#FFF' }}>{logs.length}</div>
            </div>
            <div style={{ background: '#1A1A1A', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#777' }}>답글 완료</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#22C55E' }}>{replied}</div>
            </div>
            <div style={{ background: '#1A1A1A', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#777' }}>스킵</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#F59E0B' }}>{skipped}</div>
            </div>
          </div>

          {/* Status messages */}
          {igLoading && !igLogs && (
            <div style={{ fontSize: 11, color: '#555', textAlign: 'center', padding: 4 }}>로그 로딩 중...</div>
          )}
          {igError && (
            <div style={{ fontSize: 11, color: '#EF4444', background: 'rgba(239,68,68,0.06)', borderRadius: 4, padding: '4px 8px', marginBottom: 8 }}>{igError}</div>
          )}
          {!igLogs && !igLoading && (
            <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>API 미연결 — 목업 데이터 표시 중</div>
          )}

          {/* Log Table */}
          <div>
            <div style={{ display: 'flex', gap: 6, fontSize: 10, color: '#555', borderBottom: '1px solid #242424', paddingBottom: 4, marginBottom: 4 }}>
              <span style={{ width: 36 }}>시간</span>
              <span style={{ width: 90 }}>작성자</span>
              <span style={{ flex: 1 }}>댓글</span>
              <span style={{ flex: 1 }}>답글</span>
              <span style={{ width: 44, textAlign: 'right' }}>상태</span>
            </div>
            {logs.slice(0, 5).map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0', borderBottom: i < Math.min(logs.length, 5) - 1 ? '1px solid #1F1F1F' : 'none' }}>
                <span style={{ width: 36, fontSize: 10, color: '#777', fontFamily: 'monospace' }}>{l.time}</span>
                <span style={{ width: 90, fontSize: 10, color: '#5E6AD2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.user}</span>
                <span style={{ flex: 1, fontSize: 10, color: '#CCC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.comment}</span>
                <span style={{ flex: 1, fontSize: 10, color: '#777', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.reply}</span>
                <span style={{ width: 44, fontSize: 10, fontWeight: 600, textAlign: 'right', color: l.status === 'replied' ? '#22C55E' : '#F59E0B' }}>
                  {l.status === 'replied' ? 'replied' : 'skipped'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  },

  cs: () => {
    const [d, setD] = useState(null);
    useEffect(() => { fetch('/api/agents/cs').then(r => r.json()).then(setD).catch(() => {}); }, []);
    const ts = d?.typeStats || {};
    const typeTotal = ts.exchange + ts.delivery + ts.product + ts.other || 1;
    const ch = d?.channels || {};
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="오늘 문의" value={`${d?.today?.total || 0}건`} delta="오늘 누적" up icon={Headphones} />
          <KpiCard label="당월 문의" value={`${d?.monthly?.total || 0}건`} delta="당월 누적" up icon={Headphones} />
          <KpiCard label="완료" value={`${d?.today?.done || 0}건`} delta="오늘" up icon={CheckCircle2} />
          <KpiCard label="미완료" value={`${d?.today?.pending || 0}건`} delta="오늘" up={false} icon={Clock} />
        </div>
        {/* Type breakdown */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>상담 유형 (오늘)</div>
          {[
            { label: '교환/반품', key: 'exchange', color: '#EF4444' },
            { label: '배송문의', key: 'delivery', color: '#F59E0B' },
            { label: '제품문의', key: 'product', color: '#5E6AD2' },
            { label: '기타', key: 'other', color: '#555' },
          ].map((t, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: '#CCC' }}>{t.label}</span>
                <span style={{ fontSize: 11, color: '#888' }}>{ts[t.key] || 0}건</span>
              </div>
              <div style={{ height: 3, background: '#1F1F1F', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${((ts[t.key] || 0) / typeTotal) * 100}%`, background: t.color, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
        {/* Commerce CS channels */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>채널별 CS 현황</div>
          {[
            { label: '카페24', key: 'cafe24' },
            { label: '스마트스토어', key: 'smartstore' },
            { label: '아마존', key: 'amazon' },
            { label: '쇼피', key: 'shopee' },
          ].map((c, i) => {
            const s = ch[c.key] || {};
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < 3 ? '1px solid #1F1F1F' : 'none' }}>
                <span style={{ fontSize: 11 }}>{s.status === 'connected' ? '🟢' : '🔴'}</span>
                <span style={{ fontSize: 11, color: '#CCC', flex: 1 }}>{c.label}</span>
                <span style={{ fontSize: 10, color: s.status === 'connected' ? '#888' : '#555' }}>
                  {s.status === 'connected' ? `미처리 ${s.pending || '-'}건` : '미연결'}
                </span>
              </div>
            );
          })}
        </div>
        {/* Happytalk + Kakao banner */}
        <div style={{ background: '#141414', border: '1px solid #F59E0B33', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 11, color: '#F59E0B', marginBottom: 4 }}>
            {d?.happytalk?.status === 'connected' ? '🟢 해피톡 연동됨' : '🟡 해피톡 연동 준비 중'}
          </div>
          <div style={{ fontSize: 10, color: '#555' }}>카카오톡 채널 CS: 추후 검토 예정</div>
        </div>
      </>
    );
  },

  marketer: () => {
    const [d, setD] = useState(null);
    const [agencyTab, setAgencyTab] = useState('inhouse');
    useEffect(() => { fetch('/api/agents/marketer').then(r => r.json()).then(setD).catch(() => {}); }, []);
    const m = d?.meta || {};
    const roasColor = (v) => { const n = Number(v); return n >= 3 ? '#22C55E' : n >= 2 ? '#F59E0B' : '#EF4444'; };
    return (
      <>
        {/* Meta Ads KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="Meta 광고비" value={m.totalSpend ? `${fmt(m.totalSpend)}원` : m.status === 'disconnected' ? '미연결' : '-'} delta="주간 누적" up icon={DollarSign} />
          <KpiCard label="총 광고비" value={d?.totalSpend ? `${fmt(d.totalSpend)}원` : '-'} delta="당월 누적" icon={DollarSign} />
        </div>

        {/* Meta accounts with ROAS */}
        {m.accounts?.length > 0 && (
          <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>Meta 계정별 ROAS</div>
            {m.accounts.map((acc, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < m.accounts.length - 1 ? '1px solid #1F1F1F' : 'none' }}>
                <span style={{ fontSize: 10, color: '#CCC', flex: 1 }}>{acc.name}</span>
                <span style={{ fontSize: 10, color: '#888' }}>{acc.spend ? fmt(acc.spend) + '원' : '-'}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: acc.roas !== '-' ? roasColor(acc.roas) : '#555', width: 40, textAlign: 'right' }}>
                  {acc.roas !== '-' ? `${acc.roas}x` : '-'}
                </span>
              </div>
            ))}
            <div style={{ fontSize: 9, color: '#444', marginTop: 6 }}>목표 ROAS 3.0x · 🟢3.0+ 🟡2.0~3.0 🔴2.0-</div>
          </div>
        )}

        {/* Agency tabs */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>대행사별 현황</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {[['inhouse','인하우스'],['growth','그로스'],['en','이엔'],['epro','이프로']].map(([id,label]) => (
              <button key={id} onClick={() => setAgencyTab(id)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: agencyTab === id ? '#5E6AD2' : '#1A1A1A', color: agencyTab === id ? '#FFF' : '#777' }}>{label}</button>
            ))}
          </div>
          {(() => {
            const ag = d?.agencies?.[agencyTab] || {};
            return ag.status === 'connected' ? (
              <div style={{ fontSize: 11, color: '#CCC' }}>🟢 {ag.name} 연동됨 · 데이터 {ag.rows}행</div>
            ) : (
              <div style={{ fontSize: 11, color: '#555' }}>🔴 {ag.name || agencyTab} 시트 미연결<div style={{ fontSize: 9, color: '#444', marginTop: 4 }}>AGENCY_SHEET_{agencyTab.toUpperCase()} 환경변수 필요</div></div>
            );
          })()}
        </div>

        {/* Ad channels */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>광고 채널</div>
          {[['meta','Meta Ads'],['naver','네이버 광고'],['google','구글 광고'],['tiktok','틱톡 광고'],['ga','GA4']].map(([ch,label], i) => {
            const s = d?.[ch] || {};
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < 4 ? '1px solid #1F1F1F' : 'none' }}>
                <span style={{ fontSize: 11 }}>{s.status === 'connected' ? '🟢' : '🔴'}</span>
                <span style={{ fontSize: 11, color: '#CCC', flex: 1 }}>{label}</span>
                <span style={{ fontSize: 10, color: s.status === 'connected' ? '#22C55E' : '#555' }}>{s.status === 'connected' ? '연결됨' : '미연결'}</span>
              </div>
            );
          })}
        </div>

        {/* Optimization suggestions */}
        {d?.suggestions && (
          <div style={{ background: '#141414', border: '1px solid #F59E0B33', borderRadius: 8, padding: 14, marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B', marginBottom: 8 }}>광고 최적화 제안</div>
            {d.suggestions.lowRoas?.length > 0 && (
              <div style={{ fontSize: 10, color: '#EF4444', marginBottom: 6 }}>ROAS 2.0 미만 캠페인: {d.suggestions.lowRoas.length}개</div>
            )}
            {d.suggestions.suggestion && (
              <div style={{ fontSize: 11, color: '#CCC', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{d.suggestions.suggestion}</div>
            )}
            <div style={{ fontSize: 9, color: '#444', marginTop: 6 }}>{d.suggestions.updatedAt?.slice(0, 10)}</div>
          </div>
        )}
      </>
    );
  },

  commerce: () => {
    const [d, setD] = useState(null);
    useEffect(() => { fetch('/api/agents/commerce').then(r => r.json()).then(setD).catch(() => {}); }, []);
    const channels = ['oliveyoung', 'smartstore', 'cafe24', 'amazon', 'shopee', 'qoo10', 'tiktokShop'];
    const labels = { oliveyoung: '올리브영', smartstore: '스마트스토어', cafe24: '카페24', amazon: '아마존', shopee: '쇼피', qoo10: '큐텐', tiktokShop: '틱톡샵' };
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const promos = d?.promotions?.upcoming || d?.promotions?.thisMonth || [];
    const importColor = { high: '#EF4444', medium: '#F59E0B', low: '#555' };
    // Map promos to calendar dates
    const promoByDate = {};
    for (const p of promos) {
      const pd = p.date?.slice(8, 10);
      if (pd && p.date?.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)) promoByDate[Number(pd)] = p;
    }
    return (
      <>
        {/* Promo Calendar */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>
            {year}년 {month+1}월 프로모션 캘린더
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
            {['일','월','화','수','목','금','토'].map(dd => (
              <div key={dd} style={{ fontSize: 9, color: '#555', padding: '2px 0' }}>{dd}</div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const promo = promoByDate[day];
              const isToday = day === now.getDate();
              return (
                <div key={day} title={promo?.name || ''} style={{
                  padding: '3px 0', borderRadius: 4, fontSize: 10, cursor: promo ? 'pointer' : 'default',
                  background: isToday ? '#5E6AD222' : promo ? `${importColor[promo.importance] || '#555'}15` : 'transparent',
                  color: isToday ? '#5E6AD2' : promo ? '#FFF' : '#444',
                  fontWeight: isToday || promo ? 600 : 400,
                  border: promo ? `1px solid ${importColor[promo.importance] || '#555'}44` : '1px solid transparent',
                }}>
                  {day}
                  {promo && <div style={{ width: 4, height: 4, borderRadius: 2, background: importColor[promo.importance] || '#555', margin: '1px auto 0' }} />}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 9, color: '#555' }}>
            <span><span style={{ color: '#EF4444' }}>●</span> 대형</span>
            <span><span style={{ color: '#F59E0B' }}>●</span> 중요</span>
            <span><span style={{ color: '#555' }}>●</span> 보통</span>
          </div>
        </div>

        {/* Upcoming promos list */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>다가오는 프로모션</div>
          {promos.slice(0, 5).map((p, i) => {
            const pDate = new Date(p.date);
            const dDay = Math.ceil((pDate - now) / 86400000);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < Math.min(promos.length, 5) - 1 ? '1px solid #1F1F1F' : 'none' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: importColor[p.importance] || '#555', width: 32 }}>
                  {dDay >= 0 ? `D-${dDay}` : 'END'}
                </span>
                <span style={{ fontSize: 11, color: '#CCC', flex: 1 }}>{p.name}</span>
                <span style={{ fontSize: 9, color: '#555' }}>{p.channel}</span>
              </div>
            );
          })}
          {promos.length === 0 && <div style={{ fontSize: 11, color: '#555' }}>매주 월요일 자동 업데이트</div>}
        </div>

        {/* Channel status */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>판매 채널</div>
          {channels.map((ch, i) => {
            const s = d?.[ch] || {};
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < channels.length - 1 ? '1px solid #1F1F1F' : 'none' }}>
                <span style={{ fontSize: 11 }}>{s.status === 'connected' ? '🟢' : '🔴'}</span>
                <span style={{ fontSize: 11, color: '#CCC', flex: 1 }}>{labels[ch]}</span>
                <span style={{ fontSize: 10, color: s.status === 'connected' ? '#22C55E' : '#555' }}>{s.status === 'connected' ? '연결됨' : '미연결'}</span>
              </div>
            );
          })}
        </div>
      </>
    );
  },

  admin: () => {
    const [d, setD] = useState(null);
    useEffect(() => { fetch('/api/agents/management').then(r => r.json()).then(setD).catch(() => {}); }, []);
    const voucher = d?.exportVoucher;
    const govItems = d?.govAnnouncements?.items || [];
    const now = new Date();
    return (
      <>
        {/* Export voucher flow */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 12 }}>수출바우처 현황</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 14 }}>
            {(voucher?.steps || [{ name: '신청', status: 'done' }, { name: '선정', status: 'done' }, { name: '계획제출', status: 'done' }, { name: '진행중', status: 'active' }, { name: '정산', status: 'pending' }]).map((s, i, arr) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                  background: s.status === 'done' ? '#22C55E22' : s.status === 'active' ? '#5E6AD222' : '#1A1A1A',
                  color: s.status === 'done' ? '#22C55E' : s.status === 'active' ? '#5E6AD2' : '#555',
                  border: `1px solid ${s.status === 'done' ? '#22C55E44' : s.status === 'active' ? '#5E6AD244' : '#242424'}`,
                }}>
                  {s.status === 'done' ? '✅' : s.status === 'active' ? '🟢' : '⬜'} {s.name}
                </div>
                {i < arr.length - 1 && <span style={{ color: '#333', margin: '0 4px', fontSize: 10 }}>→</span>}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>사용 계획</div>
          {(voucher?.programs || [{ name: '해외마케팅', status: 'active', color: '#22C55E' }, { name: 'IP/인증 획득', status: 'active', color: '#22C55E' }]).map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: p.color }} />
              <span style={{ fontSize: 11, color: '#CCC' }}>{p.name}</span>
              <span style={{ fontSize: 10, color: p.color, marginLeft: 'auto' }}>진행중</span>
            </div>
          ))}
        </div>

        {/* Gov announcements */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 16, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>정부지원사업 공고</div>
          {govItems.length > 0 ? govItems.slice(0, 8).map((item, i) => {
            const deadline = item.deadline ? new Date(item.deadline) : null;
            const daysLeft = deadline ? Math.ceil((deadline - now) / 86400000) : null;
            const urgent = daysLeft !== null && daysLeft <= 7 && daysLeft >= 0;
            return (
              <div key={i} style={{ padding: '6px 0', borderBottom: i < Math.min(govItems.length, 8) - 1 ? '1px solid #1F1F1F' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {urgent && <span style={{ fontSize: 8, background: '#EF4444', color: '#FFF', padding: '1px 4px', borderRadius: 3, fontWeight: 600 }}>D-{daysLeft}</span>}
                  <span style={{ fontSize: 11, color: '#CCC', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                </div>
                <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>
                  {item.source}{item.deadline ? ` · 마감 ${item.deadline}` : ''}
                </div>
              </div>
            );
          }) : (
            <div style={{ fontSize: 11, color: '#555', padding: '12px 0', textAlign: 'center' }}>
              {d?.govAnnouncements?.status === 'no_data' ? '매주 월요일 자동 업데이트' : '공고 로딩 중...'}
            </div>
          )}
          <div style={{ fontSize: 9, color: '#444', marginTop: 8 }}>
            K-스타트업 · 코트라 · 중기부 공고 자동 수집 {d?.govAnnouncements?.updatedAt ? `· ${d.govAnnouncements.updatedAt.slice(0, 10)}` : ''}
          </div>
        </div>
      </>
    );
  },

  product: () => {
    const [d, setD] = useState(null);
    useEffect(() => { fetch('/api/agents/brand').then(r => r.json()).then(setD).catch(() => {}); }, []);
    const rankings = d?.rankings;
    const reviews = d?.reviews;
    const proposal = d?.suggestions;
    return (
      <>
        {/* Category Rankings */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>카테고리 랭킹</div>
          {[
            { channel: '올리브영', category: '앰플/미스트', items: [
              { rank: 1, name: '이니스프리 그린티 세럼', reviews: '12,450' },
              { rank: 2, name: '토리든 다이브인 세럼', reviews: '9,832' },
              { rank: 3, name: '밀리밀리 500달톤 미스트', reviews: '342', ours: true },
              { rank: 4, name: '라운드랩 자작나무 세럼', reviews: '7,621' },
              { rank: 5, name: '아누아 어성초 세럼', reviews: '8,190' },
            ]},
            { channel: '스마트스토어', category: '단백질 스킨케어', items: [
              { rank: 1, name: '밀리밀리 500달톤 앰플', reviews: '156', ours: true },
              { rank: 2, name: '서울시스터즈 프로틴 크림', reviews: '89' },
              { rank: 3, name: '밀리밀리 500달톤 미스트', reviews: '124', ours: true },
            ]},
          ].map((section, si) => (
            <div key={si} style={{ marginBottom: si < 1 ? 14 : 0 }}>
              <div style={{ fontSize: 10, color: '#5E6AD2', marginBottom: 6 }}>{section.channel} · {section.category}</div>
              {section.items.map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', marginBottom: 2, borderRadius: 4,
                  background: item.ours ? 'rgba(94,106,210,0.08)' : 'transparent',
                  border: item.ours ? '1px solid #5E6AD233' : '1px solid transparent',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.ours ? '#5E6AD2' : '#555', width: 18 }}>{item.rank}</span>
                  <span style={{ fontSize: 11, color: item.ours ? '#FFF' : '#CCC', flex: 1, fontWeight: item.ours ? 600 : 400 }}>{item.name}</span>
                  <span style={{ fontSize: 10, color: '#555' }}>{item.reviews}</span>
                </div>
              ))}
            </div>
          ))}
          <div style={{ fontSize: 9, color: '#444', marginTop: 8 }}>수동 업데이트 · 마지막: {rankings?.updatedAt || '대기 중'}</div>
        </div>

        {/* Product Reviews */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>상품별 리뷰</div>
          {[
            { name: '500달톤 프로틴 미스트 55ml', rating: 4.6, count: 342, attention: 3 },
            { name: '500달톤 프로틴 앰플 30ml', rating: 4.5, count: 156, attention: 1 },
          ].map((p, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: i < 1 ? '1px solid #1F1F1F' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#CCC' }}>{p.name}</span>
                {p.attention > 0 && <span style={{ fontSize: 8, background: '#EF4444', color: '#FFF', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>관리 {p.attention}건</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, color: '#F59E0B' }}>{'★'.repeat(Math.floor(p.rating))}{'☆'.repeat(5 - Math.floor(p.rating))}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#FFF' }}>{p.rating}</span>
                <span style={{ fontSize: 10, color: '#555' }}>({p.count}건)</span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 9, color: '#444', marginTop: 6 }}>별점 1-2점 / 환불·불만 키워드 → 관리 필요</div>
        </div>

        {/* Weekly Proposal */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 8 }}>주간 상품 제안</div>
          {proposal?.status === 'connected' ? (
            <div style={{ fontSize: 11, color: '#CCC', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {proposal.content || proposal.text || '제안 내용 로딩 중...'}
              <div style={{ fontSize: 9, color: '#444', marginTop: 6 }}>{proposal.updatedAt?.slice(0, 10)}</div>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#555' }}>매주 월요일 리뷰 분석 → AI 제안 자동 생성</div>
          )}
        </div>
      </>
    );
  },

  global: () => {
    const [d, setD] = useState(null);
    useEffect(() => { fetch('/api/agents/export').then(r => r.json()).then(setD).catch(() => {}); }, []);
    const rates = d?.exchangeRates || {};
    const pipeline = d?.buyerPipeline || {};
    const countries = d?.byCountry || [];
    const maxAmount = countries.length > 0 ? countries[0].amount : 1;
    return (
      <>
        {/* Total export + exchange */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="총 수출액" value={d?.exports?.totalAmount ? `${fmt(d.exports.totalAmount)}원` : d?.exports?.status === 'connected' ? `${d.exports.totalOrders}건` : '미연결'} delta="2026 누적" up icon={Globe} />
          <KpiCard label="수출공급가" value={d?.prices?.status === 'connected' ? `${d.prices.products}개` : '-'} icon={DollarSign} />
          <KpiCard label="USD" value={rates.USD ? `${rates.USD.toLocaleString()}원` : '-'} icon={DollarSign} />
          <KpiCard label="JPY" value={rates.JPY ? `${rates.JPY.toLocaleString()}원` : '-'} icon={DollarSign} />
        </div>

        {/* Country breakdown bar chart */}
        {countries.length > 0 && (
          <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>국가별 수출 현황</div>
            {countries.slice(0, 8).map((c, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: '#CCC' }}>{c.name}</span>
                  <span style={{ fontSize: 10, color: '#888' }}>{fmt(c.amount)}원 ({c.products}건)</span>
                </div>
                <div style={{ height: 4, background: '#1F1F1F', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(c.amount / maxAmount) * 100}%`, background: '#5E6AD2', borderRadius: 2 }} />
                </div>
              </div>
            ))}
            <div style={{ fontSize: 9, color: '#444', marginTop: 4 }}>2026년 누적 · 구글시트 연동</div>
          </div>
        )}

        {/* Buyer Pipeline */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>바이어 파이프라인</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {[
              { label: 'DB확보', value: pipeline.db },
              { label: '1차메일', value: pipeline.firstMail },
              { label: '답장', value: pipeline.replied },
              { label: '샘플', value: pipeline.sample },
              { label: '제안서', value: pipeline.proposal },
              { label: '계약', value: pipeline.contract },
            ].map((step, i, arr) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ textAlign: 'center', padding: '4px 6px', borderRadius: 4, background: '#1A1A1A', border: '1px solid #242424', minWidth: 44 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#FFF' }}>{step.value || 0}</div>
                  <div style={{ fontSize: 8, color: '#777' }}>{step.label}</div>
                </div>
                {i < arr.length - 1 && <span style={{ color: '#333', margin: '0 2px', fontSize: 10 }}>→</span>}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: '#444', marginTop: 6 }}>당월 누적</div>
        </div>

        {/* Daily report */}
        {d?.dailyReport && (
          <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 8 }}>일간 성과 보고</div>
            <div style={{ fontSize: 11, color: '#CCC', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {d.dailyReport.summary || d.dailyReport.text || '보고 내용 로딩 중...'}
            </div>
            <div style={{ fontSize: 9, color: '#444', marginTop: 4 }}>{d.dailyReport.updatedAt?.slice(0, 10)}</div>
          </div>
        )}

        {/* Channels */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>해외 채널</div>
          {Object.entries(d?.channels || {}).map(([ch, s], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < Object.keys(d?.channels || {}).length - 1 ? '1px solid #1F1F1F' : 'none' }}>
              <span style={{ fontSize: 11 }}>{s.status === 'connected' ? '🟢' : '🔴'}</span>
              <span style={{ fontSize: 11, color: '#CCC', flex: 1 }}>{ch}</span>
              <span style={{ fontSize: 10, color: s.status === 'connected' ? '#22C55E' : '#555' }}>{s.status === 'connected' ? '연결됨' : '미연결'}</span>
            </div>
          ))}
        </div>
      </>
    );
  },

  strategy: () => {
    const [d, setD] = useState(null);
    useEffect(() => { fetch('/api/agents/strategy').then(r => r.json()).then(setD).catch(() => {}); }, []);
    const s = d?.summary || {};
    const c = d?.connections || {};
    return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <KpiCard label="콘텐츠" value={s.content ? `${s.content.thisMonth || 0}건/월` : '-'} up icon={FileText} />
        <KpiCard label="커뮤니티" value={s.community ? `${(s.community.comments||0)+(s.community.dm||0)}건` : '-'} up icon={MessageCircle} />
        <KpiCard label="광고비" value={s.adSpend ? `${fmt(s.adSpend)}원` : '-'} icon={DollarSign} />
        <KpiCard label="수출 오더" value={s.exports ? `${s.exports}건` : '-'} icon={Globe} />
      </div>
      <div style={{ marginTop: 12, background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>진행 중 프로젝트</div>
        {[
          { name: 'Q2 매출 성장 전략', progress: 75, status: '진행 중' },
          { name: '물류비 절감 프로젝트', progress: 90, status: '마무리' },
          { name: '미국 시장 진출 기획', progress: 40, status: '초기' },
          { name: '브랜드 리포지셔닝', progress: 60, status: '진행 중' },
          { name: 'IR 자료 업데이트', progress: 20, status: '시작' },
        ].map((p, i) => (
          <div key={i} style={{ marginBottom: i < 4 ? 10 : 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#CCC' }}>{p.name}</span>
              <span style={{ fontSize: 10, color: '#777' }}>{p.progress}%</span>
            </div>
            <div style={{ height: 3, background: '#1F1F1F', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${p.progress}%`, background: p.progress >= 80 ? '#22C55E' : '#5E6AD2', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>경쟁사 분석 현황</div>
        {['롬앤', '클리오', '페리페라', '바닐라코', '마뗑킴'].map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < 4 ? '1px solid #1F1F1F' : 'none' }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: '#5E6AD2', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#CCC', flex: 1 }}>{c}</span>
            <span style={{ fontSize: 10, color: '#22C55E' }}>모니터링 중</span>
          </div>
        ))}
      </div>
    </>
    );
  },
};

// ─── Main ChatView ──────────────────────────────────────────

export default function ChatView() {
  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const endRef = useRef(null);
  const { activeAgent, conversations, isLoading, sendMessage } = useChatStore();
  const agent = getAgent(activeAgent);
  const messages = conversations[activeAgent] || [];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

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

  const quickActions = {
    chief: ['오늘 전체 브리핑해줘', '이번 주 주요 일정 정리', '긴급 이슈 있어?'],
    creator: ['인스타 릴스 기획해줘', '이번 주 콘텐츠 캘린더', 'SEO 블로그 글 써줘'],
    community: ['댓글 현황 보기', '오늘 DM 요약해줘', '댓글 분석 리포트', '악성댓글 현황'],
    cs: ['오늘 상담 현황', '불만 고객 리스트', 'FAQ 업데이트해줘'],
    marketer: ['이번 달 성과 분석', '트렌드 리포트', '광고 ROI 분석'],
    commerce: ['채널별 매출 현황', '재고 부족 알림', '프로모션 분석'],
    admin: ['이번 달 매출 현황', '정부지원사업 공고', '재고 현황 체크'],
    product: ['카테고리 랭킹 분석', '리뷰 분석 리포트', '상품 개선 제안', '경쟁사 비교'],
    global: ['수출 현황 보고', '환율 변동 리포트', '바이어 컨택 메일 작성'],
    strategy: ['비용절감 방안 분석', 'Q2 전략 제안', '사업계획서 작성'],
  };

  return (
    <>
      <div style={{ height: 48, minHeight: 48, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #1A1A1A', flexShrink: 0 }}>
        <Icon size={16} strokeWidth={1.5} color="#666" />
        <span style={{ fontSize: 15, fontWeight: 600, color: '#F5F5F5' }}>{agent.name}</span>
        <span style={{ fontSize: 13, color: '#555' }}>{agent.title}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* LEFT: Chat 55% */}
        <div style={{ width: '55%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #1A1A1A' }}>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {messages.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#141414', border: '1px solid #242424', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Icon size={20} strokeWidth={1.5} color="#5E6AD2" />
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#F5F5F5', marginBottom: 4 }}>{agent.name}</div>
                <div style={{ fontSize: 13, color: '#777', marginBottom: 24 }}>{agent.description}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 400 }}>
                  {(quickActions[activeAgent] || []).map((action, i) => (
                    <button key={i} onClick={() => setInput(action)}
                      style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #242424', background: 'transparent', color: '#888', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#CCC'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#242424'; e.currentTarget.style.color = '#888'; }}>
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ padding: 16 }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ marginBottom: 20 }}>
                    {msg.role === 'user' ? (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ background: '#5E6AD2', color: '#FFF', borderRadius: '14px 14px 4px 14px', padding: '10px 16px', maxWidth: '80%', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <div style={{ width: 20, height: 20, borderRadius: 5, background: '#141414', border: '1px solid #242424', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon size={10} strokeWidth={2} color="#5E6AD2" />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 500, color: '#666' }}>{agent.name}</span>
                        </div>
                        <div style={{ paddingLeft: 26, fontSize: 13, lineHeight: 1.75, color: '#DDD', whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 26 }}>
                    <Loader2 size={14} color="#555" style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>
          <div style={{ padding: '10px 16px 16px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#141414', border: `1px solid ${inputFocused ? '#333' : '#242424'}`, borderRadius: 10, padding: '10px 14px', transition: 'border-color 0.15s' }}>
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()} onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)} placeholder={`${agent.name}에게 메시지...`} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#E8E8E8', fontSize: 13, fontFamily: 'inherit' }} />
              <button onClick={send} disabled={!input.trim() || isLoading} style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: input.trim() && !isLoading ? '#5E6AD2' : '#222', color: input.trim() && !isLoading ? '#FFF' : '#555', cursor: input.trim() && !isLoading ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', flexShrink: 0 }}>
                <ArrowUp size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: KPI Dashboard 45% */}
        <div style={{ width: '45%', overflowY: 'auto', padding: 16, background: '#0A0A0A' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Icon size={14} strokeWidth={1.5} color="#5E6AD2" />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{agent.name} Dashboard</span>
          </div>
          {AgentDashboard && <AgentDashboard />}
          <ApiStatusPanel agent={agent} />
        </div>
      </div>
    </>
  );
}

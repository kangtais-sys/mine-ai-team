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

// ─── Agent KPI Dashboards ───────────────────────────────────

const AGENT_DASHBOARDS = {
  chief: () => {
    const [data, setData] = useState(null);
    useEffect(() => { fetch('/api/agents/strategy').then(r => r.json()).then(setData).catch(() => {}); }, []);
    const s = data?.summary || {};
    const c = data?.connections || {};
    const connCount = Object.values(c).filter(v => v === 'connected').length;
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="활성 에이전트" value={`${connCount}/${Object.keys(c).length || 6}`} delta="실시간" up icon={Users} />
          <KpiCard label="콘텐츠 발행" value={s.content ? `${s.content.thisMonth || 0}건/월` : '-'} up icon={FileText} />
          <KpiCard label="댓글+DM" value={s.community ? `${(s.community.comments || 0) + (s.community.dm || 0)}건` : '-'} up icon={MessageCircle} />
          <KpiCard label="광고비" value={s.adSpend ? `${fmt(s.adSpend)}원` : '-'} icon={DollarSign} />
        </div>
        <div style={{ marginTop: 12, background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>팀 연결 현황</div>
          {Object.entries(c).map(([name, status], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < Object.keys(c).length - 1 ? '1px solid #1F1F1F' : 'none' }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: status === 'connected' ? '#22C55E' : '#555', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#CCC', flex: 1 }}>{name}</span>
              <span style={{ fontSize: 10, color: status === 'connected' ? '#22C55E' : '#555' }}>{status === 'connected' ? '연결됨' : '미연결'}</span>
            </div>
          ))}
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

        {/* Pipeline */}
        <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 8 }}>발행 파이프라인</div>
          <div style={{ fontSize: 11, color: '#CCC', marginBottom: 4 }}>mirra.my를 통한 콘텐츠 발행</div>
          <div style={{ fontSize: 10, color: '#555' }}>콘텐츠 제작 → mirra.my 업로드 → 멀티채널 자동 발행</div>
        </div>

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
    if (d?.status === 'pending') return (
      <div style={{ background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#F59E0B', marginBottom: 8 }}>해피톡 API 연동 준비 중</div>
        <div style={{ fontSize: 11, color: '#555' }}>HAPPYTALK_API_KEY 환경변수 설정 후 활성화됩니다</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center' }}>
          <span style={{ fontSize: 10, color: d.channels?.millimilli === 'configured' ? '#22C55E' : '#555' }}>밀리밀리: {d.channels?.millimilli || 'pending'}</span>
          <span style={{ fontSize: 10, color: d.channels?.lalaLounge === 'configured' ? '#22C55E' : '#555' }}>랄라라운지: {d.channels?.lalaLounge || 'pending'}</span>
        </div>
      </div>
    );
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <KpiCard label="상태" value={d?.status || '-'} icon={Headphones} />
        <KpiCard label="채널" value={`${d?.channels?.length || 0}개`} icon={MessageCircle} />
      </div>
    );
  },

  marketer: () => {
    const [d, setD] = useState(null);
    useEffect(() => { fetch('/api/agents/marketer').then(r => r.json()).then(setD).catch(() => {}); }, []);
    const m = d?.meta || {};
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="Meta 광고비" value={m.totalSpend ? `${fmt(m.totalSpend)}원` : m.status === 'disconnected' ? '미연결' : '-'} delta={m.status === 'connected' ? `${m.accounts?.length || 0}개 계정` : ''} up icon={DollarSign} />
          <KpiCard label="노출수" value={m.impressions ? fmt(m.impressions) : '-'} icon={Eye} />
          <KpiCard label="클릭수" value={m.clicks ? fmt(m.clicks) : '-'} icon={Target} />
          <KpiCard label="CTR" value={m.ctr ? `${m.ctr}%` : '-'} icon={Percent} />
        </div>
        <div style={{ marginTop: 12, background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>광고 채널 상태</div>
          {['meta', 'naver', 'google', 'tiktok', 'ga'].map((ch, i) => {
            const s = d?.[ch] || {};
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < 4 ? '1px solid #1F1F1F' : 'none' }}>
                <span style={{ fontSize: 11 }}>{s.status === 'connected' ? '🟢' : '🔴'}</span>
                <span style={{ fontSize: 11, color: '#CCC', flex: 1 }}>{ch === 'meta' ? 'Meta Ads' : ch === 'naver' ? '네이버 광고' : ch === 'google' ? '구글 광고' : ch === 'tiktok' ? '틱톡 광고' : 'GA4'}</span>
                <span style={{ fontSize: 10, color: s.status === 'connected' ? '#22C55E' : '#555' }}>{s.status === 'connected' ? '연결됨' : s.message || '미연결'}</span>
              </div>
            );
          })}
        </div>
      </>
    );
  },

  commerce: () => {
    const [d, setD] = useState(null);
    useEffect(() => { fetch('/api/agents/commerce').then(r => r.json()).then(setD).catch(() => {}); }, []);
    const channels = ['oliveyoung', 'smartstore', 'cafe24', 'amazon', 'shopee', 'qoo10', 'tiktokShop'];
    const labels = { oliveyoung: '올리브영', smartstore: '스마트스토어', cafe24: '카페24', amazon: '아마존', shopee: '쇼피', qoo10: '큐텐', tiktokShop: '틱톡샵' };
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="올리브영" value={d?.oliveyoung?.status === 'connected' ? `${d.oliveyoung.rowCount}행` : '미연결'} delta={d?.oliveyoung?.status === 'connected' ? '구글시트 연동' : ''} up icon={ShoppingCart} />
        </div>
        <div style={{ marginTop: 12, background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>판매 채널 연결 현황</div>
          {channels.map((ch, i) => {
            const s = d?.[ch] || {};
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < channels.length - 1 ? '1px solid #1F1F1F' : 'none' }}>
                <span style={{ fontSize: 11 }}>{s.status === 'connected' ? '🟢' : '🔴'}</span>
                <span style={{ fontSize: 11, color: '#CCC', flex: 1 }}>{labels[ch]}</span>
                <span style={{ fontSize: 10, color: s.status === 'connected' ? '#22C55E' : '#555' }}>{s.status === 'connected' ? '연결됨' : s.message || '미연결'}</span>
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
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="직원 (재직)" value={d?.employees?.status === 'connected' ? `${d.employees.active}명` : '미연결'} delta={d?.employees?.expiringSoon?.length ? `만료임박 ${d.employees.expiringSoon.length}명` : ''} up icon={Users} />
          <KpiCard label="이달 결제" value={d?.payments?.status === 'connected' ? `${d.payments.thisMonth}건` : '미연결'} delta={d?.payments?.pending ? `미지급 ${d.payments.pending}건` : ''} icon={DollarSign} />
          <KpiCard label="환불" value={d?.refunds?.status === 'connected' ? `${d.refunds.thisMonth?.count || 0}건` : '미연결'} icon={DollarSign} />
          <KpiCard label="프리랜서" value={d?.freelancers?.status === 'connected' ? `${d.freelancers.thisMonth?.count || 0}건` : '미연결'} icon={FileText} />
        </div>
        {d?.employees?.expiringSoon?.length > 0 && (
          <div style={{ marginTop: 12, background: '#141414', border: '1px solid #F59E0B33', borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B', marginBottom: 8 }}>계약만료 임박</div>
            {d.employees.expiringSoon.map((e, i) => (
              <div key={i} style={{ fontSize: 11, color: '#CCC', padding: '3px 0' }}>{e.name} — {e.endDate}</div>
            ))}
          </div>
        )}
      </>
    );
  },

  product: () => {
    const [d, setD] = useState(null);
    useEffect(() => { fetch('/api/agents/brand').then(r => r.json()).then(setD).catch(() => {}); }, []);
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="제품 데이터" value={d?.products?.status === 'connected' ? '연동됨' : '대기 중'} icon={Package} />
          <KpiCard label="리뷰" value={d?.reviews?.status === 'connected' ? d.reviews.source : '미연결'} icon={Star} />
          <KpiCard label="경쟁사" value={d?.competitors?.status === 'connected' ? '수집됨' : '대기 중'} icon={Eye} />
        </div>
        <div style={{ marginTop: 12, background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>경쟁사 모니터링</div>
          {['롬앤', '클리오', '페리페라', '바닐라코', '마뗑킴'].map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < 4 ? '1px solid #1F1F1F' : 'none' }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: '#5E6AD2', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#CCC', flex: 1 }}>{c}</span>
            </div>
          ))}
        </div>
      </>
    );
  },

  global: () => {
    const [d, setD] = useState(null);
    useEffect(() => { fetch('/api/agents/export').then(r => r.json()).then(setD).catch(() => {}); }, []);
    const rates = d?.exchangeRates || {};
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="수출 오더" value={d?.exports?.status === 'connected' ? `${d.exports.totalOrders}건` : '미연결'} delta="구글시트 연동" up icon={Globe} />
          <KpiCard label="수출공급가" value={d?.prices?.status === 'connected' ? `${d.prices.products}개` : '미연결'} icon={DollarSign} />
          <KpiCard label="USD" value={rates.USD ? `${rates.USD.toLocaleString()}원` : '-'} icon={DollarSign} />
          <KpiCard label="JPY" value={rates.JPY ? `${rates.JPY.toLocaleString()}원` : '-'} icon={DollarSign} />
        </div>
        <div style={{ marginTop: 12, background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>해외 채널</div>
          {Object.entries(d?.channels || {}).map(([ch, s], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < Object.keys(d?.channels || {}).length - 1 ? '1px solid #1F1F1F' : 'none' }}>
              <span style={{ fontSize: 11 }}>{s.status === 'connected' ? '🟢' : '🔴'}</span>
              <span style={{ fontSize: 11, color: '#CCC', flex: 1 }}>{ch}</span>
              <span style={{ fontSize: 10, color: s.status === 'connected' ? '#22C55E' : '#555' }}>{s.message || (s.status === 'connected' ? '연결됨' : '미연결')}</span>
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
    product: ['신제품 트렌드 분석', '경쟁사 신제품 모니터링', '상품 기획서 작성'],
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

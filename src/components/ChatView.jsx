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

// ─── Agent KPI Dashboards ───────────────────────────────────

const AGENT_DASHBOARDS = {
  chief: () => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <KpiCard label="오늘 처리 업무" value="47건" delta="+12건" up icon={FileText} />
        <KpiCard label="활성 에이전트" value="10/10" delta="전원 가동" up icon={Users} />
        <KpiCard label="긴급 이슈" value="2건" delta="+1건" up={false} icon={XCircle} />
        <KpiCard label="주간 완료율" value="94%" delta="+3%" up icon={CheckCircle2} />
      </div>
      <div style={{ marginTop: 12, background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', marginBottom: 10 }}>팀 현황</div>
        {[
          { name: 'AI 크리에이터', status: '릴스 3개 제작 중', color: '#5E6AD2' },
          { name: 'AI 커뮤니티', status: 'DM 24건 응대 완료', color: '#22C55E' },
          { name: 'AI CS매니저', status: '교환 3건 처리 중', color: '#F59E0B' },
          { name: 'AI 마케터', status: '주간 리포트 생성', color: '#22C55E' },
          { name: 'AI 커머스MD', status: '가격 최적화 분석', color: '#5E6AD2' },
          { name: 'AI 경영지원', status: '3월 정산 완료', color: '#22C55E' },
          { name: 'AI 브랜드/상품', status: '신제품 기획 중', color: '#5E6AD2' },
          { name: 'AI 수출', status: '일본 바이어 5건', color: '#5E6AD2' },
          { name: 'AI 전략기획', status: 'Q2 전략안 작성', color: '#F59E0B' },
        ].map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < 8 ? '1px solid #1F1F1F' : 'none' }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: t.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#CCC', width: 95 }}>{t.name}</span>
            <span style={{ fontSize: 11, color: '#666' }}>{t.status}</span>
          </div>
        ))}
      </div>
    </>
  ),

  creator: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <KpiCard label="이번 달 콘텐츠" value="156건" delta="+8건" up icon={FileText} />
      <KpiCard label="총 조회수" value={fmt(4820000)} delta="+18.2%" up icon={Eye} />
      <KpiCard label="인게이지먼트" value="4.8%" delta="+0.3%" up icon={TrendingUp} />
      <KpiCard label="수익" value={fmt(3200000) + '원'} delta="+22%" up icon={DollarSign} />
    </div>
  ),

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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="오늘 댓글" value="342건" delta="+28%" up icon={MessageCircle} />
          <KpiCard label="오늘 DM" value="89건" delta="+15건" up icon={MessageCircle} />
          <KpiCard label="응대 완료" value="98.2%" delta="+1.2%" up icon={CheckCircle2} />
          <KpiCard label="팔로워 증가" value="+1,840" delta="+22%" up icon={Users} />
        </div>

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

  cs: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <KpiCard label="오늘 상담" value="67건" delta="+8건" up icon={Headphones} />
      <KpiCard label="평균 응답시간" value="2.3분" delta="-0.5분" up icon={TrendingUp} />
      <KpiCard label="만족도" value="4.8/5" delta="+0.2" up icon={Star} />
      <KpiCard label="불만 접수" value="3건" delta="-2건" up icon={XCircle} />
      <KpiCard label="교환/환불" value="5건" delta="-1건" up icon={ShoppingCart} />
      <KpiCard label="FAQ 히트" value="234건" delta="+45건" up icon={FileText} />
    </div>
  ),

  marketer: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <KpiCard label="월 매출" value={fmt(48500000) + '원'} delta="+12.8%" up icon={DollarSign} />
      <KpiCard label="광고 ROAS" value="4.2x" delta="+0.8x" up icon={TrendingUp} />
      <KpiCard label="CAC" value={fmt(8500) + '원'} delta="-12%" up icon={Users} />
      <KpiCard label="전환율" value="3.8%" delta="+0.5%" up icon={ShoppingCart} />
      <KpiCard label="메타 광고비" value={fmt(5200000) + '원'} delta="+8%" up={false} icon={DollarSign} />
      <KpiCard label="네이버 SA" value={fmt(3100000) + '원'} delta="+15%" up={false} icon={BarChart3} />
    </div>
  ),

  commerce: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <KpiCard label="총 주문" value="1,847건" delta="+14%" up icon={ShoppingCart} />
      <KpiCard label="총 매출" value={fmt(48500000) + '원'} delta="+12.8%" up icon={DollarSign} />
      <KpiCard label="올리브영" value={fmt(21000000) + '원'} delta="+8%" up icon={DollarSign} />
      <KpiCard label="스마트스토어" value={fmt(16000000) + '원'} delta="+15%" up icon={DollarSign} />
      <KpiCard label="카페24/자사몰" value={fmt(7500000) + '원'} delta="+22%" up icon={DollarSign} />
      <KpiCard label="해외(아마존/쇼피)" value={fmt(4500000) + '원'} delta="+32%" up icon={Globe} />
      <KpiCard label="평균 객단가" value="32,400원" delta="+8%" up icon={TrendingUp} />
      <KpiCard label="재구매율" value="34.2%" delta="+2.1%" up icon={Users} />
    </div>
  ),

  admin: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <KpiCard label="월 매출" value={fmt(48500000) + '원'} delta="+12.8%" up icon={DollarSign} />
      <KpiCard label="월 비용" value={fmt(31200000) + '원'} delta="+5%" up={false} icon={DollarSign} />
      <KpiCard label="영업이익" value={fmt(17300000) + '원'} delta="+28%" up icon={TrendingUp} />
      <KpiCard label="재고 SKU" value="48종" delta="-2종" up icon={Package} />
      <KpiCard label="정부지원 신청" value="3건" delta="마감 D-7" up icon={FileText} />
      <KpiCard label="미수금" value={fmt(2400000) + '원'} delta="-15%" up icon={DollarSign} />
    </div>
  ),

  product: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <KpiCard label="신제품 기획" value="3건" delta="+1건" up icon={Package} />
      <KpiCard label="평균 리뷰 평점" value="4.6/5" delta="+0.1" up icon={Star} />
      <KpiCard label="리뷰 분석" value="2,847건" delta="+342건" up icon={MessageCircle} />
      <KpiCard label="경쟁사 모니터링" value="12 브랜드" delta="+2" up icon={Eye} />
      <KpiCard label="평균 원가율" value="32%" delta="-2%" up icon={TrendingUp} />
      <KpiCard label="예상 마진율" value="58%" delta="+3%" up icon={DollarSign} />
    </div>
  ),

  global: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <KpiCard label="해외 매출" value={fmt(4500000) + '원'} delta="+24%" up icon={Globe} />
      <KpiCard label="일본" value={fmt(2100000) + '원'} delta="+18%" up icon={DollarSign} />
      <KpiCard label="미국" value={fmt(1400000) + '원'} delta="+32%" up icon={DollarSign} />
      <KpiCard label="동남아" value={fmt(1000000) + '원'} delta="+45%" up icon={DollarSign} />
      <KpiCard label="바이어 컨택" value="23건" delta="+8건" up icon={Users} />
      <KpiCard label="환율 USD" value="1,342원" delta="-0.8%" up icon={TrendingDown} />
    </div>
  ),

  strategy: () => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <KpiCard label="매출 목표 달성률" value="78%" delta="+5%" up icon={Target} />
        <KpiCard label="비용절감 실적" value={fmt(4200000) + '원'} delta="+18%" up icon={TrendingUp} />
        <KpiCard label="진행 전략 프로젝트" value="5건" delta="+2건" up icon={FileText} />
        <KpiCard label="작성 문서/제안서" value="12건" delta="+3건" up icon={FileText} />
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
  ),
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

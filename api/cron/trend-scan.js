// GET /api/cron/trend-scan — 훅 라이브러리 적재. docs/content-team-design.md §4.
// 인증: Authorization: Bearer ${CRON_SECRET}
// 옵션: ?dry=1  ?keywords=a,b  ?skipInternal=1  ?skipObserve=1  ?force=1(요일 게이트 무시)
//
// ⚠️ 2026-09-22 재설계 — **토큰 효율**. MINE 판단:
//   터지는 릴스·소재 유형은 8~12개로 유한하다. 영상을 100개 봐도 결론은 같은 유형으로 수렴한다.
//   매일 관찰하면 같은 답을 매일 다시 사는 꼴 — 브라우저 세션이 전체에서 제일 비싼 항목이다.
//   → 유형은 포맷 카탈로그(/api/content/formats)에 **한 번** 확정하고 참조한다.
//   → 관찰의 목적을 "트렌드 수집" → **"카탈로그에 없는 새 유형 탐지"** 로 바꾸고 주 1회 3건으로 축소.
//   → 유튜브 스캔 제거. 애초에 코드가 볼 수 있는 유일한 소스라 썼던 것뿐.
//
// 여기가 하는 일:
//   ① 내부 위너 → 훅 카드 (성과 근거가 붙는 유일한 소스). **아직 카드 없는 소재만.**
//   ② (월요일만) 브라우저 관찰 작업 3건 큐잉
//
// ⛔ 원문 복제 금지. LLM 에 "패턴만 뽑고 우리 제품용 오리지널 훅을 새로 써라" 를 강제한다.

import { saveHooks, listHooks, LEVERS } from '../_hooks.js';
import { AXES } from '../_assetCode.js';

export const config = { maxDuration: 300 };

// 키워드 풀 — content-engine-system.md 의 로테이션 풀. 매 실행 day-of-year 로 회전.
const KEYWORDS = [
  { kr: '콜라겐 미스트', us: 'collagen mist skincare' },
  { kr: '글래스스킨', us: 'glass skin routine' },
  { kr: '팔자주름', us: 'smile lines skincare' },
  { kr: '눈가주름', us: 'under eye wrinkles' },
  { kr: '속건조', us: 'dehydrated skin fix' },
  { kr: '물광 메이크업', us: 'dewy skin hack' },
  { kr: '코리안 스킨케어', us: 'korean skincare routine' },
  { kr: '모공 탄력', us: 'pore tightening' },
];

const ANGLES = Object.keys(AXES.angle).join(' | ');
const HOOKS = Object.keys(AXES.hook).join(' | ');
const LEVER_KEYS = Object.keys(LEVERS).join(' | ');

const CARD_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['cards'],
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['i', 'sourceHook', 'adaptedKr', 'adaptedUs', 'angle', 'hookType', 'lever', 'proof', 'why'],
        properties: {
          i: { type: 'integer' },
          sourceHook: { type: 'string' },
          adaptedKr: { type: 'string' },
          adaptedUs: { type: 'string' },
          angle: { type: 'string', enum: Object.keys(AXES.angle) },
          hookType: { type: 'string', enum: Object.keys(AXES.hook) },
          lever: { type: 'string', enum: Object.keys(LEVERS) },
          proof: { type: 'string' },
          why: { type: 'string' },
        },
      },
    },
  },
};

// 이모지 서로게이트 쌍이 slice 로 깨지면 요청 본문이 깨진 JSON 이 된다(backfill 에서 겪음).
const cut = (s, n) => String(s || '').replace(/\s+/g, ' ').slice(0, n)
  .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
  .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');

async function llmCards(items, context) {
  const prompt = `너는 K뷰티 브랜드 밀리밀리(단백질 미스트 · 앰플)의 콘텐츠 기획자다.
아래는 ${context} 에서 관찰한 잘 나가는 콘텐츠다. 각각에서 **크래프트(훅 구조·레버)만** 뽑아
우리 제품용 **오리지널 훅**을 새로 써라.

⛔ 절대 금지: 원문 문장을 그대로 베끼거나 살짝 바꿔 쓰기. 대사·브랜드명·고유표현 차용 금지.
✅ 해야 할 것: "왜 이게 멈춰세우는가"를 파악해 같은 레버로 **완전히 다른 문장**을 쓴다.

앵글: ${ANGLES}
훅타입(첫 3초가 무엇으로 시작하나): ${HOOKS}
레버(왜 먹히나): ${LEVER_KEYS}

규칙:
- adaptedKr 은 한국어, adaptedUs 는 영어. 각각 그 시장 문법으로(KR=자사몰·올리브영 결 / US=아마존·임상수치 결).
- proof 는 그 훅에 붙일 대세감 장치 한 줄(예: "올리브영 미스트 1위", "4.2★ 리뷰 218개").
- why 는 이 훅이 멈춰세우는 이유 한 줄.
- 밀리밀리가 입증한 범위만: 24h 보습 · 결 정돈 · 팔자/눈가 주름 개선(4주) · 탄력. 과장 금지.

관찰 목록:
${items.map((it, i) => `[${i}] ${cut(it.title, 160)}
    채널/광고주: ${cut(it.channel, 60)} · 지표: ${cut(it.stat, 80)}`).join('\n')}`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.TREND_MODEL || 'claude-opus-5',
      max_tokens: 12000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: CARD_SCHEMA } },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`${d.error.type}: ${d.error.message}`);
  if (d.stop_reason === 'refusal') throw new Error('모델이 요청을 거부함');
  const text = (d.content || []).filter(b => b?.type === 'text').map(b => b.text).join('\n');
  if (!text.trim()) throw new Error(`빈 응답 (stop=${d.stop_reason})`);
  return JSON.parse(text).cards || [];
}

// ── ① 유튜브 숏츠 ──
async function scanYoutube(keywords, days) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { items: [], error: 'YOUTUBE_API_KEY 없음' };
  const after = new Date(Date.now() - days * 86400000).toISOString();
  const out = [];
  for (const kw of keywords) {
    for (const [market, q] of [['kr', kw.kr], ['us', kw.us]]) {
      try {
        const s = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoDuration=short&order=viewCount&publishedAfter=${after}&maxResults=8&key=${key}`).then(r => r.json());
        const ids = (s.items || []).map(i => i.id?.videoId).filter(Boolean);
        if (!ids.length) continue;
        const v = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(',')}&key=${key}`).then(r => r.json());
        for (const it of (v.items || [])) {
          const st = it.statistics || {};
          const views = Number(st.viewCount) || 0;
          if (views < 20000) continue; // 저조회는 트렌드 근거가 못 됨
          const eng = views > 0 ? ((Number(st.likeCount) || 0) + (Number(st.commentCount) || 0)) / views * 100 : 0;
          out.push({
            source: 'youtube', market, keyword: q,
            title: it.snippet?.title || '',
            channel: it.snippet?.channelTitle || '',
            stat: `조회 ${views.toLocaleString()} · 참여율 ${eng.toFixed(2)}%`,
            sourceUrl: `https://www.youtube.com/watch?v=${it.id}`,
            sourceMeta: { views, likes: Number(st.likeCount) || 0, comments: Number(st.commentCount) || 0, engagementRate: Number(eng.toFixed(2)) },
            refId: it.id,
          });
        }
      } catch { /* 키워드 하나 실패가 전체를 막지 않게 */ }
    }
  }
  // 같은 영상이 여러 키워드·시장 검색에 동시에 걸린다 → LLM 에 넘기기 전에 합친다.
  // (안 합치면 같은 영상으로 카드를 두 번 만들고 저장 단계에서 조용히 하나로 뭉개진다.)
  const uniq = new Map();
  for (const it of out) if (!uniq.has(it.refId)) uniq.set(it.refId, it);
  const deduped = [...uniq.values()].sort((a, b) => (b.sourceMeta?.views || 0) - (a.sourceMeta?.views || 0));
  return { items: deduped.slice(0, 20), observedRaw: out.length, deduped: out.length - deduped.length };
}

// ── ② 내부 위너 ──
async function scanInternal(req) {
  const { default: perf } = await import('../content/performance.js');
  const inner = { status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  await perf({ method: 'GET', query: { market: 'all' } }, inner);
  const ads = (inner.body?.ads || []).filter(a => ['win', 'keep'].includes(a.grade) && a.content?.isVideo);
  return ads.slice(0, 12).map(a => ({
    source: 'internal', market: a.market,
    title: a.ad_name,
    channel: a.account,
    stat: `훅률 ${a.content.hookRate}% · 유지율 ${a.content.holdRate}% · 본→클릭 ${a.content.clickFromView}%`,
    sourceUrl: null,
    sourceMeta: { campaign: a.campaign, grade: a.grade },
    perf: { hookRate: a.content.hookRate, holdRate: a.content.holdRate, clickFromView: a.content.clickFromView },
    product: a.code?.product || null,
    refId: a.ad_id,
  }));
}

// 같은 배포의 다른 엔드포인트를 부를 때의 베이스 URL.
const baseUrl = (req) =>
  process.env.APP_BASE_URL
  || (req.headers['x-forwarded-host'] ? `https://${req.headers['x-forwarded-host']}` : null)
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://mine-ai-team.vercel.app');

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ skipped: true, reason: 'ANTHROPIC_API_KEY 없음' });

  const q = req.query || {};
  const dry = q.dry === '1';
  const days = Number(q.days) || 90;
  // 키워드 로테이션 — 매 실행 다른 조합(연중 일자 기준). 직전과 겹치지 않게.
  const doy = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
  const picked = q.keywords
    ? String(q.keywords).split(',').map(k => ({ kr: k.trim(), us: k.trim() }))
    : [KEYWORDS[doy % KEYWORDS.length], KEYWORDS[(doy + 3) % KEYWORDS.length]];

  const report = { dry, keywords: picked.map(k => k.kr), sources: {} };
  const cards = [];

  // ① 내부
  if (q.skipInternal !== '1') {
    try {
      let items = await scanInternal(req);
      // 이미 카드가 있는 소재는 LLM 에 다시 보내지 않는다.
      // (저장 단계에서 어차피 중복으로 걸러지지만, 그 전에 LLM 호출 비용은 이미 나간다.)
      const existing = new Set((await listHooks()).map(c => c.id));
      const before = items.length;
      items = items.filter(it => !existing.has(`internal:${it.refId}`));
      report.sources.internal = { candidates: before, fresh: items.length, alreadyCarded: before - items.length };
      if (items.length) {
        const got = await llmCards(items, '우리 계정에서 성과가 좋았던 소재');
        for (const c of got) {
          const it = items[c.i]; if (!it) continue;
          cards.push({ ...it, sourceHook: c.sourceHook, adapted: { kr: c.adaptedKr, us: c.adaptedUs },
            angle: c.angle, hookType: c.hookType, lever: c.lever, proof: c.proof, why: c.why });
        }
        report.sources.internal.carded = got.length;
      }
    } catch (e) { report.sources.internal = { error: e.message }; }
  }

  // ② 브라우저 관찰 — **주 1회, 소량.**
  //    2026-09-22 MINE 판단으로 매일 8건 → 주 1회 3건. 근거:
  //    터지는 유형은 8~12개로 유한하고 이미 포맷 카탈로그에 확정돼 있다.
  //    매일 관찰하면 같은 유형을 매번 다시 발견하며 돈을 쓴다(브라우저 세션이 제일 비싼 항목).
  //    → 관찰의 목적을 "트렌드 수집"에서 **"카탈로그에 없는 새 유형 탐지"** 로 바꾼다.
  //    요일 게이트는 ?force=1 로 무시 가능.
  const isObserveDay = new Date().getUTCDay() === 1; // 월요일(UTC)
  if (q.skipObserve !== '1' && (isObserveDay || q.force === '1')) {
    try {
      const kw = picked[0];
      // 플랫폼·시장을 매주 번갈아 — 4갈래를 한 번에 다 돌지 않는다.
      const rota = [
        ['tiktok', 'us', kw.us], ['instagram', 'us', kw.us],
        ['tiktok', 'kr', kw.kr], ['instagram', 'kr', kw.kr],
      ];
      const week = Math.floor(doy / 7);
      const jobs = [rota[week % 4], rota[(week + 1) % 4], rota[(week + 2) % 4]]
        .map(([platform, market, query]) => ({
          type: 'trend.observe', role: 'browser', priority: 'normal',
          note: `${platform} · ${market.toUpperCase()} · ${query}`,
          payload: {
            platform, market, query,
            minViews: platform === 'tiktok' ? 100000 : 50000,
            want: 2,
            // 워커에게 목적을 명시 — 전수 수집이 아니라 새 유형 탐지다.
            goal: '포맷 카탈로그(/api/content/formats)에 없는 새로운 유형이 있는지만 본다. 기존 유형에 해당하면 formatId 를 적고 짧게 끝낸다.',
          },
        }));
      if (!dry) {
        const r = await fetch(`${baseUrl(req)}/api/agents/jobs?action=create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
          body: JSON.stringify({ jobs }),
        }).then(x => x.json());
        report.sources.observe = { queued: r.created?.length || 0, error: r.error || null };
      } else {
        report.sources.observe = { wouldQueue: jobs.length, sample: jobs.slice(0, 2).map(j => j.note) };
      }
    } catch (e) { report.sources.observe = { error: e.message }; }
  }

  // ③ 유튜브 — 제거됨(2026-09-22).
  //    애초에 '코드가 볼 수 있는 유일한 소스'라서 썼던 것이고, 우리 트렌드 소스가 아니다.
  //    브라우저 에이전트가 틱톡·인스타를 직접 보는 지금은 유지할 이유가 없다.
  //    scanYoutube() 는 남겨두되 호출하지 않는다 — 필요해지면 되살릴 것.

  if (!dry && cards.length) report.saved = await saveHooks(cards);
  report.cards = cards.length;
  report.sample = cards.slice(0, 4).map(c => ({
    source: c.source, market: c.market, angle: c.angle, hookType: c.hookType, lever: c.lever,
    adapted: c.adapted, why: c.why,
  }));
  return res.status(200).json(report);
}

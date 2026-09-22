// POST|GET /api/content/backfill — 레거시 소재를 6축으로 역분류해 캐시에 적재.
// 인증: Authorization: Bearer ${CRON_SECRET}
// 옵션: ?force=1 (캐시 무시 재분류)  ?limit=  ?dry=1 (저장 안 함)
//
// 왜 필요한가: 기존 소재 643개는 `REVIVE_A_1` `[AUTO] GLOW3_DESK_BOTTLE` 처럼 축 정보가 이름에 없다.
//   이름 정규식(_assetCode.parseAssetCode)만으로는 훅 타입 같은 축이 대부분 비어 제품×앵글 매트릭스가 안 채워진다.
//   → **소재 문구(본문·제목·CTA)까지 읽혀** LLM 이 분류. 새 콘텐츠를 만들지 않고도 위너 매트릭스가 나온다.
//
// 저장: Redis 해시 `content:classify:v1` (field = ad_id). TTL 없음 — 광고 이름·문구는 불변이라 한 번 분류하면 끝.

import { Redis } from '@upstash/redis';
import { parseAssetCode, AXES } from '../_assetCode.js';

export const config = { maxDuration: 300 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const CACHE_KEY = 'content:classify:v1';
const GRAPH = 'https://graph.facebook.com/v19.0';
const CHUNK = 20; // LLM 1회당 소재 수 — 너무 크면 JSON 이 잘린다

// 광고 문구 배치 조회. 이름만으로는 'GLOW3_DESK_BOTTLE' 이 무슨 상황극인지 알 수 없다.
async function fetchCreativeText(adIds, token) {
  const out = {};
  for (let i = 0; i < adIds.length; i += 50) {
    const chunk = adIds.slice(i, i + 50);
    const fields = 'name,creative{title,body,object_story_spec{link_data{message,name,description},video_data{message,title}}}';
    try {
      const r = await fetch(`${GRAPH}/?ids=${chunk.join(',')}&fields=${fields}&access_token=${token}`);
      const d = await r.json();
      if (d.error) continue;
      for (const [id, ad] of Object.entries(d || {})) {
        const c = ad?.creative || {};
        const oss = c.object_story_spec || {};
        const ld = oss.link_data || {}, vd = oss.video_data || {};
        out[id] = {
          title: c.title || ld.name || vd.title || '',
          body: c.body || ld.message || vd.message || '',
          desc: ld.description || '',
        };
      }
    } catch { /* 문구 없으면 이름만으로 분류 */ }
  }
  return out;
}

const ax = (k) => Object.entries(AXES[k]).map(([c, l]) => `${c}(${l})`).join(' · ');

function buildPrompt(items) {
  return `너는 K뷰티 브랜드 밀리밀리의 광고 소재를 분류한다. 각 소재를 아래 축으로 분류해라.

제품: ${ax('product')}
앵글(설득 축): ${ax('angle')}
훅타입(첫 3초가 무엇으로 시작하나): ${ax('hook')}

판단 근거는 소재 이름 + 광고 문구다. 문구의 첫 문장이 훅이므로 훅타입 판단에 가장 중요하다.
예) "Mid-flight, the flight attendant asked what I was spraying." → 앵글 POV, 훅타입 SCENE
   "Smile lines softened 21.10% in 4 weeks — measured, not promised." → 앵글 CLI, 훅타입 RESULT
   "Ain't no way this Glass Ampoule has 100 ingredients" → 앵글 MYTH, 훅타입 TEXT

규칙:
- 근거가 없으면 억지로 채우지 말고 null. 추측은 매트릭스를 오염시킨다.
- 미스트=MST, 앰플=AMP, 둘 다/세트=SET, 제품 특정 불가한 브랜드 소재=BRD.
- confidence 는 0~1.

소재 목록:
${items.map((it, i) => `[${i}] 이름: ${it.name}
    제목: ${(it.title || '').slice(0, 120)}
    문구: ${(it.body || '').replace(/\s+/g, ' ').slice(0, 400)}`).join('\n')}

JSON 배열만 출력. 다른 말 금지:
[{"i":0,"product":"MST","angle":"POV","hook":"SCENE","confidence":0.9}, ...]`;
}

async function classifyChunk(items) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.CLASSIFY_MODEL || 'claude-sonnet-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: buildPrompt(items) }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`${d.error.type}: ${d.error.message}`);
  const text = d.content?.[0]?.text || '';
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('LLM 응답에 JSON 배열 없음');
  return JSON.parse(m[0]);
}

const valid = (axis, v) => (v && Object.prototype.hasOwnProperty.call(AXES[axis], v) ? v : null);

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ skipped: true, reason: 'ANTHROPIC_API_KEY 없음' });
  const token = process.env.META_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return res.status(200).json({ skipped: true, reason: 'Meta 토큰 없음' });

  const q = req.query || {};
  const force = q.force === '1';
  const dry = q.dry === '1';
  const limit = Number(q.limit) || 200;

  try {
    // 소재 목록은 ad-winners 를 직접 호출해 가져온다(계정 목록·기간 규칙을 한 곳에만 둔다).
    const { default: adWinners } = await import('../agents/ad-winners.js');
    const inner = { status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
    await adWinners({ method: 'GET', query: { market: 'all', minSpend: '0', top: '500', preset: String(q.preset || 'last_90d') } }, inner);
    const ads = inner.body?.ads || [];

    const cached = (await redis.hgetall(CACHE_KEY)) || {};
    const targets = ads.filter(a => {
      if (!force && cached[a.ad_id]) return false;
      const code = parseAssetCode(a.ad_name, { market: a.market, isVideo: a.content?.isVideo });
      return code.coded ? false : (!code.product || !code.angle || !code.hook); // 정식 코드는 건드리지 않음
    }).slice(0, limit);

    if (!targets.length) {
      return res.status(200).json({ ok: true, total: ads.length, alreadyClassified: Object.keys(cached).length, classified: 0, message: '분류할 소재 없음' });
    }

    const texts = await fetchCreativeText(targets.map(a => a.ad_id), token);
    const items = targets.map(a => ({ ad_id: a.ad_id, name: a.ad_name, ...(texts[a.ad_id] || {}) }));

    const results = {};
    const errors = [];
    for (let i = 0; i < items.length; i += CHUNK) {
      const slice = items.slice(i, i + CHUNK);
      try {
        for (const r of await classifyChunk(slice)) {
          const it = slice[r.i];
          if (!it) continue;
          results[it.ad_id] = {
            product: valid('product', r.product),
            angle: valid('angle', r.angle),
            hook: valid('hook', r.hook),
            confidence: Number(r.confidence) || null,
            by: 'llm', at: new Date().toISOString(),
          };
        }
      } catch (e) { errors.push({ chunk: i / CHUNK, error: e.message }); }
    }

    if (!dry && Object.keys(results).length) await redis.hset(CACHE_KEY, results);

    const filled = (k) => Object.values(results).filter(r => r[k]).length;
    return res.status(200).json({
      ok: true, dry, total: ads.length,
      targets: targets.length, classified: Object.keys(results).length,
      filled: { product: filled('product'), angle: filled('angle'), hook: filled('hook') },
      ...(errors.length ? { errors } : {}),
      sample: Object.entries(results).slice(0, 5).map(([id, v]) => ({ id, name: items.find(i => i.ad_id === id)?.name, ...v })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

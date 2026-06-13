// 일일 정보성 꿀팁 캐러셀 cron — 화·목·토·일(=정보성 4일) 자동 생성.
//   (월·금=실후기[Cowork 캡처], 수=프로모[wed-promo] 는 별도 → 여기서 제외)
//   흐름: 키워드 로테이션 → LLM 슬라이드 카피(궁금증갭+대세감, 제품 은근 1곳) → render-card 베이킹 → 보드 review 시드.
//   시장 1회 생성 → IG·TT 공유(같은 카드). KR=한국어 / US=영어. status review만(자동발행 X).
// 멱등: 오늘자 carousel 슬롯에 mediaUrls 이미 있으면 스킵.
// 인증: Bearer CRON_SECRET (미들웨어 /api/cron/* 통과). ?dry=1 = 대상·카피만(렌더·시드 없음). ?force=1 = 요일 게이트 무시.
import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';
import { put } from '@vercel/blob';
import { getSupabase } from '../../lib/supabase.js';
import { loadFonts, renderSlide, bakePng } from '../creator/render-card.js';

export const config = { maxDuration: 300 };

const anthropic = new Anthropic();
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const SLOT = 'info_tip'; // 정보성 꿀팁 캐러셀 슬롯
const envTrim = (k, fb = '') => String(process.env[k] ?? fb).replace(/\\[rn]/g, '').replace(/^["'\s]+|["'\s]+$/g, '');
const PROFILE = {
  kr: envTrim('ZERNIO_MILLIMILLI_PROFILE_ID', '69d08cc1986d57bb8f733102'),
  us: envTrim('ZERNIO_MILLIMILLI_US_PROFILE_ID', '69fbfcd01fc1fdb66f249aa8'),
};
const CHANNELS = [
  { key: 'kr_ig', region: 'kr', platform: 'instagram' },
  { key: 'kr_tt', region: 'kr', platform: 'tiktok' },
  { key: 'us_ig', region: 'us', platform: 'instagram' },
  { key: 'us_tt', region: 'us', platform: 'tiktok' },
];

// 키워드 풀(정보성 앵글 로테이션) — content-engine-system.md.
const KEYWORDS = [
  '미스트', '글래스스킨', '콜라겐', '탄력', '글로잉뷰티',
  '팔자주름', '눈가주름', '진정', '미백', '코리안스킨케어',
];

const kstNow = () => new Date(Date.now() + 9 * 3600000);
const kstToday = () => kstNow().toISOString().slice(0, 10);
// 정보성 캐러셀 요일 = 목(4)·토(6)·일(0). (월·금=실후기[Cowork] / 수=프로모[wed-promo] / 화=정보성[Cowork monday-카루셀 이동] 제외)
const INFO_DAYS = new Set([4, 6, 0]);

// 시장별 슬라이드 카피 생성(궁금증갭+대세감, 제품 은근 1곳, 클레임 범위). render-card 네이티브 스키마로 반환.
async function genSlides(market, keyword) {
  const lang = market === 'kr' ? '한국어' : 'English';
  const heroLine = market === 'kr'
    ? 'MILLIMILLI 500달톤 단백질 미스트 (입증 혜택 범위: 24h 보습·장벽·결 정돈. 그 외 과장 금지)'
    : 'MILLIMILLI 500 Dalton Protein Mist (substantiated claims only: 24h hydration, barrier, texture. no exaggeration)';
  const system = `당신은 밀리밀리(MILLIMILLI) 브랜드의 정보성 뷰티 카드뉴스 카피라이터입니다.
출력 언어: ${lang}. 시장: ${market.toUpperCase()}.
절대 규칙:
- KPI = 댓글·저장·공유. 조회수·판매 아님. 매일 판매 톤 금지.
- 정보성·꿀팁이 주(主), 제품은 '은근히 1곳'(info 2번 슬라이드에만 자연스럽게). 광고처럼 보이면 실패.
- 모든 카드: 궁금증 갭(curiosity gap) + 대세감(social proof) 둘 다 필수. 없으면 실패.
- 커버 헤드라인 = 3초 후킹, 정보 다 주지 말고 갭만 연다(반전·"99%가 모르는"·결과 선공개).
- 제품 클레임은 입증 혜택 범위 내에서만. AI 연출/시장 수치 혼용 금지.
- 광고 문구("저희 제품은") 금지. 구어체·꿀팁 톤.`;
  const user = `오늘 키워드: ${keyword}
히어로 제품(은근히 1곳만): ${heroLine}

정보성 꿀팁 캐러셀 4장을 아래 JSON으로만 반환(코드블록 없이 순수 JSON):
{
  "caption": "인스타 캡션 ${lang}, 일기/구어체, 첫 줄 후킹 + 정보 + 댓글 가르는 질문 + 저장/공유 유도(이모지 포함, 200자 이내)",
  "hashtags": "관련 해시태그 10-15개(${lang}/영문 혼용 가능, 공백 구분)",
  "slides": [
    {"type":"cover","headline":"초대형 후킹 제목(궁금증갭, 12자 내외)","body":"서브 1줄(대세감 신호 — '요즘 다들~'/'N만+ 저장')","labels":["짧은 스펙 라벨","짧은 스펙 라벨"]},
    {"type":"info","headline":"꿀팁 소제목 1","body":"본문 2-3줄. 진짜 유용한 정보. 핵심어는 **강조**로 감쌈"},
    {"type":"info","headline":"꿀팁 소제목 2","body":"본문 2-3줄. 여기서 ${heroLine} 를 해결책으로 **은근히 1곳** 녹임(광고 톤 금지)"},
    {"type":"cta","headline":"마무리 한 줄(저장 유도)","body":"댓글 가르는 질문 1줄 + 공유 유도","cta":"저장하고 다음에 써먹기"}
  ]
}
주의: 한 콘텐츠 = 제품 은근히 1곳(슬라이드 3에만). cover headline 은 반드시 궁금증갭.`;

  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const raw = r.content[0]?.text || '';
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('LLM 응답 파싱 실패');
  const parsed = JSON.parse(m[0]);
  if (!Array.isArray(parsed.slides) || parsed.slides.length < 3) throw new Error('slides 부족');
  return parsed;
}

// 슬라이드 → render-card 베이킹 → Blob URLs
async function bakeCards(slides, market, draftId, fonts) {
  const urls = [];
  for (let i = 0; i < slides.length; i++) {
    const png = await bakePng(renderSlide(slides[i], market), fonts);
    const blob = await put(`cardnews/${draftId}-${i + 1}.png`, png, { access: 'public', contentType: 'image/png', addRandomSuffix: true });
    urls.push(blob.url);
  }
  return urls;
}

// 보드 시드(채널×날짜 멱등 — 기존 행 갱신 or 생성)
async function seedDraft(sb, { channel, region, platform, date, mediaUrls, caption, hashtags }) {
  const { data: rows } = await sb.from('creator_drafts').select('id, data').limit(400);
  const existing = (rows || []).find(r => r.data && r.data.version === 'milli-v1' && r.data.channel === channel && r.data.date === date && (r.data.slotType || '') === SLOT);
  if (existing) {
    const d = existing.data;
    d.mediaUrls = mediaUrls; d.format = 'cardnews'; d.status = 'review';
    d.caption = caption; d.hashtags = hashtags; d.source = 'carousel-daily'; d.updatedAt = new Date().toISOString();
    await sb.from('creator_drafts').update({ data: d }).eq('id', existing.id);
    return { channel, id: existing.id, action: 'updated' };
  }
  const id = `milli_${channel}_${date}_${SLOT}_${Date.now().toString(36)}`;
  const draft = {
    id, version: 'milli-v1', channel, region, platform, date, slotType: SLOT,
    status: 'review', format: 'cardnews', caption, hashtags, mediaUrl: null, mediaUrls,
    source: 'carousel-daily', profileId: PROFILE[region],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await sb.from('creator_drafts').insert({ id, persona_id: null, data: draft });
  return { channel, id, action: 'created' };
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  const dry = req.query?.dry === '1';
  const force = req.query?.force === '1';
  const today = kstToday();
  const dow = kstNow().getUTCDay(); // +9h 시프트 인스턴트의 UTC요일 = KST요일(런타임 TZ 독립)
  if (!force && !INFO_DAYS.has(dow)) return res.status(200).json({ ok: true, skip: 'not_info_day', dow, today });

  try {
    const sb = getSupabase();
    // 키워드 로테이션
    const n = Number(await redis.get('creator:carousel:rotation').catch(() => 0)) || 0;
    const keyword = KEYWORDS[n % KEYWORDS.length];
    if (!dry) await redis.set('creator:carousel:rotation', n + 1).catch(() => {});

    // 멱등: 오늘 이미 생성됐으면 스킵
    const { data: rows } = await sb.from('creator_drafts').select('id, data').limit(400);
    const done = (rows || []).some(r => r.data && r.data.version === 'milli-v1' && r.data.date === today && (r.data.slotType || '') === SLOT && Array.isArray(r.data.mediaUrls) && r.data.mediaUrls.length);
    if (done && !force) return res.status(200).json({ ok: true, skip: 'already_done', today, keyword });

    if (dry) {
      const kr = await genSlides('kr', keyword).catch(e => ({ error: e.message }));
      return res.status(200).json({ ok: true, dry: true, today, keyword, sampleKR: kr });
    }

    const fonts = await loadFonts();
    const results = [];
    // 시장별 1회 생성 → IG·TT 공유
    for (const market of ['kr', 'us']) {
      try {
        const copy = await genSlides(market, keyword);
        const draftId = `${market}_${today}_${Date.now().toString(36)}`;
        const mediaUrls = await bakeCards(copy.slides, market, draftId, fonts);
        const caption = copy.caption || '';
        const hashtags = copy.hashtags || '';
        for (const ch of CHANNELS.filter(c => c.region === market)) {
          const seeded = await seedDraft(sb, { channel: ch.key, region: ch.region, platform: ch.platform, date: today, mediaUrls, caption, hashtags });
          results.push(seeded);
        }
      } catch (e) { results.push({ market, error: e.message }); }
    }
    const summary = { ok: true, today, keyword, results };
    try { await redis.set('creator:carousel-daily:latest', { ...summary, at: new Date().toISOString() }, { ex: 86400 * 3 }); } catch {}
    return res.status(200).json(summary);
  } catch (e) {
    console.error('[carousel-daily]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

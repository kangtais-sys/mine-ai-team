// 수요일 프로모 렌더러 (docs/wednesday-auto-pipeline.md A-1/A-2/A-3).
// 이미지-주도 "광고형" 카루셀 5장 — 월요일(render_monday/ render-card = 흰 여백 텍스트 에디토리얼)과 완전히 다른 디자인:
//   제품 사진이 화면을 지배(풀블리드) + 블랙 오퍼밴드 + 초대형 가격/별점.
// 입력 이미지 URL을 서버에서 fetch → satori+resvg 로 베이킹 → Blob 호스팅 → 보드(ingest 계약) 시드.
// 렌더 스택은 render-card.js 와 동일(loadFonts/bakePng 재사용 — 1080×1350).
//
// 인증: Authorization: Bearer <CREATOR_INGEST_SECRET> (ingest 와 동일).
import { put } from '@vercel/blob';
import { getSupabase } from '../../lib/supabase.js';
import { loadFonts, bakePng } from './render-card.js';

export const config = { maxDuration: 120 };

const W = 1080, H = 1350;
const BLACK = '#0A0A0A', WHITE = '#FFFFFF', GRAY = '#F2F1EE', SUB = '#8A8A8A';

// ── satori 하이퍼스크립트 ──
const h = (type, style, children) => ({ type, props: { style, ...(children !== undefined ? { children } : {}) } });
const col = (style, children) => h('div', { display: 'flex', flexDirection: 'column', ...style }, children);
const row = (style, children) => h('div', { display: 'flex', flexDirection: 'row', alignItems: 'center', ...style }, children);
const txt = (s, style) => h('div', { display: 'flex', ...style }, s);
const img = (src, style) => ({ type: 'img', props: { src, style } });
const pill = (s, inv = false) => h('div', {
  display: 'flex', alignItems: 'center', backgroundColor: inv ? WHITE : BLACK, color: inv ? BLACK : WHITE,
  fontFamily: 'Pretendard', fontWeight: 700, fontSize: 28, padding: '12px 24px', borderRadius: 0, lineHeight: 1,
}, s);
const mono = (s, style) => txt(s, { fontFamily: 'Mono', fontWeight: 700, fontSize: 24, color: BLACK, letterSpacing: 1, ...style });
const wordmark = (color = BLACK, scale = 1) => row({ alignItems: 'flex-start' }, [
  txt('milli', { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 38 * scale, color, letterSpacing: -1 }),
  txt('2', { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 20 * scale, color, marginTop: 2 }),
]);

// 시장별 고정 스펙(브랜드 상수 — 스펙 A-2 명시값). KR/US 수치 혼용 금지.
const SCIENCE = {
  us: { stat: '431,964 ppm', sub: 'protein complexes · under 500 Daltons', head: 'WHY IT ACTUALLY ABSORBS' },
  kr: { stat: '984 ppm', sub: '단백질 분자 · 500달톤 이하', head: '왜 흡수되나' },
};
const BADGE = (m) => (m === 'us' ? 'AMAZON US' : 'MILLIMILLI.KR');

// ── 슬라이드 5종 (이미지 지배) ──
function slideCover(im, offer, market) {
  const isKr = market === 'kr';
  const hook = isKr
    ? (offer.bonus || '1+1 단독구성')
    : (/buy 1 get 1/i.test(offer.bonus || '') ? 'BUY 1, GET 1 FREE GIFT' : 'FREE GIFT INSIDE');
  // 우상단 칩: US=실평점 별점 / KR=미스트 뱃지(예 '[리뉴얼]') 또는 관심지표 — US$/별점·타제품 뱃지('1분완판'=앰플) 금지
  const chip = isKr ? (offer.badge || (offer.interest ? `관심 ${offer.interest}` : '자사몰')) : `★ ${offer.rating}`;
  return col({ width: W, height: H, backgroundColor: WHITE }, [
    // 제품 히어로 풀블리드 + 상단 오버레이(채널 배지 / 실지표 칩)
    h('div', { display: 'flex', position: 'relative', width: W, height: 858, backgroundColor: GRAY }, [
      im.hero ? img(im.hero, { width: W, height: 858, objectFit: 'cover' }) : txt('', { width: W, height: 858 }),
      row({ position: 'absolute', top: 40, left: 40, width: W - 80, justifyContent: 'space-between' }, [
        pill(BADGE(market)),
        h('div', { display: 'flex', backgroundColor: WHITE, padding: '10px 20px', alignItems: 'center' }, [
          txt(chip, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 32, color: BLACK }),
        ]),
      ]),
    ]),
    // 하단 블랙 오퍼밴드 — 증정/가격 크게(3초 훅)
    col({ flex: 1, backgroundColor: BLACK, padding: '46px 56px', justifyContent: 'center' }, [
      txt(hook, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 72, color: WHITE, lineHeight: 1.0, letterSpacing: -1 }),
      row({ marginTop: 22, alignItems: 'baseline' }, [
        txt(offer.price || '', { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 92, color: WHITE, letterSpacing: -2 }),
        isKr
          ? (offer.listPrice ? col({ marginLeft: 20 }, [
              txt(`정가 ${offer.listPrice}`, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 26, color: '#9A9A9A', textDecoration: 'line-through' }),
              offer.discount ? txt(`${offer.discount} 할인`, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 30, color: WHITE, marginTop: 4 }) : null,
            ].filter(Boolean)) : null)
          : (offer.shipping ? txt(`   ${(offer.shipping || '').split('·')[0].trim()}`, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 30, color: '#C7C7CC' }) : null),
      ].filter(Boolean)),
      mono('swipe →', { fontSize: 24, color: SUB, marginTop: 26 }),
    ]),
  ]);
}

function slideScience(im, market) {
  const sc = SCIENCE[market] || SCIENCE.us;
  return col({ width: W, height: H, backgroundColor: WHITE, padding: 72 }, [
    row({ justifyContent: 'space-between', alignItems: 'center' }, [wordmark(), mono(market === 'us' ? 'THE SCIENCE' : '과학', { color: SUB })]),
    txt(sc.head, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 72, color: BLACK, lineHeight: 1.05, letterSpacing: -2, marginTop: 28 }),
    h('div', { display: 'flex', width: W - 144, height: 420, backgroundColor: GRAY, marginTop: 34, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
      [im.science ? img(im.science, { width: W - 144, height: 420, objectFit: 'contain' }) : null].filter(Boolean)),
    col({ marginTop: 40 }, [
      txt(sc.stat, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 96, color: BLACK, letterSpacing: -2, lineHeight: 1 }),
      mono(sc.sub, { fontSize: 30, color: '#2A2A2A', marginTop: 14 }),
    ]),
    row({ justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }, [mono('THE 500 DALTON RULE', { fontSize: 20, color: SUB }), mono('milli²', { fontSize: 20, color: SUB })]),
  ]);
}

function slideProof(im, offer, market) {
  const isKr = market === 'kr';
  // 실집계 지표만(가짜 후기카드 금지). US=실평점 별점 / KR=관심·완판(US$·별점 혼용 금지)
  const metric = isKr
    ? col({}, [
        // "지금까지 319,937명이 관심" — 미스트 자체 실집계만. '1분 완판'(앰플 뱃지) 금지.
        txt('지금까지', { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 44, color: '#2A2A2A', marginTop: 14 }),
        row({ alignItems: 'baseline' }, [
          txt(offer.interest || '', { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 150, color: BLACK, letterSpacing: -5, lineHeight: 1 }),
          txt('명이 관심', { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 48, color: SUB, marginLeft: 10 }),
        ]),
        txt('미스트 자체 실집계 · 라이브', { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 30, color: '#9A9A9A', marginTop: 8 }),
      ])
    : col({}, [
        row({ alignItems: 'baseline', marginTop: 24 }, [
          txt('★', { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 120, color: BLACK }),
          txt(` ${offer.rating}`, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 200, color: BLACK, letterSpacing: -6, lineHeight: 1 }),
          txt(' / 5', { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 56, color: SUB }),
        ]),
        txt(`${offer.reviewCount} verified reviews`, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 38, color: '#2A2A2A', marginTop: 6 }),
      ]);
  return col({ width: W, height: H, backgroundColor: WHITE, padding: 72 }, [
    row({ justifyContent: 'space-between', alignItems: 'center' }, [wordmark(), pill(BADGE(market))]),
    metric,
    h('div', { display: 'flex', width: W - 144, height: 440, backgroundColor: GRAY, marginTop: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: `2px solid ${BLACK}` },
      [im.proof ? img(im.proof, { width: W - 144, height: 440, objectFit: 'cover' }) : null].filter(Boolean)),
    row({ justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }, [mono(isKr ? '자사몰 실집계 지표' : 'REAL BUYERS · REAL REVIEWS', { fontSize: 20, color: SUB }), mono('milli²', { fontSize: 20, color: SUB })]),
  ]);
}

function slideDeal(im, offer, market) {
  return col({ width: W, height: H, backgroundColor: WHITE }, [
    h('div', { display: 'flex', width: W, height: 700, backgroundColor: GRAY, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
      [im.deal ? img(im.deal, { width: W, height: 700, objectFit: 'cover' }) : null].filter(Boolean)),
    col({ flex: 1, backgroundColor: BLACK, padding: '40px 56px', justifyContent: 'center' }, [
      mono(market === 'us' ? 'THE DEAL' : '혜택', { fontSize: 26, color: '#C7C7CC' }),
      row({ alignItems: 'baseline', marginTop: 8 }, [
        txt(offer.price || '', { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 96, color: WHITE, letterSpacing: -3, lineHeight: 1 }),
        (market === 'kr' && offer.listPrice) ? txt(`  정가 ${offer.listPrice}`, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 30, color: '#9A9A9A', textDecoration: 'line-through' }) : null,
        (market === 'kr' && offer.discount) ? txt(`  ${offer.discount}↓`, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 34, color: WHITE }) : null,
      ].filter(Boolean)),
      offer.bonus ? txt(offer.bonus, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 32, color: WHITE, marginTop: 14, lineHeight: 1.2 }) : null,
      offer.shipping ? txt(offer.shipping, { fontFamily: 'Pretendard', fontWeight: 400, fontSize: 26, color: '#C7C7CC', marginTop: 10 }) : null,
      offer.gift ? txt(`🎁 ${offer.gift}`.replace('🎁 ', '+ '), { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 26, color: WHITE, marginTop: 8 }) : null,
    ].filter(Boolean)),
  ]);
}

function slideCtaEngage(im, market) {
  const lines = market === 'us'
    ? ['→  Tag the friend whose skin drinks everything', '→  Save this for your next restock', '→  Follow @millimilli.us for the 500 Dalton rule']
    : ['→  이거 필요한 친구 태그', '→  다음 재구매 위해 저장', '→  @millimilli.kr 팔로우'];
  return col({ width: W, height: H, backgroundColor: BLACK, padding: 80, justifyContent: 'center', alignItems: 'center' }, [
    h('div', { display: 'flex', marginBottom: 36 }, [wordmark(WHITE, 1.6)]),
    txt(market === 'us' ? 'ONE MIST, OR TWO?' : '1+1 vs 단품, 너는?', { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 84, color: WHITE, textAlign: 'center', lineHeight: 1.05, letterSpacing: -2 }),
    txt(market === 'us' ? 'Comment 1 or 2 below ↓' : "댓글에 '1+1' 또는 '단품' ↓", { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 40, color: '#C7C7CC', marginTop: 22 }),
    col({ marginTop: 44, gap: 18 }, lines.map(l => txt(l, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 34, color: WHITE }))),
    row({ marginTop: 48 }, [pill(market === 'us' ? 'Shop on Amazon  →' : 'millimilli.kr 에서 보기  →', true)]),
  ]);
}

export function buildSlides(im, offer, market) {
  return [
    slideCover(im, offer, market),
    slideScience(im, market),
    slideProof(im, offer, market),
    slideDeal(im, offer, market),
    slideCtaEngage(im, market),
  ];
}

// ── A-3 캡션 생성 (가치/관전 훅 + 실제 오퍼 + KPI 장치). 시장별 언어. ──
export function buildCaption(offer, market) {
  if (market === 'kr') {
    const dealLine = offer.listPrice
      ? `✔ 정가 ${offer.listPrice} → ${offer.bonus || ''} ${offer.price}${offer.discount ? ` (${offer.discount}↓)` : ''}`.replace(/\s+/g, ' ').trim()
      : `✔ ${offer.bonus || ''} ${offer.price}`.trim();
    const caption = [
      '단백질이 아니라, 크기 문제였어요. 🔬',
      '',
      '500달톤 분자 단백질 미스트 — 진짜 흡수되는 크기(984ppm·500달톤 이하). 한 번 뿌리면 속부터 차오르는 물광.',
      '',
      offer.interest ? `🔥 지금까지 ${offer.interest}명이 관심` : null,
      dealLine,
      offer.shipping ? `✔ ${offer.shipping}` : null,
      offer.gift ? `✔ ${offer.gift}` : null,
      '',
      "💬 1+1 vs 단품, 너는? 댓글로 알려줘요 👇",
      '📌 다음 재구매 위해 저장!',
      '🔖 피부가 다 먹는 친구 태그',
      '',
      '※ AI 연출 컷 포함 · 화장품 표현 범위 내',
    ].filter(l => l !== null).join('\n');
    const hashtags = '#밀리밀리 #단백질미스트 #500달톤 #물광 #수분미스트 #속건조 #스킨케어 #글로우 #자사몰 #뷰티꿀팁';
    return { caption, hashtags };
  }
  const caption = [
    "It's not the protein. It's the size. 🔬",
    '',
    `500 Dalton molecular protein mist — small enough to actually sink in (431,964 ppm, under 500 Da). One spritz, glass-skin glow from within.`,
    '',
    `✔ ★${offer.rating} · ${offer.reviewCount} reviews`,
    offer.bonus ? `✔ ${offer.price} · ${offer.bonus}` : `✔ ${offer.price}`,
    offer.shipping ? `✔ ${offer.shipping}` : null,
    '',
    '💬 One mist, or two? Tell us below 👇',
    '📌 Save this for your next restock',
    '🔖 Tag the friend whose skin drinks everything',
    '',
    '※ Some AI-styled visuals · cosmetic claims only',
  ].filter(l => l !== null).join('\n');
  const hashtags = '#glassskin #kbeauty #proteinmist #500dalton #skincare #dewyskin #koreanskincare #amazonfinds #skincareroutine #milli';
  return { caption, hashtags };
}

// ── 이미지 URL → data URL (서버 fetch, 매직바이트로 mime 확정) ──
export async function fetchImageDataUrl(url) {
  if (!url) return null;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`이미지 fetch 실패 ${r.status}: ${url.slice(0, 80)}`);
  const buf = Buffer.from(await r.arrayBuffer());
  let mt = (r.headers.get('content-type') || '').split(';')[0];
  if (buf[0] === 0x89 && buf[1] === 0x50) mt = 'image/png';
  else if (buf[0] === 0xff && buf[1] === 0xd8) mt = 'image/jpeg';
  else if (buf.toString('ascii', 0, 4) === 'RIFF') mt = 'image/webp';
  if (!/^image\//.test(mt)) throw new Error(`이미지 아님(${mt}): ${url.slice(0, 80)}`);
  return `data:${mt};base64,${buf.toString('base64')}`;
}

// ── 보드 시드 (ingest 계약과 동일: channel+date 업서트, version milli-v1) ──
async function seedDraft(sb, { channel, date, mediaUrls, caption, hashtags, slotType, status }) {
  const region = channel.startsWith('us') ? 'us' : 'kr';
  const platform = channel.endsWith('tt') ? 'tiktok' : 'instagram';
  const PROFILE = {
    kr: (process.env.ZERNIO_MILLIMILLI_PROFILE_ID || '69d08cc1986d57bb8f733102').replace(/\\[rn]/g, '').trim(),
    us: (process.env.ZERNIO_MILLIMILLI_US_PROFILE_ID || '69fbfcd01fc1fdb66f249aa8').replace(/\\[rn]/g, '').trim(),
  };
  const { data: rows } = await sb.from('creator_drafts').select('id, data').limit(300);
  const existing = (rows || []).find(r => r.data && r.data.version === 'milli-v1' && r.data.channel === channel && r.data.date === date);
  if (existing) {
    const d = existing.data;
    d.mediaUrls = mediaUrls; d.caption = caption; d.hashtags = hashtags;
    d.format = 'carousel'; d.slotType = slotType; d.status = status; d.updatedAt = new Date().toISOString();
    await sb.from('creator_drafts').update({ data: d }).eq('id', existing.id);
    return { channel, id: existing.id, action: 'updated' };
  }
  const id = `milli_${channel}_${date}_${Date.now().toString(36)}`;
  const draft = {
    id, version: 'milli-v1', channel, region, platform, date,
    slotType, status, format: 'carousel',
    caption, hashtags, mediaUrl: null, mediaUrls,
    profileId: PROFILE[region], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await sb.from('creator_drafts').insert({ id, persona_id: null, data: draft });
  return { channel, id, action: 'created' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.CREATOR_INGEST_SECRET;
  if (!secret) return res.status(503).json({ error: 'Service misconfigured (CREATOR_INGEST_SECRET)' });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  const { market = 'us', date, images = {}, offer = {}, publish = false, channels: chOverride } = req.body || {};
  if (!date) return res.status(400).json({ error: 'date 필수' });
  if (!['us', 'kr'].includes(market)) return res.status(400).json({ error: 'market 은 us|kr' });
  if (!images.hero) return res.status(400).json({ error: 'images.hero 필수' });

  try {
    // ① 이미지 서버 fetch → data URL (CDN egress 는 Vercel 에서 닿음)
    const im = {};
    for (const k of ['hero', 'deal', 'science', 'proof']) {
      try { im[k] = await fetchImageDataUrl(images[k]); }
      catch (e) { console.error(`[render-promo] ${k}:`, e.message); im[k] = null; }
    }
    if (!im.hero) return res.status(422).json({ error: 'hero 이미지 다운로드 실패 — URL 재검증 필요' });

    // ② 5장 렌더 → ③ Blob 호스팅 (render-card 와 동일 스택: satori+resvg+put)
    const fonts = await loadFonts();
    const slides = buildSlides(im, offer, market);
    const mediaUrls = [];
    for (let i = 0; i < slides.length; i++) {
      const png = await bakePng(slides[i], fonts);
      const blob = await put(`promo/${market}-${date}-${i + 1}.png`, png, { access: 'public', contentType: 'image/png', addRandomSuffix: true });
      mediaUrls.push(blob.url);
    }

    // ④ 캡션 + 보드 시드(ingest 계약) — status:review (승인 게이트). publish=true 라도 자동발행은 승인 플로우에 위임.
    const { caption, hashtags } = buildCaption(offer, market);
    const channels = Array.isArray(chOverride) && chOverride.length ? chOverride : [`${market}_ig`];
    const status = publish ? 'approved' : 'review';
    const sb = getSupabase();
    const drafts = [];
    for (const channel of channels) {
      drafts.push(await seedDraft(sb, { channel, date, mediaUrls, caption, hashtags, slotType: 'wed_promo', status }));
    }

    return res.status(200).json({ ok: true, drafts, mediaUrls, slides: mediaUrls.length, market, caption, hashtags });
  } catch (e) {
    console.error('[render-promo]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

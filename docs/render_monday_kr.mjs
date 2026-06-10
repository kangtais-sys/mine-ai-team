// 로컬 v2 카드 렌더 (render-card.js 렌더로직 복사 + reviewCard 타입 추가). Blob/Supabase 제거.
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';

const W = 1080, H = 1350;
const BLACK = '#0A0A0A', WHITE = '#FFFFFF', GRAY = '#F2F1EE', SUB = '#6B6B6B';
const LOGO_URL = 'https://zre3xstenznneqve.public.blob.vercel-storage.com/capture/milli_logo-S5AYbqtEpiw6igBWtUm0MPNMpgXZEf.png';

let FONTS = null;
async function loadFonts() {
  if (FONTS) return FONTS;
  const f = (p) => fs.readFileSync(p);
  const P = 'node_modules/pretendard/dist/public/static';
  const black = f(`${P}/Pretendard-Black.otf`), bold = f(`${P}/Pretendard-Bold.otf`), light = f(`${P}/Pretendard-Regular.otf`);
  const mono = f('node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff');
  FONTS = [
    { name: 'Pretendard', data: black, weight: 900, style: 'normal' },
    { name: 'Pretendard', data: bold, weight: 700, style: 'normal' },
    { name: 'Pretendard', data: light, weight: 400, style: 'normal' },
    { name: 'Mono', data: mono, weight: 700, style: 'normal' },
  ];
  return FONTS;
}

const h = (type, style, children) => ({ type, props: { style, ...(children !== undefined ? { children } : {}) } });
const row = (style, children) => h('div', { display: 'flex', flexDirection: 'row', alignItems: 'center', ...style }, children);
const col = (style, children) => h('div', { display: 'flex', flexDirection: 'column', ...style }, children);
const txt = (s, style) => h('div', { display: 'flex', ...style }, s);
const pill = (s, inv = false) => h('div', { display: 'flex', alignItems: 'center', backgroundColor: inv ? WHITE : BLACK, color: inv ? BLACK : WHITE, fontFamily: 'Pretendard', fontWeight: 700, fontSize: 30, padding: '12px 26px', borderRadius: 0, lineHeight: 1 }, s);
const HAS_KR = (s) => /[가-힣]/.test(String(s));
// 브랜드 가이드: 한글 라벨=굵은 고딕(Pretendard), 영문=모노. 한글이면 Pretendard 폴백.
const mono = (s, style) => txt(s, { fontFamily: HAS_KR(s) ? 'Pretendard' : 'Mono', fontWeight: 700, fontSize: 26, color: BLACK, letterSpacing: HAS_KR(s) ? 0 : 1, ...style });

function richText(str, { fontSize, color, lineHeight = 1.5, justify = 'flex-start' } = {}) {
  const segs = []; const re = /\*\*(.+?)\*\*/g; let last = 0, m;
  while ((m = re.exec(str))) { if (m.index > last) segs.push({ t: str.slice(last, m.index), b: false }); segs.push({ t: m[1], b: true }); last = re.lastIndex; }
  if (last < str.length) segs.push({ t: str.slice(last), b: false });
  const words = segs.flatMap(s => s.t.split(/\s+/).filter(Boolean).map(w => ({ w, b: s.b })));
  return h('div', { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: justify },
    words.map(x => txt(x.w, { fontFamily: 'Pretendard', fontWeight: x.b ? 900 : 400, fontSize, color, lineHeight, marginRight: Math.round(fontSize * 0.28), marginBottom: Math.round(fontSize * 0.18) })));
}
function roughEllipseSvg(w, ht, color) {
  const p = `M ${w*.52} ${ht*.1} C ${w*.92} ${ht*.04} ${w*1.0} ${ht*.62} ${w*.56} ${ht*.9} C ${w*.12} ${ht*1.04} ${w*.0} ${ht*.42} ${w*.46} ${ht*.12} C ${w*.62} ${ht*.04} ${w*.8} ${ht*.08} ${w*.9} ${ht*.2}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${ht}"><path d="${p}" fill="none" stroke="${color}" stroke-width="${Math.max(4, w*.014)}" stroke-linecap="round"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
function circled(node, w, ht, { color = BLACK, padX = 34, padY = 26 } = {}) {
  return h('div', { display: 'flex', position: 'relative', alignItems: 'center', justifyContent: 'center', padding: `${padY}px ${padX}px` }, [
    node, { type: 'img', props: { src: roughEllipseSvg(w + padX*2, ht + padY*2, color), style: { position: 'absolute', left: 0, top: 0, width: w + padX*2, height: ht + padY*2 } } },
  ]);
}
const wordmark = (color = BLACK) => row({ alignItems: 'flex-start' }, [
  txt('milli', { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 40, color, letterSpacing: -1 }),
  txt('2', { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 22, color, marginTop: 2 }),
]);
const marketBadge = (market) => pill(market === 'us' ? 'AMAZON  4.8★ (29)' : 'OLIVE YOUNG 1위');
const footer = () => row({ justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }, [
  mono('THE 500 DALTON RULE', { fontSize: 20, color: SUB }), mono('milli²', { fontSize: 20, color: SUB }),
]);
function frame(children, { bg = WHITE } = {}) {
  return h('div', { width: W, height: H, display: 'flex', flexDirection: 'column', backgroundColor: bg, padding: 80, fontFamily: 'Pretendard' }, children);
}
function slideImage(src, style) { if (!src) return null; return { type: 'img', props: { src, style: { objectFit: 'cover', ...style } } }; }
// 이미지 + 작은 출처 크레딧(좌하단 칩)
function framedImage(src, w, ht, credit) {
  return h('div', { display: 'flex', position: 'relative', width: w, height: ht, overflow: 'hidden', backgroundColor: GRAY }, [
    { type: 'img', props: { src, style: { width: w, height: ht, objectFit: 'cover' } } },
    credit ? h('div', { display: 'flex', position: 'absolute', left: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', color: WHITE, fontFamily: 'Mono', fontWeight: 700, fontSize: 17, padding: '6px 12px', letterSpacing: 1 }, credit) : null,
  ].filter(Boolean));
}

function renderCover(s, market) {
  const rating = market === 'us' ? '4.8★  AMAZON US' : 'OLIVE YOUNG 1위';
  return frame([
    col({}, [
      row({ justifyContent: 'space-between', alignItems: 'center' }, [
        wordmark(BLACK),
        circled(mono(rating, { fontSize: 26, color: BLACK, letterSpacing: 1 }), 250, 34, { padX: 18, padY: 12 }),
      ]),
      h('div', { display: 'flex', height: 1, backgroundColor: '#E3E3E3', marginTop: 20 }, ''),
    ]),
    row({ flex: 1, marginTop: 36, alignItems: 'center' }, [
      col({ flex: 1, paddingRight: 30 }, [
        s.eyebrow ? row({}, [pill(s.eyebrow)]) : null,
        s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 94, color: BLACK, lineHeight: 0.98, letterSpacing: -3, marginTop: s.eyebrow ? 28 : 0 }) : null,
        s.body ? txt(s.body, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 34, color: SUB, marginTop: 28, lineHeight: 1.28 }) : null,
      ].filter(Boolean)),
      s.image ? framedImage(s.image, 380, 880, s.credit) : null,
    ].filter(Boolean)),
    row({ justifyContent: 'space-between', alignItems: 'flex-end' }, [
      mono('swipe →', { fontSize: 24, color: SUB }),
      mono('THE 500 DALTON RULE', { fontSize: 20, color: SUB }),
    ]),
  ]);
}
const infoHeader = (s) => row({ justifyContent: 'space-between', alignItems: 'flex-start' }, [wordmark(), s.source ? mono(s.source, { fontSize: 22, color: SUB }) : null].filter(Boolean));
const infoLabels = (s) => (s.labels && s.labels.length) ? col({ marginTop: 32, gap: 14 }, s.labels.map(l => mono(`/ ${l}`, { fontSize: 28 }))) : null;
const dividerBar = (w = 120) => h('div', { display: 'flex', width: w, height: 8, backgroundColor: BLACK, marginTop: 26, marginBottom: 26 }, '');

function infoImageBottom(s) {
  return frame([
    infoHeader(s),
    col({ marginTop: 44, flex: 1 }, [
      s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 66, color: BLACK, lineHeight: 1.08, letterSpacing: -1 }) : null,
      dividerBar(),
      s.body ? richText(s.body, { fontSize: 42, color: '#2A2A2A', lineHeight: 1.5 }) : null,
      infoLabels(s),
    ].filter(Boolean)),
    s.image ? h('div', { display: 'flex', width: '100%', height: 470, overflow: 'hidden', backgroundColor: GRAY, marginBottom: 24 }, [slideImage(s.image, { width: W - 160, height: 470 })]) : null,
    footer(),
  ].filter(Boolean));
}
function infoTextCol(s, pad) {
  return col({ flex: 1, ...pad }, [
    s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 60, color: BLACK, lineHeight: 1.06, letterSpacing: -1 }) : null,
    dividerBar(100),
    s.body ? richText(s.body, { fontSize: 38, color: '#2A2A2A', lineHeight: 1.45 }) : null,
    infoLabels(s),
  ].filter(Boolean));
}
function infoImageRight(s) {
  return frame([
    infoHeader(s),
    row({ flex: 1, marginTop: 36, alignItems: 'center' }, [
      infoTextCol(s, { paddingRight: 40 }),
      s.image ? framedImage(s.image, 360, 820, s.credit) : null,
    ].filter(Boolean)),
    footer(),
  ].filter(Boolean));
}
function infoImageLeft(s) {
  return frame([
    infoHeader(s),
    row({ flex: 1, marginTop: 36, alignItems: 'center' }, [
      s.image ? framedImage(s.image, 360, 820, s.credit) : null,
      infoTextCol(s, { paddingLeft: 40 }),
    ].filter(Boolean)),
    footer(),
  ].filter(Boolean));
}
function infoImageTop(s) {
  return frame([
    infoHeader(s),
    s.image ? h('div', { display: 'flex', width: '100%', height: 560, overflow: 'hidden', backgroundColor: GRAY, marginTop: 28 }, [slideImage(s.image, { width: W - 160, height: 560 })]) : null,
    col({ flex: 1, marginTop: 40 }, [
      s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 60, color: BLACK, lineHeight: 1.06, letterSpacing: -1 }) : null,
      dividerBar(100),
      s.body ? richText(s.body, { fontSize: 40, color: '#2A2A2A', lineHeight: 1.45 }) : null,
      infoLabels(s),
    ].filter(Boolean)),
    footer(),
  ].filter(Boolean));
}
function infoTextBig(s) {
  return frame([
    infoHeader(s),
    col({ flex: 1, justifyContent: 'center' }, [
      s.num ? txt(s.num, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 200, color: '#EFEDEA', lineHeight: 0.9, letterSpacing: -6 }) : null,
      s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 88, color: BLACK, lineHeight: 1.0, letterSpacing: -2, marginTop: 16 }) : null,
      dividerBar(),
      s.body ? richText(s.body, { fontSize: 46, color: '#2A2A2A', lineHeight: 1.45 }) : null,
      infoLabels(s),
    ].filter(Boolean)),
    footer(),
  ].filter(Boolean));
}
function renderInfo(s) {
  switch (s.variant) {
    case 'imageRight': return infoImageRight(s);
    case 'imageLeft': return infoImageLeft(s);
    case 'imageTop': return infoImageTop(s);
    case 'textBig': return infoTextBig(s);
    default: return infoImageBottom(s);
  }
}
// 신규: 실제 후기 카드 (아바타+이름+별점+VERIFIED+인용+출처). 센스워딩 헤드라인은 s.headline.
function reviewCard(s, market) {
  const r = s.review || {};
  const stars = '★'.repeat(r.stars || 5);
  const initial = (r.name || 'M').trim()[0].toUpperCase();
  return frame([
    row({ justifyContent: 'space-between', alignItems: 'flex-start' }, [wordmark(), marketBadge(market)]),
    s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 60, color: BLACK, lineHeight: 1.08, marginTop: 40, letterSpacing: -1 }) : null,
    // 리뷰 카드 박스 (직각)
    col({ marginTop: 44, border: `2px solid ${BLACK}`, borderRadius: 0, padding: 44, flex: 1 }, [
      row({ alignItems: 'center' }, [
        h('div', { display: 'flex', width: 76, height: 76, borderRadius: 0, backgroundColor: BLACK, color: WHITE, alignItems: 'center', justifyContent: 'center', fontFamily: 'Pretendard', fontWeight: 900, fontSize: 40 }, initial),
        col({ marginLeft: 24, flex: 1 }, [
          txt(r.name || '', { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 38, color: BLACK }),
          row({ marginTop: 8, alignItems: 'center' }, [
            txt(stars, { display: 'flex', fontFamily: 'Pretendard', fontWeight: 700, fontSize: 30, color: BLACK, letterSpacing: 2 }),
            r.verified ? pill('VERIFIED PURCHASE') && h('div', { display: 'flex', marginLeft: 20, backgroundColor: BLACK, color: WHITE, fontFamily: 'Mono', fontWeight: 700, fontSize: 20, padding: '8px 16px', letterSpacing: 1 }, 'VERIFIED PURCHASE') : null,
          ].filter(Boolean)),
        ]),
      ]),
      h('div', { display: 'flex', height: 1, backgroundColor: '#E0E0E0', marginTop: 28, marginBottom: 28 }, ''),
      h('div', { display: 'flex', marginBottom: 'auto' }, [richText(`“${r.quote || ''}”`, { fontSize: 40, color: BLACK, lineHeight: 1.45 })]),
      col({ marginTop: 28 }, [
        mono(r.source || '', { fontSize: 22, color: SUB }),
        r.source2 ? mono(r.source2, { fontSize: 22, color: SUB, marginTop: 6 }) : null,
      ].filter(Boolean)),
    ].filter(Boolean)),
    s.footnote ? txt(s.footnote, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 38, color: BLACK, marginTop: 36, lineHeight: 1.25 }) : null,
  ].filter(Boolean));
}
function renderCta(s) {
  return frame([
    col({ flex: 1, justifyContent: 'center', alignItems: 'center' }, [
      h('div', { display: 'flex', transform: 'scale(2)', marginBottom: 60 }, [wordmark(WHITE)]),
      s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 64, color: WHITE, textAlign: 'center', lineHeight: 1.15, letterSpacing: -1 }) : null,
      s.body ? h('div', { display: 'flex', marginTop: 24, maxWidth: 800 }, [richText(s.body, { fontSize: 36, color: '#D6D6D6', lineHeight: 1.4, justify: 'center' })]) : null,
      row({ marginTop: 48 }, [pill(`${s.cta || '최다판매구성 추천받기'}  →`, true)]),
    ].filter(Boolean)),
    row({ justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }, [
      mono('THE 500 DALTON RULE', { fontSize: 20, color: '#8A8A8A' }), mono('milli²', { fontSize: 20, color: '#8A8A8A' }),
    ]),
  ], { bg: BLACK });
}
// 실제 후기 스크린샷(캡처)을 그대로 보여주는 슬라이드 — 신뢰 규칙(렌더 가짜카드 금지)
function reviewShot(s, market) {
  return frame([
    row({ justifyContent: 'space-between', alignItems: 'flex-start' }, [wordmark(), marketBadge(market)]),
    s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 52, color: BLACK, lineHeight: 1.08, marginTop: 28, letterSpacing: -1 }) : null,
    s.body ? h('div', { display: 'flex', marginTop: 20 }, [richText(s.body, { fontSize: 34, color: '#2A2A2A', lineHeight: 1.4 })]) : null,
    h('div', { display: 'flex', marginTop: 26, border: `2px solid ${BLACK}`, padding: 24, borderRadius: 0, backgroundColor: WHITE },
      [{ type: 'img', props: { src: s.image, style: { width: W - 160 - 48, objectFit: 'contain' } } }]),
    s.source ? mono(s.source, { fontSize: 22, color: SUB, marginTop: 18 }) : null,
    s.footnote ? txt(s.footnote, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 36, color: BLACK, marginTop: 28, lineHeight: 1.25 }) : null,
    footer(),
  ].filter(Boolean));
}

// 참여 유발 슬라이드(블랙) — 간단하게: 댓글 유도 한 줄 + 저장/공유 한 줄 + CTA (KPI: 댓글 100개)
function renderEngage(s) {
  return frame([
    col({ flex: 1, justifyContent: 'center' }, [
      s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 80, color: WHITE, lineHeight: 1.0, letterSpacing: -2 }) : null,
      s.comment ? h('div', { display: 'flex', marginTop: 36, maxWidth: 900 }, [richText(s.comment, { fontSize: 42, color: WHITE, lineHeight: 1.22 })]) : null,
      s.giveaway ? row({ marginTop: 32, alignItems: 'flex-start', maxWidth: 900 }, [
        h('div', { display: 'flex', backgroundColor: WHITE, color: BLACK, fontFamily: 'Mono', fontWeight: 700, fontSize: 20, padding: '8px 14px', marginRight: 20, letterSpacing: 1 }, 'GIVEAWAY'),
        h('div', { display: 'flex', flex: 1 }, [richText(s.giveaway, { fontSize: 30, color: WHITE, lineHeight: 1.3 })]),
      ]) : null,
      s.sub ? txt(s.sub, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 28, color: '#9A9A9A', marginTop: 34, lineHeight: 1.4 }) : null,
      s.cta ? row({ marginTop: 44 }, [pill(`${s.cta}  →`, true)]) : null,
    ].filter(Boolean)),
    row({ justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }, [
      mono('THE 500 DALTON RULE', { fontSize: 20, color: '#8A8A8A' }), mono('milli²', { fontSize: 20, color: '#8A8A8A' }),
    ]),
  ].filter(Boolean), { bg: BLACK });
}

function renderSlide(s, market) {
  switch (s.type) {
    case 'cover': return renderCover(s, market);
    case 'info': return renderInfo(s);
    case 'review': return reviewCard(s, market);
    case 'reviewshot': return reviewShot(s, market);
    case 'engage': return renderEngage(s);
    case 'cta': return renderCta(s);
    default: return renderInfo(s);
  }
}

// 로컬 이미지 → data URI (sandbox는 URL fetch 막혀서 로컬 임베드)
const localImg = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
const REVIEW_SHOT = localImg('/tmp/ky_review.png'); // 올리브영 실제 후기 스크린샷 캡처(loisnailbeauty, 5★, 화잘먹/흡수)
const PIN_COVER = localImg('/tmp/pin_cover.png');   // 핀터레스트 캡처 — 인물(커버)
const PIN_DEWY = localImg('/tmp/pin_dewy.png');     // 핀터레스트 캡처 — clear glass skin
const PIN_MAKEUP = localImg('/tmp/pin_makeup.png'); // 핀터레스트 캡처 — 메이크업 베이스
const PIN_GLOW = localImg('/tmp/pin_glow.png');     // 핀터레스트 캡처 — 광채 피부
const PIN = 'via Pinterest';

// ── 월요일 KR 정보 카루셀 (millimilli.kr) ──
const MARKET = 'kr';
// 가치형 "베이스 안 들뜨는 5가지" — 진짜 꿀팁이 주(主), 제품은 4번에 은근히 + 실제 후기 증거
const SLIDES = [
  // ① 가치 훅 (히어로)
  { type: 'cover',
    eyebrow: '메이크업 아티스트 꿀팁',
    headline: '파데가\n자꾸\n들떠요?',
    body: '베이스 안 무너지는 5가지 — 1번은 파데 탓이 아니에요.',
    image: PIN_COVER, credit: PIN },
  // ② 실수 1 — 제품 은근히 + 올리브영 실후기 증거
  { type: 'reviewshot',
    headline: '실수 1:\n속건조',
    body: '건조한 피부엔 메이크업이 들떠요. **빠르게 흡수되는 미스트** 먼저 쓰면 결이 정돈돼 화장이 밀착돼요 — 실제 후기:',
    image: REVIEW_SHOT,
    source: '올리브영 · 실구매 후기 · ★4.9 (97)',
    footnote: '(저분자 500달톤이라 초 단위로 스며들어요.)' },
  // ③ 실수 2 (imageRight · 글래스 스킨)
  { type: 'info', variant: 'imageRight',
    headline: '실수 2:\n급했어요',
    body: '스킨케어가 덜 마른 채 파데를 올리면 밀려요. **60초만** 기다렸다 베이스를 올리세요.',
    labels: ['흡수 먼저'],
    source: '02 / 05',
    image: PIN_DEWY, credit: PIN },
  // ④ 실수 3 (imageLeft · 메이크업 베이스)
  { type: 'info', variant: 'imageLeft',
    headline: '실수 3:\n과한 양',
    body: '두껍게 바르는 게 1순위 원인. **얇게 펴고** 문지르지 말고 톡톡 눌러요.',
    labels: ['적을수록 좋아요'],
    source: '03 / 05',
    image: PIN_MAKEUP, credit: PIN },
  // ⑤ 실수 4 (textBig · 텍스트 변주)
  { type: 'info', variant: 'textBig',
    num: '04',
    headline: '제형\n충돌',
    body: '수분 제형과 실리콘 제형이 만나면 **밀려서 뭉쳐요.** 레이어는 단순하게, 하나씩 흡수시키고 올려요.',
    labels: ['제형을 알자'],
    source: '04 / 05' },
  // ⑥ 실수 5 (imageRight · 광채)
  { type: 'info', variant: 'imageRight',
    headline: '실수 5:\n마른 퍼프',
    body: '마른 퍼프로 끌면 다 일어나요. **살짝 적셔서** 톡톡 눌러요. 끌면 들뜸이 시작돼요.',
    labels: ['끌지 말고 누르기'],
    source: '05 / 05',
    image: PIN_GLOW, credit: PIN },
  // ⑦ 참여 — 블랙: 댓글→DM + 추첨 + 구독
  { type: 'engage',
    headline: '당신은\n몇 번?',
    comment: '댓글에 **1~5 번호** 남기면 풀 가이드를 DM으로 보내드려요.',
    giveaway: '매달 댓글 한 분께 **500달톤 시리즈 풀세트** 추첨 선물.',
    sub: '저장해두고 다음 메이크업 때 · 파데 들뜨는 친구 태그.',
    cta: '구독하고 더보기' },
];

const OUT = '/sessions/loving-brave-feynman/mnt/Downloads';
const fonts = await loadFonts();
for (let i = 0; i < SLIDES.length; i++) {
  const svg = await satori(renderSlide(SLIDES[i], MARKET), { width: W, height: H, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  const p = `${OUT}/monday_kr_FINAL_0${i + 1}.png`;
  fs.writeFileSync(p, png);
  console.log('wrote', p);
}
console.log('done');

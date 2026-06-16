// 수요일 프로모 카루셀 프리뷰 렌더 (render_monday v2 톤 재사용 + offer 슬라이드 추가)
// ⚠️ 오퍼 수치는 라이브 미검증 → offer 슬라이드에 "확인 필요" 스탬프. 가짜 가격 렌더 금지.
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';

const W = 1080, H = 1350;
const BLACK = '#0A0A0A', WHITE = '#FFFFFF', GRAY = '#F2F1EE', SUB = '#6B6B6B', WARN = '#C2410C';

let FONTS = null;
async function loadFonts() {
  if (FONTS) return FONTS;
  const f = (p) => fs.readFileSync(p);
  const P = 'node_modules/pretendard/dist/public/static';
  FONTS = [
    { name: 'Pretendard', data: f(`${P}/Pretendard-Black.otf`), weight: 900, style: 'normal' },
    { name: 'Pretendard', data: f(`${P}/Pretendard-Bold.otf`), weight: 700, style: 'normal' },
    { name: 'Pretendard', data: f(`${P}/Pretendard-Regular.otf`), weight: 400, style: 'normal' },
    { name: 'Mono', data: f('node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff'), weight: 700, style: 'normal' },
  ];
  return FONTS;
}

const h = (type, style, children) => ({ type, props: { style, ...(children !== undefined ? { children } : {}) } });
const row = (style, children) => h('div', { display: 'flex', flexDirection: 'row', alignItems: 'center', ...style }, children);
const col = (style, children) => h('div', { display: 'flex', flexDirection: 'column', ...style }, children);
const txt = (s, style) => h('div', { display: 'flex', ...style }, s);
const pill = (s, inv = false, bg) => h('div', { display: 'flex', alignItems: 'center', backgroundColor: bg || (inv ? WHITE : BLACK), color: inv ? BLACK : WHITE, fontFamily: 'Pretendard', fontWeight: 700, fontSize: 30, padding: '12px 26px', lineHeight: 1 }, s);
const HAS_KR = (s) => /[가-힣]/.test(String(s));
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
const footer = (dark=false) => row({ justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }, [
  mono('THE 500 DALTON RULE', { fontSize: 20, color: dark ? '#8A8A8A' : SUB }), mono('milli²', { fontSize: 20, color: dark ? '#8A8A8A' : SUB }),
]);
function frame(children, { bg = WHITE } = {}) {
  return h('div', { width: W, height: H, display: 'flex', flexDirection: 'column', backgroundColor: bg, padding: 80, fontFamily: 'Pretendard', position: 'relative' }, children);
}
const draftStamp = () => h('div', { display: 'flex', position: 'absolute', top: 34, right: 36, border: `2px solid ${WARN}`, color: WARN, fontFamily: 'Mono', fontWeight: 700, fontSize: 18, padding: '6px 12px', letterSpacing: 2, transform: 'rotate(6deg)' }, 'DRAFT · PREVIEW');
function framedImage(src, w, ht, credit) {
  return h('div', { display: 'flex', position: 'relative', width: w, height: ht, overflow: 'hidden', backgroundColor: GRAY }, [
    { type: 'img', props: { src, style: { width: w, height: ht, objectFit: 'cover' } } },
    credit ? h('div', { display: 'flex', position: 'absolute', left: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', color: WHITE, fontFamily: 'Mono', fontWeight: 700, fontSize: 17, padding: '6px 12px', letterSpacing: 1 }, credit) : null,
  ].filter(Boolean));
}
const dividerBar = (w = 120, color=BLACK) => h('div', { display: 'flex', width: w, height: 8, backgroundColor: color, marginTop: 26, marginBottom: 26 }, '');

function renderCover(s) {
  return frame([
    draftStamp(),
    col({}, [
      row({ justifyContent: 'space-between', alignItems: 'center' }, [
        wordmark(BLACK),
        circled(mono(s.badge, { fontSize: 26, color: BLACK, letterSpacing: HAS_KR(s.badge)?0:1 }), HAS_KR(s.badge)?210:250, 34, { padX: 18, padY: 12 }),
      ]),
      h('div', { display: 'flex', height: 1, backgroundColor: '#E3E3E3', marginTop: 20 }, ''),
    ]),
    row({ flex: 1, marginTop: 36, alignItems: 'center' }, [
      col({ flex: 1, paddingRight: 30 }, [
        s.eyebrow ? row({}, [pill(s.eyebrow)]) : null,
        s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 96, color: BLACK, lineHeight: 0.98, letterSpacing: -3, marginTop: s.eyebrow ? 28 : 0 }) : null,
        s.body ? txt(s.body, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 33, color: SUB, marginTop: 28, lineHeight: 1.28 }) : null,
      ].filter(Boolean)),
      s.image ? framedImage(s.image, 380, 880, s.credit) : null,
    ].filter(Boolean)),
    row({ justifyContent: 'space-between', alignItems: 'flex-end' }, [
      mono(s.swipe || 'swipe →', { fontSize: 24, color: SUB }),
      mono('THE 500 DALTON RULE', { fontSize: 20, color: SUB }),
    ]),
  ]);
}
function infoImageSide(s, side) {
  const textCol = col({ flex: 1, ...(side==='right'?{paddingRight:40}:{paddingLeft:40}) }, [
    s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 60, color: BLACK, lineHeight: 1.06, letterSpacing: -1 }) : null,
    dividerBar(100),
    s.body ? richText(s.body, { fontSize: 38, color: '#2A2A2A', lineHeight: 1.45 }) : null,
    s.labels ? col({ marginTop: 32, gap: 14 }, s.labels.map(l => mono(`/ ${l}`, { fontSize: 28 }))) : null,
  ].filter(Boolean));
  const img = s.image ? framedImage(s.image, 360, 820, s.credit) : null;
  return frame([
    draftStamp(),
    row({ justifyContent: 'space-between', alignItems: 'flex-start' }, [wordmark(), s.source ? mono(s.source, { fontSize: 22, color: SUB }) : null].filter(Boolean)),
    row({ flex: 1, marginTop: 36, alignItems: 'center' }, side==='right' ? [textCol, img].filter(Boolean) : [img, textCol].filter(Boolean)),
    footer(),
  ]);
}
function infoTextBig(s) {
  return frame([
    draftStamp(),
    row({ justifyContent: 'space-between', alignItems: 'flex-start' }, [wordmark(), s.source ? mono(s.source, { fontSize: 22, color: SUB }) : null].filter(Boolean)),
    col({ flex: 1, justifyContent: 'center' }, [
      s.num ? txt(s.num, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 200, color: '#EFEDEA', lineHeight: 0.9, letterSpacing: -6 }) : null,
      s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 88, color: BLACK, lineHeight: 1.0, letterSpacing: -2, marginTop: 16 }) : null,
      dividerBar(),
      s.body ? richText(s.body, { fontSize: 46, color: '#2A2A2A', lineHeight: 1.45 }) : null,
    ].filter(Boolean)),
    footer(),
  ]);
}
function renderOffer(s) {
  return frame([
    draftStamp(),
    row({ justifyContent: 'space-between', alignItems: 'flex-start' }, [wordmark(), pill(s.verify, false, WARN)]),
    s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 64, color: BLACK, lineHeight: 1.04, marginTop: 30, letterSpacing: -1 }) : null,
    col({ marginTop: 36, border: `3px solid ${BLACK}`, padding: 48, flex: 1, justifyContent: 'center' }, [
      s.priceLabel ? txt(s.priceLabel, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 32, color: SUB }) : null,
      row({ alignItems: 'center', marginTop: 6 }, [
        circled(txt(s.price, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 110, color: BLACK, letterSpacing: -3 }), s.priceW || 430, 110, { padX: 26, padY: 14 }),
      ]),
      s.was ? txt(s.was, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 34, color: SUB, marginTop: 18, textDecoration: 'line-through' }) : null,
      dividerBar(140),
      col({ gap: 18 }, s.perks.map(p => row({ alignItems: 'center' }, [
        h('div', { display:'flex', width: 16, height: 16, backgroundColor: BLACK, marginRight: 20 }, ''),
        h('div', { display:'flex', flex:1 }, [richText(p, { fontSize: 36, color: BLACK, lineHeight: 1.3 })]),
      ]))),
    ].filter(Boolean)),
    s.deadline ? txt(s.deadline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 40, color: WARN, marginTop: 30 }) : null,
    footer(),
  ]);
}
function renderEngage(s) {
  return frame([
    col({ flex: 1, justifyContent: 'center' }, [
      s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 84, color: WHITE, lineHeight: 1.0, letterSpacing: -2 }) : null,
      s.comment ? h('div', { display: 'flex', marginTop: 36, maxWidth: 900 }, [richText(s.comment, { fontSize: 42, color: WHITE, lineHeight: 1.22 })]) : null,
      s.giveaway ? row({ marginTop: 32, alignItems: 'flex-start', maxWidth: 900 }, [
        h('div', { display: 'flex', backgroundColor: WHITE, color: BLACK, fontFamily: 'Mono', fontWeight: 700, fontSize: 20, padding: '8px 14px', marginRight: 20, letterSpacing: 1 }, 'GIVEAWAY'),
        h('div', { display: 'flex', flex: 1 }, [richText(s.giveaway, { fontSize: 30, color: WHITE, lineHeight: 1.3 })]),
      ]) : null,
      s.sub ? txt(s.sub, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 28, color: '#9A9A9A', marginTop: 34, lineHeight: 1.4 }) : null,
      s.cta ? row({ marginTop: 44 }, [pill(`${s.cta}  →`, true)]) : null,
    ].filter(Boolean)),
    footer(true),
  ], { bg: BLACK });
}
function renderSlide(s) {
  switch (s.type) {
    case 'cover': return renderCover(s);
    case 'right': return infoImageSide(s, 'right');
    case 'left': return infoImageSide(s, 'left');
    case 'big': return infoTextBig(s);
    case 'offer': return renderOffer(s);
    case 'engage': return renderEngage(s);
    default: return infoTextBig(s);
  }
}

const D = '/sessions/lucid-awesome-turing/mnt/Downloads';
const localImg = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
const MIST_KR = localImg(`${D}/미스트 누끼컷.png`);
const MIST_US = localImg(`${D}/프로틴미스트_리뉴얼_16.png`);
const MIST_SET = localImg(`${D}/프로틴미스트더블세트_5.png`);

// ───────────────────────── KR (millimilli.kr / 올리브영) ─────────────────────────
const KR = [
  { type:'cover', badge:'이번 주 한정', eyebrow:'재구매 1위 미스트',
    headline:'왜\n자꾸\n또 사요?', body:'다 쓰기도 전에 또 담는 미스트 — 이번 주 혜택, 끝까지 보세요. (스와이프)',
    image: MIST_KR, credit:'millimilli', swipe:'혜택 보기 →' },
  { type:'big', num:'500', headline:'미스트인데\n안 날아가요', source:'01 / 04',
    body:'분자 **500달톤**이라 위로 뜨지 않고 **속으로** 스며요. 뿌리는 순간 결이 정돈돼요.' },
  { type:'right', headline:'왜 다들\n담아뒀나', source:'02 / 04',
    body:'관심만 **31만+**. 화장 들뜸·속건조 때문에 “하나 사두자” 하는 사람들. 그 이유는 다음 장 혜택.',
    labels:['관심 319,937명*'], image: MIST_SET, credit:'millimilli' },
  { type:'offer', verify:'⚠ 라이브 재확인(수)', headline:'이번 주\n오퍼',
    priceLabel:'1+1 한 병당', price:'24,900', priceW:430, was:'정가 38,000원',
    perks:['**1+1** — 한 병 가격에 두 병 (**34% 혜택**)','**5만원↑ 무료배송** · 당일출발(14시 전)','**7만원↑ 앰플 증정**'],
    deadline:'이번 주 마감 · 재입고는 미정' },
  { type:'engage', headline:'세트 vs\n단품,\n너는?',
    comment:'댓글에 **세트** 또는 **단품** 남기면 너한테 맞는 구성 골라 **DM**으로 보내줄게.',
    giveaway:'댓글 단 분 중 매달 **한 분께 미스트 1+1** 추첨 선물.',
    sub:'지금 미스트 떨어진 친구 **태그** · 마감 전 **저장** · 다음 혜택 놓치기 싫으면 **팔로우**.',
    cta:'프로필 링크로 받기' },
];
// ───────────────────────── US (Amazon) ─────────────────────────
const US = [
  { type:'cover', badge:'THIS WEEK', eyebrow:'THE RE-BUY MIST',
    headline:'ONE\nMORE\nMIST?', body:'People keep re-ordering before the bottle is even empty. The reason + this week deal — keep swiping.',
    image: MIST_US, credit:'millimilli', swipe:'see the deal →' },
  { type:'big', num:'500', headline:'SMALLER\nTHAN YOUR\nPORES', source:'01 / 04',
    body:'A **500 Dalton** molecule — small enough to **sink in**, not sit on top. It absorbs the second you spray.' },
  { type:'left', headline:'A MIST THAT\nABSORBS', source:'02 / 04',
    body:'Most mists evaporate and leave you drier. This one **locks moisture under** makeup — that is the re-buy reason.',
    labels:['Amazon · rating: verify live'], image: MIST_SET, credit:'millimilli' },
  { type:'offer', verify:'⚠ VERIFY LIVE (WED)', headline:'THIS WEEK\nDEAL',
    priceLabel:'Amazon price', price:'$ — . —', priceW:430, was:'list: $ — —',
    perks:['**— % off** — confirm on the product page','**Free bonus item** — if running this week','**Prime** FREE delivery — check ETA'],
    deadline:'Fill from live capture before publish' },
  { type:'engage', headline:'ONE MIST,\nOR TWO? 👇',
    comment:'Drop **1** or **2** in the comments and I will DM you the routine that fits.',
    giveaway:'One commenter each month wins a **full 500 Dalton set**.',
    sub:'**Tag** a friend whose makeup keeps cracking · **Save** before it sells out · **Follow** for the next drop.',
    cta:'Shop via link in bio' },
];

const fonts = await loadFonts();
async function renderSet(slides, prefix) {
  for (let i = 0; i < slides.length; i++) {
    const svg = await satori(renderSlide(slides[i]), { width: W, height: H, fonts });
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
    const p = `${D}/${prefix}_0${i + 1}.png`;
    fs.writeFileSync(p, png);
    console.log('wrote', p);
  }
}
await renderSet(KR, 'wed_promo_KR_preview');
await renderSet(US, 'wed_promo_US_preview');
console.log('done');

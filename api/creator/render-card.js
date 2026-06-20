// §7 — Designed 카드뉴스 렌더러. {slides, market, draftId} → 1080×1350 브랜드 카드 PNG들 → Blob → draft.mediaUrls.
// 브랜드 무드(Downloads/MILLIMILLI_브랜드디자인무드.md): 흑백 모노크롬, milli² 워드마크, 초대형 볼드 숫자,
//   모노스페이스 스펙 라벨, 블랙 필 라벨, 슬래시/밑줄 스펙, 출처 작게.
// 기술: satori(VDOM→SVG) + @resvg/resvg-js(SVG→PNG). 웹폰트 임베드.
//
// 인증: Cowork 가 호출 → 미들웨어 예외 + Bearer CREATOR_INGEST_SECRET.
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { put } from '@vercel/blob';
import { getSupabase } from '../../lib/supabase.js';

export const config = { maxDuration: 120 };

const W = 1080, H = 1350;
// 디자인 확정 컬러(carousel-design-format.md): 화이트/블랙/쿨그레이 배경/보조텍스트. 따뜻한 베이지 금지.
const BLACK = '#0A0A0A', WHITE = '#FFFFFF', GRAY = '#F7F6F4', SUB = '#9A9A95';
const LOGO_URL = 'https://zre3xstenznneqve.public.blob.vercel-storage.com/capture/milli_logo-S5AYbqtEpiw6igBWtUm0MPNMpgXZEf.png';
const FONT = 'NotoSansKR'; // 단일 폰트(Noto Sans KR). 강조=두께(300/500/700). 900 금지.

// ── 폰트 로드(모듈 캐시) ──
// Noto Sans KR 정적 woff(weight 300/500/700) — jsdelivr fontsource. woff 실패 시 구글 otf 폴백.
let FONTS = null;
export async function loadFonts() {
  if (FONTS) return FONTS;
  const f = async (u) => Buffer.from(await (await fetch(u)).arrayBuffer());
  const FS = 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-kr@latest';
  // 구글 정적 otf 폴백(weight별). woff 가 satori 에서 실패할 때 사용.
  const GF = 'https://cdn.jsdelivr.net/gh/google/fonts/raw/main/ofl/notosanskr';
  const tryWeight = async (w) => {
    try { return await f(`${FS}/korean-${w}-normal.woff`); }
    catch (e1) {
      try { return await f(`${GF}/NotoSansKR%5Bwght%5D.ttf`); } // 가변(폴백)
      catch (e2) { throw new Error(`font ${w} load fail: ${e1.message} / ${e2.message}`); }
    }
  };
  const [light, medium, bold] = await Promise.all([
    tryWeight(300),
    tryWeight(500),
    tryWeight(700),
  ]);
  FONTS = [
    { name: FONT, data: light, weight: 300, style: 'normal' },  // 본문/약함
    { name: FONT, data: medium, weight: 500, style: 'normal' }, // 기본
    { name: FONT, data: bold, weight: 700, style: 'normal' },   // 강조(최대 두께)
  ];
  return FONTS;
}

// 폰트 글리프 안전화 — Noto Sans KR woff 서브셋에 화살표(→ ⟶ 등)가 없어 notdef(⊠)로 깨짐.
//   렌더 가능한 글자로 치환: 가로 화살표 → '›'(쉐브론), 세로/양방향 → '·'. LLM·디자인 리터럴 모두 방어.
const sx = (s) => (typeof s === 'string')
  ? s.replace(/[→➔➜➝➞➡➙⇒⇨⟶⟹⮕➝➔➜►▶▸]/g, '›')
     .replace(/[←↑↓↔↕⇐⇓⟵⬅⬆⬇]/g, '·')
     // 이모지 제거 — Noto Sans KR 에 이모지 글리프 없어 notdef(⊠) 박스로 깨짐. 카드는 흑백 미니멀이라 이모지 안 씀(이모지는 인스타 캡션에만).
     //   기호/딩뱃/국기/변형선택자/ZWJ 광범위 제거. (milli²의 ²=U+00B2, 가운뎃점 ·=U+00B7 은 범위 밖이라 안전)
     .replace(/[\u{1F000}-\u{1FAFF}\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{2122}\u{2139}]/gu, '')
     .replace(/\*\*/g, '') // 헤드라인/라벨에 새어든 마크다운 볼드 마커 제거. (richText 는 sx(str) 전체 적용 대신 ** 를 먼저 파싱 후 세그먼트별 sx 호출 → 볼드 위계 유지)
     .replace(/\s+([.,!?])/g, '$1') // 이모지/강조 제거 후 남는 부호 앞 공백 정리
     .trimEnd()
  : s;

// ── 하이퍼스크립트 (satori VDOM) ──
const h = (type, style, children) => ({ type, props: { style, ...(children !== undefined ? { children } : {}) } });
const row = (style, children) => h('div', { display: 'flex', flexDirection: 'row', alignItems: 'center', ...style }, children);
const col = (style, children) => h('div', { display: 'flex', flexDirection: 'column', ...style }, children);
// txt: 문자열은 sx()로 화살표·마크다운(**) 정화. wordBreak:'keep-all'로 한글 단어가 음절 단위로 안 쪼개짐(satori 지원).
//   richText 는 직접 segment 를 만들어 txt 를 호출하므로 keep-all 동일 적용(단어 단위 wrap 유지).
const txt = (s, style) => h('div', { display: 'flex', wordBreak: 'keep-all', ...style }, sx(s));
// 한글 헤드라인 줄바꿈 안전 — satori는 keep-all을 CJK에 안 먹여 음절 중간('건조'→'건/조')에서 쪼갬.
//   → 어절(공백) 단위 노드로 쪼개 flexWrap 컨테이너에 넣으면 '단어 통째로' 줄바꿈됨(richText/headlineWithEmphasis와 동일 방식).
//   구 렌더러(renderCover/Info/Review/Cta)가 단일 문자열을 txt에 넘겨 깨지던 문제 해결.
const headlineText = (s, { fontFamily = FONT, fontWeight = 700, fontSize, color = BLACK, lineHeight = 1.1, letterSpacing = -1, align = 'flex-start', marginTop } = {}) =>
  h('div', { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: align, ...(marginTop !== undefined ? { marginTop } : {}) },
    String(s ?? '').split(/\s+/).filter(Boolean).map(w =>
      txt(w, { fontFamily, fontWeight, fontSize, color, lineHeight, letterSpacing,
        marginRight: Math.round(fontSize * 0.24), marginBottom: Math.round(fontSize * 0.12) })));

// 블랙 필 라벨
const pill = (s, inv = false) => h('div', {
  display: 'flex', alignItems: 'center', backgroundColor: inv ? WHITE : BLACK, color: inv ? BLACK : WHITE,
  fontFamily: FONT, fontWeight: 700, fontSize: 30, padding: '12px 26px', borderRadius: 0, lineHeight: 1,
}, sx(s));
// 스펙 라벨(모노 폐지 → 단일 폰트 medium + letterSpacing 으로 모노 느낌)
const mono = (s, style) => txt(s, { fontFamily: FONT, fontWeight: 500, fontSize: 26, color: BLACK, letterSpacing: 1, ...style });

// 리치텍스트 — `**강조**`=볼드(700), 나머지=라이트(300). 단어 단위 flexWrap 으로 흐름.
//   ⚠️ sx()는 **를 제거하므로 여기서 sx(str) 전체 적용 금지(볼드 파싱이 깨짐).
//   → 원문(str)에서 ** 를 먼저 파싱한 뒤, 세그먼트 텍스트에만 sx 적용(화살표·notdef 글리프 방어. ** 는 이미 분리됨).
function richText(str, { fontSize, color, lineHeight = 1.5, justify = 'flex-start' } = {}) {
  str = String(str ?? '');
  const segs = []; const re = /\*\*(.+?)\*\*/g; let last = 0, m;
  while ((m = re.exec(str))) { if (m.index > last) segs.push({ t: str.slice(last, m.index), b: false }); segs.push({ t: m[1], b: true }); last = re.lastIndex; }
  if (last < str.length) segs.push({ t: str.slice(last), b: false });
  const words = segs.flatMap(s => s.t.split(/\s+/).filter(Boolean).map(w => ({ w, b: s.b })));
  return h('div', { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: justify },
    words.map(x => txt(x.w, { fontFamily: FONT, fontWeight: x.b ? 700 : 300, fontSize, color, lineHeight, marginRight: Math.round(fontSize * 0.28), marginBottom: Math.round(fontSize * 0.18) })));
}

// 손그림 거친 강조 마크 — 매번 다르게(변주 4종 랜덤): 타원2·이중루프·손그림박스. img(data:svg)로 오버레이.
//   variant 인자로 고정 가능(테스트/특정 변주). 미지정 시 랜덤(카드마다 다른 동그라미).
function roughEllipseSvg(w, h, color, variant = null) {
  const variants = [
    // v0 — 기본 거친 타원(살짝 비뚤·오버슛)
    `M ${w * .52} ${h * .1} C ${w * .92} ${h * .04} ${w * 1.0} ${h * .62} ${w * .56} ${h * .9} C ${w * .12} ${h * 1.04} ${w * .0} ${h * .42} ${w * .46} ${h * .12} C ${w * .62} ${h * .04} ${w * .8} ${h * .08} ${w * .9} ${h * .2}`,
    // v1 — 반대 기울기 타원
    `M ${w * .48} ${h * .12} C ${w * .08} ${h * .04} ${w * .0} ${h * .6} ${w * .46} ${h * .9} C ${w * .9} ${h * 1.05} ${w * 1.02} ${h * .4} ${w * .56} ${h * .1} C ${w * .4} ${h * .02} ${w * .2} ${h * .08} ${w * .12} ${h * .22}`,
    // v2 — 이중 루프(스크리블, 두 바퀴)
    `M ${w * .5} ${h * .14} C ${w * .9} ${h * .05} ${w * .98} ${h * .6} ${w * .55} ${h * .88} C ${w * .13} ${h * 1.02} ${w * .04} ${h * .45} ${w * .45} ${h * .16} C ${w * .72} ${h * .0} ${w * 1.0} ${h * .34} ${w * .64} ${h * .82}`,
    // v3 — 손그림 둥근 사각 박스
    `M ${w * .12} ${h * .3} C ${w * .1} ${h * .08} ${w * .4} ${h * .06} ${w * .62} ${h * .08} C ${w * .86} ${h * .1} ${w * .95} ${h * .14} ${w * .92} ${h * .44} C ${w * .95} ${h * .72} ${w * .88} ${h * .92} ${w * .58} ${h * .9} C ${w * .33} ${h * .94} ${w * .08} ${h * .9} ${w * .1} ${h * .64} C ${w * .08} ${h * .48} ${w * .1} ${h * .42} ${w * .12} ${h * .3}`,
  ];
  const i = variant != null ? (variant % variants.length) : Math.floor(Math.random() * variants.length);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><path d="${variants[i]}" fill="none" stroke="${color}" stroke-width="${Math.max(4, w * .014)}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
// 별 아이콘(★) — Noto Sans KR 서브셋에 ★/☆/✦ 등 별 글리프가 없어 ⊠(notdef)로 깨짐(실측 확인).
//   → SVG 5각별 이미지로 대체(폰트 무관, 항상 렌더). AMAZON 평점 배지 등에 사용.
function starSvg(color = BLACK) {
  const pts = '12,2 14.47,8.6 21.51,8.91 15.99,13.3 17.88,20.09 12,16.2 6.12,20.09 8.01,13.3 2.49,8.91 9.53,8.6';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="${pts}" fill="${color}"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
const starIcon = (size = 26, color = BLACK) => ({ type: 'img', props: { src: starSvg(color), style: { width: size, height: size, marginLeft: 4, marginRight: 2 } } });
// 체크 아이콘(✓) — 본문 체크리스트용. ✓ 글리프 서브셋 누락 방지로 SVG.
function checkSvg(color = BLACK) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4.5 13 L9.5 18 L19.5 6" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
const checkIcon = (size = 38, color = BLACK) => ({ type: 'img', props: { src: checkSvg(color), style: { width: size, height: size, marginRight: 20, marginTop: 6 } } });
// 본문 인포그래픽 아이콘 세트(라인) — 포인트 내용에 맞는 아이콘 배지로 한눈에 스캔.
const BODY_ICONS = {
  check: 'M4 13 l5 5 l11 -12',
  drop: 'M12 3 C12 3 6 10.5 6 15 a6 6 0 0 0 12 0 C18 10.5 12 3 12 3 Z',
  shield: 'M12 3 L20 6 V12 C20 16.5 16.5 19.5 12 21 C7.5 19.5 4 16.5 4 12 V6 Z',
  layers: 'M12 4 L20 8 L12 12 L4 8 Z M4 12 L12 16 L20 12',
  clock: 'M12 4 a8 8 0 1 0 0.01 0 M12 8 V12.5 L15.5 14',
  sun: 'M12 8.5 a3.5 3.5 0 1 0 0.01 0 M12 2 V4 M12 20 V22 M2 12 H4 M20 12 H22 M5 5 L6.4 6.4 M17.6 17.6 L19 19 M19 5 L17.6 6.4 M6.4 17.6 L5 19',
  moon: 'M20 14 A8 8 0 1 1 10 4 A6.5 6.5 0 0 0 20 14 Z',
  leaf: 'M5 19 C5 11 11 5 19 5 C19 13 13 19 5 19 Z M6 18 C10 14 13 11 16 9',
  sparkle: 'M12 3 L13.6 10.4 L21 12 L13.6 13.6 L12 21 L10.4 13.6 L3 12 L10.4 10.4 Z',
  lock: 'M8 11 V8 a4 4 0 0 1 8 0 V11 M6 11 H18 V20 H6 Z',
  up: 'M12 20 V5 M6 11 L12 5 L18 11',
  alert: 'M12 3 L22 20 H2 Z M12 9 V14.5 M12 17.2 V17.4',
  x: 'M6 6 L18 18 M18 6 L6 18',
};
function iconSvg(name, color = BLACK) {
  const d = BODY_ICONS[name] || BODY_ICONS.check;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
const iconBadge = (name, { size = 72, icon = 40, bg = '#F1F1EE', color = BLACK } = {}) =>
  h('div', { display: 'flex', width: size, height: size, borderRadius: Math.round(size / 2), backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginRight: 24, flexShrink: 0 }, [
    { type: 'img', props: { src: iconSvg(name, color), style: { width: icon, height: icon } } },
  ]);
// 텍스트 렌더 폭 추정(satori measure 불가) — 숫자/영문 ≈0.58em, 한글 등 ≈1.0em. 동그라미 크기 산정용.
const estTextW = (str, fs) => [...String(str ?? '')].reduce((a, c) => a + fs * (/[0-9A-Za-z.,%$+\-:]/.test(c) ? 0.58 : 1.0), 0);
// node 를 손그림 원으로 감쌈 (pad: 타원이 텍스트보다 얼마나 클지)
function circled(node, w, ht, { color = BLACK, padX = 34, padY = 26 } = {}) {
  return h('div', { display: 'flex', position: 'relative', alignItems: 'center', justifyContent: 'center', padding: `${padY}px ${padX}px` }, [
    node,
    { type: 'img', props: { src: roughEllipseSvg(w + padX * 2, ht + padY * 2, color), style: { position: 'absolute', left: 0, top: 0, width: w + padX * 2, height: ht + padY * 2 } } },
  ]);
}

// 로고 이미지(작게). milli² 타이포 박지 않고 로고 파일 사용.
const logoImg = (height = 32) => ({ type: 'img', props: { src: LOGO_URL, style: { height, objectFit: 'contain' } } });
// 텍스트 워드마크(폴백·기존 슬라이드 호환). 두께 700 한도.
const wordmark = (color = BLACK) => row({ alignItems: 'flex-start' }, [
  txt('milli', { fontFamily: FONT, fontWeight: 700, fontSize: 40, color, letterSpacing: -1 }),
  txt('2', { fontFamily: FONT, fontWeight: 700, fontSize: 22, color, marginTop: 2 }),
]);

const marketBadge = (market) =>
  market === 'us'
    ? pill(['AMAZON  4.8', starIcon(28, WHITE)]) // ★는 SVG 별 아이콘(흰색, 검정 pill 위)
    : pill('OLIVE YOUNG 1위');

const footer = () => row({ justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }, [
  mono('500 DALTON PROTEIN SERIES', { fontSize: 20, color: SUB }),
  mono('milli²', { fontSize: 20, color: SUB }),
]);

// ── 슬라이드 프레임 ──
function frame(children, { bg = WHITE } = {}) {
  return h('div', {
    width: W, height: H, display: 'flex', flexDirection: 'column', backgroundColor: bg,
    padding: 80, fontFamily: FONT,
  }, children);
}

function slideImage(src, style) {
  if (!src) return null;
  return { type: 'img', props: { src, style: { objectFit: 'cover', ...style } } };
}

// ── 슬라이드 타입별 ──
// 미니멀 에디토리얼 리디자인 (첫 PIL 시안 기준): 실제 로고 + 모노 평점 + 헤드라인 지배 + 아웃라인 라벨 1개 + 작은 제품 액센트 + swipe
function renderCover(s, market) {
  // 평점 노드 — US 는 ★를 SVG 별 아이콘으로(폰트 글리프 없음). KR 은 텍스트.
  const ratingNode = market === 'us'
    ? row({}, [
        mono('4.8', { fontSize: 27, color: BLACK, letterSpacing: 1 }),
        starIcon(26, BLACK),
        mono('AMAZON US', { fontSize: 27, color: BLACK, letterSpacing: 1, marginLeft: 4 }),
      ])
    : mono('OLIVE YOUNG 1위', { fontSize: 27, color: BLACK, letterSpacing: 1 });
  const spec = (s.labels && s.labels.length) ? s.labels.join('   /   ') : (market === 'us' ? '500 DALTON   /   30+ PROTEIN' : '500 DALTON   /   단백질 29가지');
  return frame([
    // 상단: 실제 milli² 로고 + 모노 평점(필❌) + 얇은 구분선
    col({}, [
      row({ justifyContent: 'space-between', alignItems: 'center' }, [
        logoImg(40),
        // 손그림 원 포인트(핵심 수치) — 평점에 거친 타원 오버레이
        circled(ratingNode, 250, 34, { padX: 18, padY: 12 }),
      ]),
      h('div', { display: 'flex', height: 1, backgroundColor: '#E3E3E3', marginTop: 20 }, ''),
    ]),
    // 헤드라인 지배(초대형) + 짧은 서브 1줄
    col({ marginTop: 64 }, [
      s.headline ? headlineText(s.headline, { fontSize: 100, lineHeight: 1.04, letterSpacing: -3 }) : null,
      s.body ? txt(s.body, { fontFamily: FONT, fontWeight: 300, fontSize: 36, color: SUB, marginTop: 30, wordBreak: 'keep-all' }) : null,
      // 아웃라인 박스 라벨 1개 (필❌)
      h('div', { display: 'flex', alignSelf: 'flex-start', marginTop: 44, border: `2px solid ${BLACK}`, borderRadius: 0, padding: '16px 24px' }, [mono(spec, { fontSize: 27 })]),
    ].filter(Boolean)),
    // 하단: 작은 제품 액센트(우측) + swipe (좌측) — 헤드라인이 주인공
    row({ marginTop: 'auto', justifyContent: 'space-between', alignItems: 'flex-end' }, [
      mono('swipe →', { fontSize: 24, color: SUB }),
      s.image
        ? h('div', { display: 'flex', width: 300, height: 380, borderRadius: 0, overflow: 'hidden' }, [slideImage(s.image, { width: 300, height: 380 })])
        : mono('milli²', { fontSize: 22, color: '#C7C7CC' }),
    ]),
  ]);
}

function renderInfo(s) {
  return frame([
    row({ justifyContent: 'space-between', alignItems: 'flex-start' }, [wordmark(), s.source ? mono(s.source, { fontSize: 22, color: SUB }) : null].filter(Boolean)),
    col({ marginTop: 48, flex: 1 }, [
      s.headline ? headlineText(s.headline, { fontSize: 68, lineHeight: 1.1, letterSpacing: -1 }) : null,
      h('div', { display: 'flex', width: 120, height: 8, backgroundColor: BLACK, marginTop: 28, marginBottom: 28 }, ''),
      s.body ? richText(s.body, { fontSize: 42, color: '#2A2A2A', lineHeight: 1.5 }) : null, // 리치텍스트(**강조**=볼드)
      (s.labels && s.labels.length) ? col({ marginTop: 36, gap: 16 }, s.labels.map(l => mono(`/ ${l}`, { fontSize: 30 }))) : null,
    ].filter(Boolean)),
    // §5 info 슬라이드 이미지(후기 캡처 등) — 전체 보이게 contain(크롭 금지)
    s.image ? h('div', { display: 'flex', width: '100%', height: 460, overflow: 'hidden', backgroundColor: GRAY, marginBottom: 24, justifyContent: 'center' }, [slideImage(s.image, { width: W - 160, height: 460, objectFit: 'contain' })]) : null,
    footer(),
  ].filter(Boolean));
}

// 후기 캡처 슬라이드(review / reviewshot). ⚠️ 후기 이미지는 반드시 objectFit:'contain'(세로 비율 잘림 금지).
//   후기 캡처를 cover/info 같은 cover-크롭 슬라이드에 넣지 말 것 — 후기는 이 타입에만.
function renderReview(s, market) {
  return frame([
    row({ justifyContent: 'space-between', alignItems: 'flex-start' }, [wordmark(), marketBadge(market)]),
    s.headline ? headlineText(s.headline, { fontSize: 56, lineHeight: 1.1, letterSpacing: -1, marginTop: 40 }) : null,
    s.image ? h('div', { display: 'flex', marginTop: 36, width: '100%', height: 720, borderRadius: 0, overflow: 'hidden', backgroundColor: GRAY, border: `2px solid ${BLACK}` }, [slideImage(s.image, { width: W - 160, height: 720, objectFit: 'contain' })]) : null,
    s.source ? mono(`출처 · ${s.source}`, { fontSize: 24, color: SUB, marginTop: 24 }) : null,
    footer(),
  ].filter(Boolean));
}

// §4 — CTA 블랙 반전: 배경 #0A0A0A + 화이트 텍스트/로고/필 반전
function renderCta(s) {
  return frame([
    col({ flex: 1, justifyContent: 'center', alignItems: 'center' }, [
      h('div', { display: 'flex', transform: 'scale(2)', marginBottom: 60 }, [wordmark(WHITE)]),
      s.headline ? headlineText(s.headline, { fontSize: 64, color: WHITE, lineHeight: 1.15, letterSpacing: -1, align: 'center' }) : null,
      s.body ? h('div', { display: 'flex', marginTop: 24, maxWidth: 800 }, [richText(s.body, { fontSize: 36, color: '#D6D6D6', lineHeight: 1.4, justify: 'center' })]) : null,
      row({ marginTop: 48 }, [pill(`${s.cta || '최다판매구성 추천받기'}  →`, true)]), // 반전 필(흰 배경·검정 글씨)
    ].filter(Boolean)),
    // 블랙 위 라이트 푸터
    row({ justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }, [
      mono('500 DALTON PROTEIN SERIES', { fontSize: 20, color: '#8A8A8A' }),
      mono('milli²', { fontSize: 20, color: '#8A8A8A' }),
    ]),
  ], { bg: BLACK });
}

// ───────────────────────────────────────────────────────────────────────────
// 신규 디자인 포맷 렌더러 (carousel-design-format.md 최종본)
//   slide 필드: { type, headline, body, sub, num, image, emphasis, labels, source }
//   강조 = 두께 위계(300/500/700). 사인펜 동그라미 = 카드당 최대 1곳(emphasis 있을 때만).
// ───────────────────────────────────────────────────────────────────────────

// 헤드라인을 단어 단위로 렌더하되, emphasis 단어 1개에만 사인펜 동그라미.
//   - 글자폭 추정으로 타원 크기를 잡음(satori는 measure 불가 → 휴리스틱).
function headlineWithEmphasis(headline, { fontSize, color = BLACK, lineHeight = 1.04, letterSpacing = -2, circleColor = BLACK } = {}) {
  const emph = (headline.emphasis || '').trim();
  const text = (headline.text || '').trim();
  if (!emph || !text.includes(emph)) {
    return headlineText(text || headline, { fontSize, color, lineHeight, letterSpacing });
  }
  // emphasis 기준 분할(앞/강조/뒤) → 단어 흐름. 강조어만 circled.
  const idx = text.indexOf(emph);
  const before = text.slice(0, idx);
  const after = text.slice(idx + emph.length);
  const mk = (w) => txt(w, { fontFamily: FONT, fontWeight: 700, fontSize, color, lineHeight, letterSpacing, marginRight: Math.round(fontSize * 0.24) });
  const parts = [];
  before.split(/\s+/).filter(Boolean).forEach(w => parts.push(mk(w)));
  // 강조어: 글자수 기반 폭 추정(한글/영문 평균). 타원이 단어를 충분히 감싸도록 0.7 로 넉넉히.
  const charW = fontSize * 0.7;
  const ew = Math.max(fontSize, Math.round(emph.length * charW));
  // circled 노드를 div 로 감싸 좌우 여백 확보(인접 단어와 동그라미 겹침 방지).
  parts.push(h('div', { display: 'flex', marginLeft: Math.round(fontSize * 0.14), marginRight: Math.round(fontSize * 0.32) }, [
    circled(
      txt(emph, { fontFamily: FONT, fontWeight: 700, fontSize, color, lineHeight, letterSpacing }),
      ew, Math.round(fontSize * 1.05), { color: circleColor, padX: 24, padY: 18 }
    ),
  ]));
  after.split(/\s+/).filter(Boolean).forEach(w => parts.push(mk(w)));
  // 줄바꿈 시 동그라미가 위/아래 줄을 침범하지 않도록 줄 간격 확보.
  return h('div', { display: 'flex', flexWrap: 'wrap', alignItems: 'center', lineHeight, rowGap: Math.round(fontSize * 0.35) }, parts);
}

// headline 인자 정규화: 문자열 or {text,emphasis} 모두 허용.
const hl = (s) => {
  const z = (t) => (typeof t === 'string' ? t.replace(/\*\*/g, '') : t);
  return (typeof s.headline === 'object' && s.headline)
    ? { ...s.headline, text: z(s.headline.text), emphasis: z(s.headline.emphasis) }
    : { text: z(s.headline || ''), emphasis: z(s.emphasis || '') };
};

// 사진 박스(직각, 라운드 금지)
const photo = (src, w, ht, extra = {}) =>
  h('div', { display: 'flex', width: w, height: ht, overflow: 'hidden', backgroundColor: GRAY, borderRadius: 0, ...extra },
    src ? [slideImage(src, { width: typeof w === 'number' ? w : W, height: ht })] : []);

// ── 커버: 풀이미지 + 하단 훅 ──
function renderCoverFullimage(s) {
  const head = hl(s);
  return h('div', { width: W, height: H, display: 'flex', position: 'relative', backgroundColor: BLACK, fontFamily: FONT },
    [
      s.image ? slideImage(s.image, { position: 'absolute', left: 0, top: 0, width: W, height: H }) : null,
      // 하단 가독용 그라데이션 대용 — 반투명 블랙 바
      h('div', { display: 'flex', position: 'absolute', left: 0, bottom: 0, width: W, height: 540, backgroundColor: 'rgba(10,10,10,0.45)' }, ''),
      // 상단 로고
      h('div', { display: 'flex', position: 'absolute', left: 80, top: 72 }, [logoImg(34)]),
      // 하단 훅(흰색, 두께 위계 + 강조어 동그라미)
      h('div', { display: 'flex', flexDirection: 'column', position: 'absolute', left: 80, right: 80, bottom: 96, width: W - 160 }, [
        head.emphasis
          ? headlineWithEmphasis(head, { fontSize: 84, color: WHITE, lineHeight: 1.06, letterSpacing: -2, circleColor: WHITE })
          : txt(head.text, { fontFamily: FONT, fontWeight: 700, fontSize: 84, color: WHITE, lineHeight: 1.06, letterSpacing: -2 }),
        s.sub ? txt(s.sub, { fontFamily: FONT, fontWeight: 300, fontSize: 34, color: '#E8E8E6', marginTop: 22 }) : null,
      ].filter(Boolean)),
    ].filter(Boolean));
}

// ── 커버: 텍스트만(흑배경) ──
function renderCoverTextonly(s) {
  const head = hl(s);
  return frame([
    logoImg(34),
    col({ flex: 1, justifyContent: 'center' }, [
      head.emphasis
        ? headlineWithEmphasis(head, { fontSize: 104, color: WHITE, lineHeight: 1.04, letterSpacing: -3, circleColor: WHITE })
        : txt(head.text, { fontFamily: FONT, fontWeight: 700, fontSize: 104, color: WHITE, lineHeight: 1.04, letterSpacing: -3 }),
      s.sub ? txt(s.sub, { fontFamily: FONT, fontWeight: 300, fontSize: 38, color: SUB, marginTop: 36 }) : null,
    ].filter(Boolean)),
    row({ justifyContent: 'flex-end' }, [mono('swipe →', { fontSize: 24, color: SUB })]),
  ], { bg: BLACK });
}

// ── 커버: 좌 사진(48%) / 우 텍스트(흰) ──
function renderCoverSplit(s) {
  const head = hl(s);
  const imgW = Math.round(W * 0.48);
  return h('div', { width: W, height: H, display: 'flex', flexDirection: 'row', backgroundColor: WHITE, fontFamily: FONT }, [
    photo(s.image, imgW, H),
    h('div', { display: 'flex', flexDirection: 'column', width: W - imgW, height: H, padding: 64, justifyContent: 'center' }, [
      logoImg(32),
      h('div', { display: 'flex', marginTop: 'auto' }, []),
      head.emphasis
        ? headlineWithEmphasis(head, { fontSize: 72, color: BLACK, lineHeight: 1.08, letterSpacing: -2 })
        : txt(head.text, { fontFamily: FONT, fontWeight: 700, fontSize: 72, color: BLACK, lineHeight: 1.08, letterSpacing: -2 }),
      s.sub ? txt(s.sub, { fontFamily: FONT, fontWeight: 300, fontSize: 30, color: SUB, marginTop: 24 }) : null,
      h('div', { display: 'flex', marginTop: 'auto' }, [mono('swipe →', { fontSize: 22, color: SUB })]),
    ].filter(Boolean)),
  ]);
}

// ── 커버: 초대형 숫자형(위=숫자, 아래=사진. 상하 분리) ──
function renderCoverNumber(s) {
  const head = hl(s);
  return frame([
    row({ justifyContent: 'space-between', alignItems: 'center' }, [logoImg(34), s.source ? mono(s.source, { fontSize: 22, color: SUB }) : null].filter(Boolean)),
    // 초대형 숫자(700) + 캡션
    col({ marginTop: 28 }, [
      txt(String(s.num || head.text || ''), { fontFamily: FONT, fontWeight: 700, fontSize: 260, color: BLACK, lineHeight: 0.92, letterSpacing: -8 }),
      s.headline ? txt(head.text, { fontFamily: FONT, fontWeight: 500, fontSize: 44, color: BLACK, marginTop: 8, letterSpacing: -1 }) : null,
      s.sub ? txt(s.sub, { fontFamily: FONT, fontWeight: 300, fontSize: 30, color: SUB, marginTop: 12 }) : null,
    ].filter(Boolean)),
    // 아래 사진(숫자 안 가리게 하단 분리)
    s.image ? photo(s.image, W - 160, 480, { marginTop: 'auto' }) : null,
  ].filter(Boolean));
}

// ── 본문: 적을 때 — 한 줄 핵심 + 우하단 정사각 사진 인셋 ──
function renderBodyShort(s) {
  const head = hl(s);
  return frame([
    s.num ? txt(String(s.num), { fontFamily: FONT, fontWeight: 300, fontSize: 40, color: SUB, letterSpacing: 1 }) : null,
    col({ flex: 1, justifyContent: 'center' }, [
      head.emphasis
        ? headlineWithEmphasis(head, { fontSize: 76, color: BLACK, lineHeight: 1.12, letterSpacing: -2 })
        : txt(head.text, { fontFamily: FONT, fontWeight: 700, fontSize: 76, color: BLACK, lineHeight: 1.12, letterSpacing: -2 }),
      s.body ? h('div', { display: 'flex', marginTop: 28, maxWidth: 700 }, [richText(s.body, { fontSize: 34, color: '#2A2A2A', lineHeight: 1.5 })]) : null,
    ].filter(Boolean)),
    // 우하단 정사각 사진 인셋
    s.image ? row({ justifyContent: 'flex-end' }, [photo(s.image, 360, 360)]) : null,
  ].filter(Boolean));
}

// ── 본문: 많을 때 — 소제목(번호+제목) + 가로 사진 스트립 + 설명 ──
function renderBodyLong(s) {
  const head = hl(s);
  return frame([
    row({ alignItems: 'baseline' }, [
      s.num ? txt(String(s.num), { fontFamily: FONT, fontWeight: 300, fontSize: 40, color: SUB, marginRight: 20, letterSpacing: 1 }) : null,
      txt(head.text, { fontFamily: FONT, fontWeight: 700, fontSize: 56, color: BLACK, lineHeight: 1.1, letterSpacing: -1 }),
    ].filter(Boolean)),
    // 가로 사진 스트립
    s.image ? photo(s.image, W - 160, 420, { marginTop: 40 }) : null,
    // 설명 2~3줄(richText, 300 본문 / 700 강조)
    s.body ? h('div', { display: 'flex', marginTop: 40 }, [richText(s.body, { fontSize: 38, color: '#2A2A2A', lineHeight: 1.5 })]) : null,
    footer(),
  ].filter(Boolean));
}

// ── 본문: 텍스트만 ──
function renderBodyTextonly(s) {
  return frame([
    s.num ? txt(String(s.num), { fontFamily: FONT, fontWeight: 300, fontSize: 40, color: SUB, letterSpacing: 1 }) : null,
    col({ flex: 1, justifyContent: 'center' }, [
      s.body ? richText(s.body, { fontSize: 52, color: BLACK, lineHeight: 1.45 }) : null,
    ].filter(Boolean)),
    footer(),
  ].filter(Boolean));
}

// ── 본문: 풀이미지 + 하단 블랙 캡션바 한 줄 ──
function renderBodyFullimage(s) {
  const head = hl(s);
  return h('div', { width: W, height: H, display: 'flex', position: 'relative', backgroundColor: BLACK, fontFamily: FONT }, [
    s.image ? slideImage(s.image, { position: 'absolute', left: 0, top: 0, width: W, height: H }) : null,
    // 하단 블랙 캡션바
    h('div', { display: 'flex', position: 'absolute', left: 0, bottom: 0, width: W, padding: '40px 80px', backgroundColor: BLACK, alignItems: 'center' }, [
      txt((head.text || s.body || ''), { fontFamily: FONT, fontWeight: 500, fontSize: 40, color: WHITE, lineHeight: 1.2, letterSpacing: -1 }),
    ]),
  ].filter(Boolean));
}

// ───────────────────────────────────────────────────────────────────────────
// 데이터-비주얼 본문 (정보성 — 무관한 인물 사진 금지. 코드 렌더 숫자/비교/스텝).
//   전부 흰 배경, 직각(borderRadius:0), Noto Sans, weight≤700.
// ───────────────────────────────────────────────────────────────────────────

// ── 본문: 초대형 숫자(스탯) — num(작게) + 거대 숫자 + 라벨 + 한 줄 설명 ──
function renderBodyStat(s) {
  const statStr = String(s.stat ?? s.num ?? '');
  return frame([
    s.num ? txt(String(s.num), { fontFamily: FONT, fontWeight: 300, fontSize: 40, color: SUB, letterSpacing: 1 }) : null,
    col({ flex: 1, justifyContent: 'center' }, [
      // 초대형 숫자 — circle 플래그면 사인펜 동그라미
      s.circle
        ? row({}, [circled(
            txt(statStr, { fontFamily: FONT, fontWeight: 700, fontSize: 240, color: BLACK, lineHeight: 0.95, letterSpacing: -3 }),
            Math.max(240, Math.round(estTextW(statStr, 240))), 252, { color: BLACK, padX: 28, padY: 20 }
          )])
        : txt(statStr, { fontFamily: FONT, fontWeight: 700, fontSize: 240, color: BLACK, lineHeight: 0.95, letterSpacing: -3 }),
      s.statLabel ? txt(String(s.statLabel), { fontFamily: FONT, fontWeight: 500, fontSize: 48, color: BLACK, marginTop: 16, letterSpacing: -1 }) : null,
      s.body ? h('div', { display: 'flex', marginTop: 32, maxWidth: 800 }, [richText(s.body, { fontSize: 38, color: '#2A2A2A', lineHeight: 1.5 })]) : null,
    ].filter(Boolean)),
    footer(),
  ].filter(Boolean));
}

// ── 도넛 링 SVG(퍼센트 게이지) — 트랙(쿨그레이) + 블랙 아크. 차트 변주용. ──
function donutSvg(pct, { size = 480, stroke = 64, color = BLACK, track = '#E7E7E4' } = {}) {
  const r = (size - stroke) / 2, c = size / 2, circ = 2 * Math.PI * r;
  const arc = Math.max(0, Math.min(1, (Number(pct) || 0) / 100)) * circ;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">`
    + `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>`
    + `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${arc} ${circ - arc}" transform="rotate(-90 ${c} ${c})"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// ── 본문: 도넛 링(%) — 단일 퍼센트 강조. s.stat="72%" + statLabel + body. (막대/숫자와 다른 차트 변주) ──
function renderBodyDonut(s) {
  const head = hl(s);
  const m = String(s.stat ?? s.donutValue ?? '').match(/[\d.]+/);
  const pct = m ? parseFloat(m[0]) : 0;
  const center = String(s.stat ?? `${pct}%`);
  const size = 480;
  return frame([
    row({ alignItems: 'baseline' }, [
      s.num ? txt(String(s.num), { fontFamily: FONT, fontWeight: 300, fontSize: 40, color: SUB, marginRight: 20, letterSpacing: 1 }) : null,
      head.text ? txt(head.text, { fontFamily: FONT, fontWeight: 700, fontSize: 56, color: BLACK, lineHeight: 1.1, letterSpacing: -1 }) : null,
    ].filter(Boolean)),
    col({ flex: 1, justifyContent: 'center', alignItems: 'center' }, [
      h('div', { display: 'flex', position: 'relative', width: size, height: size, alignItems: 'center', justifyContent: 'center' }, [
        { type: 'img', props: { src: donutSvg(pct), style: { position: 'absolute', left: 0, top: 0, width: size, height: size } } },
        txt(center, { fontFamily: FONT, fontWeight: 700, fontSize: 132, color: BLACK, letterSpacing: -4 }),
      ]),
      s.statLabel ? txt(String(s.statLabel), { fontFamily: FONT, fontWeight: 500, fontSize: 44, color: BLACK, marginTop: 32, letterSpacing: -1 }) : null,
      s.body ? h('div', { display: 'flex', marginTop: 24, maxWidth: 820, justifyContent: 'center' }, [richText(s.body, { fontSize: 36, color: '#2A2A2A', lineHeight: 1.5, justify: 'center' })]) : null,
    ].filter(Boolean)),
    footer(),
  ].filter(Boolean));
}

// ── 본문: 비교 — 좌(약·회색)/우(강·블랙) 막대 + 라벨. s.compare={left,leftVal,right,rightVal} ──
function renderBodyCompare(s) {
  const head = hl(s);
  const c = s.compare || {};
  // 수치 비율 추정: "24h"·"984ppm" 등에서 숫자 추출. 없으면 좌 약(0.4)/우 강(1.0).
  const numOf = (v) => { const m = String(v ?? '').match(/[\d.]+/); return m ? parseFloat(m[0]) : null; };
  const ln = numOf(c.leftVal), rn = numOf(c.rightVal);
  let lr = 0.4, rr = 1.0;
  if (ln != null && rn != null && Math.max(ln, rn) > 0) { const mx = Math.max(ln, rn); lr = Math.max(0.18, ln / mx); rr = Math.max(0.18, rn / mx); }
  const bar = (label, val, ratio, strong) => col({ marginBottom: 56 }, [
    row({ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }, [
      txt(String(label || ''), { fontFamily: FONT, fontWeight: strong ? 700 : 300, fontSize: 40, color: strong ? BLACK : SUB, letterSpacing: -1 }),
      val ? txt(String(val), { fontFamily: FONT, fontWeight: strong ? 700 : 500, fontSize: 36, color: strong ? BLACK : SUB }) : null,
    ].filter(Boolean)),
    // 트랙(쿨톤 배경) + 채움 막대(직각). 약(좌)=쿨그레이 #D6D7D9, 강(우)=BLACK.
    h('div', { display: 'flex', width: '100%', height: 56, backgroundColor: GRAY, borderRadius: 0 }, [
      h('div', { display: 'flex', width: `${Math.round(ratio * 100)}%`, height: 56, backgroundColor: strong ? BLACK : '#D6D7D9', borderRadius: 0 }, ''),
    ]),
  ].filter(Boolean));
  return frame([
    row({ alignItems: 'baseline' }, [
      s.num ? txt(String(s.num), { fontFamily: FONT, fontWeight: 300, fontSize: 40, color: SUB, marginRight: 20, letterSpacing: 1 }) : null,
      head.text ? (head.emphasis
        ? headlineWithEmphasis(head, { fontSize: 56, color: BLACK, lineHeight: 1.1, letterSpacing: -1 })
        : txt(head.text, { fontFamily: FONT, fontWeight: 700, fontSize: 56, color: BLACK, lineHeight: 1.1, letterSpacing: -1 })) : null,
    ].filter(Boolean)),
    col({ flex: 1, justifyContent: 'center' }, [
      bar(c.left, c.leftVal, lr, false),
      bar(c.right, c.rightVal, rr, true),
    ]),
    footer(),
  ].filter(Boolean));
}

// ── 본문: 번호 스텝 리스트 — s.steps=[{n,t}...] (또는 s.body 여러 줄) ──
function renderBodySteps(s) {
  const head = hl(s);
  let steps = Array.isArray(s.steps) ? s.steps : null;
  if (!steps && s.body) {
    steps = String(s.body).split('\n').map(l => l.trim()).filter(Boolean)
      .map((t, i) => ({ n: String(i + 1).padStart(2, '0'), t }));
  }
  steps = steps || [];
  const stepRow = (st, i) => row({ alignItems: 'baseline', marginBottom: 40 }, [
    txt(String(st.n ?? String(i + 1).padStart(2, '0')), { fontFamily: FONT, fontWeight: 700, fontSize: 52, color: SUB, marginRight: 28, letterSpacing: -1 }),
    h('div', { display: 'flex', flex: 1 }, [richText(String(st.t ?? ''), { fontSize: 42, color: BLACK, lineHeight: 1.35 })]),
  ]);
  return frame([
    row({ alignItems: 'baseline' }, [
      s.num ? txt(String(s.num), { fontFamily: FONT, fontWeight: 300, fontSize: 40, color: SUB, marginRight: 20, letterSpacing: 1 }) : null,
      head.text ? (head.emphasis
        ? headlineWithEmphasis(head, { fontSize: 56, color: BLACK, lineHeight: 1.1, letterSpacing: -1 })
        : txt(head.text, { fontFamily: FONT, fontWeight: 700, fontSize: 56, color: BLACK, lineHeight: 1.1, letterSpacing: -1 })) : null,
    ].filter(Boolean)),
    col({ flex: 1, justifyContent: 'center' }, steps.map((st, i) => stepRow(st, i))),
    footer(),
  ].filter(Boolean));
}

// ── 본문 통일 템플릿(body_info): 소제목 + 체크리스트 포인트(키워드 굵게 + 설명) [+ 핵심 박스] ──
//   정신없는 도표 혼합 대신 모든 본문을 이 한 형식으로. 가독성: 굵기 위계·줄바꿈(포인트 단위)·체크표시.
function renderBodyInfo(s) {
  const head = hl(s);
  let points = Array.isArray(s.points) && s.points.length
    ? s.points
    : (s.body ? String(s.body).split('\n').map(l => l.trim()).filter(Boolean).map(t => ({ k: '', t })) : []);
  points = points.slice(0, 3); // 한 카드 넘침 방지(최대 3포인트)
  const n = points.length;
  // 포인트 수에 따라 폰트·간격 조절 — 한 카드(1080×1350) 안에 안정적으로.
  const kSize = n >= 3 ? 40 : 44;
  const tSize = n >= 3 ? 35 : 38;
  const gap = n >= 3 ? 30 : 40;
  const hasTake = !!s.takeaway && n <= 3;
  const badge = n >= 3 ? 64 : 72;
  const pointRow = (p, i) => row({ alignItems: 'flex-start', marginBottom: i === n - 1 ? 0 : gap }, [
    iconBadge(p.icon || 'check', { size: badge, icon: Math.round(badge * 0.55) }),
    col({ flex: 1, marginTop: 2 }, [
      p.k ? txt(p.k, { fontFamily: FONT, fontWeight: 700, fontSize: kSize, color: BLACK, lineHeight: 1.25, letterSpacing: -0.5, marginBottom: 6, wordBreak: 'keep-all' }) : null,
      p.t ? h('div', { display: 'flex' }, [richText(String(p.t), { fontSize: tSize, color: '#3A3A3A', lineHeight: 1.45 })]) : null,
    ].filter(Boolean)),
  ]);
  return frame([
    // num 은 헤드라인 위 별도 줄(겹침 방지)
    s.num ? txt(String(s.num), { fontFamily: FONT, fontWeight: 300, fontSize: 34, color: SUB, letterSpacing: 1, marginBottom: 10 }) : null,
    head.text ? (head.emphasis
      ? headlineWithEmphasis(head, { fontSize: 50, color: BLACK, lineHeight: 1.14, letterSpacing: -1 })
      : headlineText(head.text, { fontSize: 50, lineHeight: 1.14, letterSpacing: -1 })) : null,
    h('div', { display: 'flex', width: 110, height: 6, backgroundColor: BLACK, marginTop: 22, marginBottom: 36 }, ''),
    col({ flex: 1, justifyContent: 'flex-start' }, points.map(pointRow)),
    hasTake ? h('div', { display: 'flex', backgroundColor: '#F1F1EE', padding: '24px 28px', marginTop: 20 }, [richText(String(s.takeaway), { fontSize: 36, color: BLACK, lineHeight: 1.4 })]) : null,
    footer(),
  ].filter(Boolean));
}

// ── 본문: 매크로 클로즈업 사진(인물 아님 — 질감·제형·입자) + 소제목 + 설명 ──
function renderBodyCloseup(s) {
  const head = hl(s);
  return frame([
    row({ alignItems: 'baseline' }, [
      s.num ? txt(String(s.num), { fontFamily: FONT, fontWeight: 300, fontSize: 40, color: SUB, marginRight: 20, letterSpacing: 1 }) : null,
      head.text ? txt(head.text, { fontFamily: FONT, fontWeight: 700, fontSize: 56, color: BLACK, lineHeight: 1.1, letterSpacing: -1 }) : null,
    ].filter(Boolean)),
    // 매크로 클로즈업 가로 스트립(직각)
    photo(s.image, W - 160, 620, { marginTop: 36 }),
    s.body ? h('div', { display: 'flex', marginTop: 36 }, [richText(s.body, { fontSize: 38, color: '#2A2A2A', lineHeight: 1.5 })]) : null,
    footer(),
  ].filter(Boolean));
}

// ── 마무리 A: 화이트 에디토리얼 CTA (#FFFFFF) ──
function renderCtaEditorial(s, market = 'kr') {
  const head = hl(s);
  const us = market === 'us';
  const comment = s.comment || (s.labels && s.labels[0]) || (us ? 'Tell us in the comments' : '댓글로 알려주세요');
  const share = s.share || (s.labels && s.labels[1]) || (us ? 'Share with a friend' : '친구에게 공유');
  const cLabel = us ? '— Comment' : '— 댓글';
  const sLabel = us ? '— Share' : '— 공유';
  return frame([
    // 상단 로고 + 가는 라인
    logoImg(32),
    h('div', { display: 'flex', height: 1, backgroundColor: BLACK, marginTop: 28 }, ''),
    col({ flex: 1, justifyContent: 'center' }, [
      head.emphasis
        ? headlineWithEmphasis(head, { fontSize: 78, color: BLACK, lineHeight: 1.1, letterSpacing: -2 })
        : txt(head.text, { fontFamily: FONT, fontWeight: 700, fontSize: 78, color: BLACK, lineHeight: 1.1, letterSpacing: -2 }),
      s.body ? h('div', { display: 'flex', marginTop: 28, maxWidth: 780 }, [richText(s.body, { fontSize: 36, color: '#2A2A2A', lineHeight: 1.45 })]) : null,
    ].filter(Boolean)),
    // 댓글/공유 표기 2줄
    col({ gap: 12 }, [
      row({ alignItems: 'baseline' }, [
        txt(cLabel, { fontFamily: FONT, fontWeight: 300, fontSize: 30, color: SUB, marginRight: 16 }),
        txt(comment, { fontFamily: FONT, fontWeight: 500, fontSize: 30, color: BLACK }),
      ]),
      row({ alignItems: 'baseline' }, [
        txt(sLabel, { fontFamily: FONT, fontWeight: 300, fontSize: 30, color: SUB, marginRight: 16 }),
        txt(share, { fontFamily: FONT, fontWeight: 500, fontSize: 30, color: BLACK }),
      ]),
    ]),
  ], { bg: WHITE });
}

// ───────────────────────────────────────────────────────────────────────────
// 인포그래픽 본문 (2026-06-20) — 데이터 형태별 시각 구조. 아이콘 장식이 아니라 정보를 '그림'으로.
//   chart=추세/감소 · vs=대조 · timeline=순서 · cause=인과+인증 · mistake=실수vs해법.
//   ⚠️ SVG 안에 한글 금지(satori btoa 깨짐) — 라벨은 DOM txt 로.
//   데이터 부족 시 renderSlide 가 body_info 로 폴백.
// ───────────────────────────────────────────────────────────────────────────
const ig_icSvg = (d, color = BLACK, sw = 1.8) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
const ig_iconImg = (name, { size = 40, color = BLACK, sw = 1.8 } = {}) => ({ type: 'img', props: { src: ig_icSvg(BODY_ICONS[name] || BODY_ICONS.check, color, sw), style: { width: size, height: size } } });
function ig_header(num, headline, emphasis) {
  const head = headline && typeof headline === 'object' ? headline : { text: headline || '', emphasis: emphasis || '' };
  return col({}, [
    num ? txt(String(num), { fontFamily: FONT, fontWeight: 300, fontSize: 34, color: SUB, letterSpacing: 1, marginBottom: 10 }) : null,
    head.text ? (head.emphasis
      ? headlineWithEmphasis(head, { fontSize: 50, lineHeight: 1.14, letterSpacing: -1 })
      : headlineText(head.text, { fontSize: 50, lineHeight: 1.14, letterSpacing: -1 })) : null,
    h('div', { display: 'flex', width: 110, height: 6, backgroundColor: BLACK, marginTop: 22, marginBottom: 36 }, ''),
  ].filter(Boolean));
}
const ig_takeaway = (s) => s ? h('div', { display: 'flex', backgroundColor: '#F1F1EE', padding: '24px 28px', marginTop: 'auto', marginBottom: 24 }, [richText(String(s), { fontSize: 34, color: BLACK, lineHeight: 1.35 })]) : null;

// 추세 라인차트 SVG(한글 없음) — points:[{x,y(0~100)}], markerIdx 옵션.
function ig_lineChart(points, { w = 920, ht = 440, markerIdx = null } = {}) {
  const padL = 8, padR = 8, padT = 40, padB = 30, plotW = w - padL - padR, plotH = ht - padT - padB, n = points.length;
  const xs = points.map((_, i) => padL + (plotW * i) / (n - 1));
  const ys = points.map(p => padT + plotH * (1 - (Number(p.y) || 0) / 100));
  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 0; i < n - 1; i++) { const cx = (xs[i] + xs[i + 1]) / 2; d += ` C ${cx} ${ys[i]} ${cx} ${ys[i + 1]} ${xs[i + 1]} ${ys[i + 1]}`; }
  const area = `${d} L ${xs[n - 1]} ${padT + plotH} L ${xs[0]} ${padT + plotH} Z`;
  const grid = [0.25, 0.5, 0.75].map(g => `<line x1="${padL}" y1="${padT + plotH * g}" x2="${w - padR}" y2="${padT + plotH * g}" stroke="#ECECEA" stroke-width="2"/>`).join('');
  const dots = xs.map((x, i) => `<circle cx="${x}" cy="${ys[i]}" r="9" fill="${BLACK}"/>`).join('');
  let marker = '';
  if (markerIdx != null && xs[markerIdx] != null) { const mx = xs[markerIdx], my = ys[markerIdx]; marker = `<line x1="${mx}" y1="${padT}" x2="${mx}" y2="${padT + plotH}" stroke="${BLACK}" stroke-width="2" stroke-dasharray="6 6"/><circle cx="${mx}" cy="${my}" r="15" fill="none" stroke="${BLACK}" stroke-width="4"/>`; }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${ht}">${grid}<path d="${area}" fill="#F2F2F0"/><path d="${d}" fill="none" stroke="${BLACK}" stroke-width="6" stroke-linecap="round"/>${marker}${dots}</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// ── body_chart: 추세/감소 라인차트 + 원인 칩 ──
function renderBodyChart(s) {
  const chart = Array.isArray(s.chart) ? s.chart.filter(p => p && p.x != null) : [];
  return frame([
    ig_header(s.num, hl(s)),
    s.yLabel ? row({ alignItems: 'flex-end', marginBottom: 6 }, [
      txt(s.yLabel, { fontFamily: FONT, fontWeight: 500, fontSize: 28, color: BLACK }),
      s.yHint ? txt(s.yHint, { fontFamily: FONT, fontWeight: 300, fontSize: 24, color: SUB, marginLeft: 10 }) : null,
    ].filter(Boolean)) : null,
    h('div', { display: 'flex', width: W - 160, height: 440 }, [{ type: 'img', props: { src: ig_lineChart(chart, { w: W - 160, ht: 440, markerIdx: s.markerIdx }), style: { width: W - 160, height: 440 } } }]),
    row({ width: W - 160, justifyContent: 'space-between', marginTop: 8, marginBottom: 8, paddingLeft: 8, paddingRight: 8 }, chart.map(p => txt(String(p.x), { fontFamily: FONT, fontWeight: 300, fontSize: 26, color: SUB }))),
    s.markerNote ? row({ marginTop: 4, marginBottom: 22 }, [
      h('div', { display: 'flex', width: 16, height: 16, borderRadius: 8, border: `4px solid ${BLACK}`, marginRight: 14 }, ''),
      txt(s.markerNote, { fontFamily: FONT, fontWeight: 500, fontSize: 30, color: BLACK }),
    ]) : null,
    Array.isArray(s.chips) && s.chips.length ? row({ justifyContent: 'space-between', marginTop: 14 }, s.chips.slice(0, 3).map(c =>
      col({ width: (W - 160 - 36) / 3, backgroundColor: GRAY, padding: '22px 20px' }, [
        c.k ? txt(c.k, { fontFamily: FONT, fontWeight: 700, fontSize: 30, color: BLACK, marginBottom: 8, wordBreak: 'keep-all' }) : null,
        c.t ? txt(c.t, { fontFamily: FONT, fontWeight: 300, fontSize: 24, color: '#3A3A3A', lineHeight: 1.35, wordBreak: 'keep-all' }) : null,
      ].filter(Boolean)))) : null,
    ig_takeaway(s.takeaway),
    footer(),
  ].filter(Boolean));
}

// ── body_vs: 2열 대조 매트릭스 ──
function ig_viz(viz, strong) {
  if (!viz) return null;
  if (viz.type === 'bar') return h('div', { display: 'flex', width: '100%', height: 40, backgroundColor: '#EAEAE8' }, [h('div', { display: 'flex', width: `${Math.round((Number(viz.val) || 0) * 100)}%`, height: 40, backgroundColor: strong ? BLACK : '#C9C9C6' }, '')]);
  if (viz.type === 'dots') { const total = viz.total || 6; const filled = Math.max(0, Math.min(total, viz.filled || 0)); return row({ gap: 10 }, Array.from({ length: total }, (_, i) => h('div', { display: 'flex', width: 22, height: 22, borderRadius: 11, backgroundColor: i < filled ? BLACK : '#E2E2DF' }, ''))); }
  return null;
}
function renderBodyVs(s) {
  const colW = (W - 160 - 40) / 2;
  const A = s.colA || {}, B = s.colB || {}, rows = Array.isArray(s.rows) ? s.rows : [];
  const headerCell = (label, accent) => h('div', { display: 'flex', width: colW, justifyContent: 'center', alignItems: 'center', backgroundColor: accent ? BLACK : WHITE, border: `3px solid ${BLACK}`, padding: '18px 0' }, [txt(String(label || ''), { fontFamily: FONT, fontWeight: 700, fontSize: 40, color: accent ? WHITE : BLACK, letterSpacing: -1 })]);
  const dataCell = (cell = {}, strong) => col({ width: colW, padding: '22px 26px', justifyContent: 'center', minHeight: 140, border: `3px solid ${BLACK}`, borderTop: 'none', backgroundColor: strong ? '#FAFAF9' : WHITE }, [
    cell.viz ? h('div', { display: 'flex', marginBottom: 16 }, [ig_viz(cell.viz, strong)]) : null,
    txt(String(cell.word || ''), { fontFamily: FONT, fontWeight: strong ? 700 : 500, fontSize: 30, color: BLACK, lineHeight: 1.3, wordBreak: 'keep-all' }),
  ].filter(Boolean));
  return frame([
    ig_header(s.num, hl(s)),
    row({ gap: 40 }, [headerCell(A.label, false), headerCell(B.label, true)]),
    col({ flex: 1 }, rows.map(r => col({}, [
      h('div', { display: 'flex', width: '100%', justifyContent: 'center', backgroundColor: GRAY, padding: '10px 0', borderLeft: `3px solid ${BLACK}`, borderRight: `3px solid ${BLACK}` }, [txt(String(r.metric || ''), { fontFamily: FONT, fontWeight: 500, fontSize: 26, color: SUB, letterSpacing: 1 })]),
      row({ gap: 40 }, [dataCell(r.a, false), dataCell(r.b, true)]),
    ]))),
    ig_takeaway(s.takeaway),
    footer(),
  ].filter(Boolean));
}

// ── body_timeline: 순서(번호 배지 + 세로 연결선) ──
function renderBodyTimeline(s) {
  const steps = Array.isArray(s.steps) ? s.steps : [];
  const n = steps.length;
  const badge = (i) => col({ alignItems: 'center', marginRight: 32, flexShrink: 0 }, [
    h('div', { display: 'flex', width: 84, height: 84, borderRadius: 42, backgroundColor: BLACK, alignItems: 'center', justifyContent: 'center' }, [txt(String(i + 1), { fontFamily: FONT, fontWeight: 700, fontSize: 44, color: WHITE })]),
    i < n - 1 ? h('div', { display: 'flex', width: 4, height: 96, backgroundColor: '#D9D9D6', marginTop: 8 }, '') : null,
  ].filter(Boolean));
  const step = (st, i) => row({ alignItems: 'flex-start', marginBottom: i < n - 1 ? 4 : 0 }, [
    badge(i),
    col({ flex: 1, marginTop: 6 }, [
      st.big ? row({ alignItems: 'baseline', marginBottom: 6 }, [
        txt(String(st.big), { fontFamily: FONT, fontWeight: 700, fontSize: 72, color: BLACK, letterSpacing: -2, marginRight: 16 }),
        st.bigUnit ? txt(String(st.bigUnit), { fontFamily: FONT, fontWeight: 500, fontSize: 34, color: SUB }) : null,
      ].filter(Boolean)) : null,
      st.k ? txt(String(st.k), { fontFamily: FONT, fontWeight: 700, fontSize: 42, color: BLACK, lineHeight: 1.2, letterSpacing: -0.5, marginBottom: 8, wordBreak: 'keep-all' }) : null,
      st.t ? h('div', { display: 'flex' }, [richText(String(st.t), { fontSize: 32, color: '#3A3A3A', lineHeight: 1.4 })]) : null,
    ].filter(Boolean)),
  ]);
  return frame([
    ig_header(s.num, hl(s)),
    col({ flex: 1, justifyContent: 'center' }, steps.map(step)),
    ig_takeaway(s.takeaway),
    footer(),
  ].filter(Boolean));
}

// ── body_cause: 인과 등식 + 인증 배지 ──
function renderBodyCause(s) {
  const eqBox = (label) => col({ flex: 1, backgroundColor: GRAY, padding: '34px 24px', alignItems: 'center', justifyContent: 'center', minHeight: 150 }, [
    txt(String(label || ''), { fontFamily: FONT, fontWeight: 700, fontSize: 42, color: BLACK, lineHeight: 1.2, letterSpacing: -1 }),
  ]);
  return frame([
    ig_header(s.num, hl(s)),
    row({ alignItems: 'center', marginBottom: 24 }, [
      eqBox(s.left),
      txt('=', { fontFamily: FONT, fontWeight: 700, fontSize: 80, color: BLACK, marginLeft: 24, marginRight: 24 }),
      eqBox(s.right),
    ]),
    s.linkNote ? h('div', { display: 'flex', marginBottom: 'auto' }, [richText(String(s.linkNote), { fontSize: 32, color: '#3A3A3A', lineHeight: 1.45 })]) : null,
    s.cert ? col({ backgroundColor: BLACK, padding: '34px 36px', marginTop: 28, marginBottom: 24 }, [
      row({ alignItems: 'center', marginBottom: 16 }, [
        h('div', { display: 'flex', width: 56, height: 56, borderRadius: 28, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center', marginRight: 20 }, [ig_iconImg('check', { size: 32, color: BLACK, sw: 2.6 })]),
        txt(String(s.cert.title || ''), { fontFamily: FONT, fontWeight: 700, fontSize: 40, color: WHITE, letterSpacing: -1 }),
      ]),
      s.cert.body ? txt(String(s.cert.body), { fontFamily: FONT, fontWeight: 300, fontSize: 30, color: '#D6D6D6', lineHeight: 1.4, wordBreak: 'keep-all' }) : null,
    ].filter(Boolean)) : null,
    footer(),
  ].filter(Boolean));
}

// ── body_mistake: 실수 vs 해법(2열) ──
function renderBodyMistake(s) {
  const colW = (W - 160 - 32) / 2;
  const rows = Array.isArray(s.rows) ? s.rows : [];
  const head = (label, accent) => h('div', { display: 'flex', width: colW, alignItems: 'center', justifyContent: 'center', padding: '16px 0', backgroundColor: accent ? BLACK : '#EDEDEA' }, [
    txt(String(label || ''), { fontFamily: FONT, fontWeight: 700, fontSize: 36, color: accent ? WHITE : '#6A6A66', letterSpacing: -0.5 }),
  ]);
  const cell = (icon, text, strong) => row({ width: colW, alignItems: 'flex-start', padding: '22px 22px', minHeight: 150, backgroundColor: strong ? '#FAFAF9' : '#F4F4F2' }, [
    h('div', { display: 'flex', marginRight: 16, marginTop: 4, flexShrink: 0 }, [ig_iconImg(icon, { size: 36, color: BLACK, sw: 2.4 })]),
    h('div', { display: 'flex', flex: 1 }, [richText(String(text || ''), { fontSize: 30, color: BLACK, lineHeight: 1.35 })]),
  ]);
  return frame([
    ig_header(s.num, hl(s)),
    row({ gap: 32, marginBottom: 16 }, [head(s.leftLabel || '흔한 실수', false), head(s.rightLabel || '이렇게 하세요', true)]),
    col({ flex: 1, gap: 16 }, rows.map(r => row({ gap: 32 }, [cell('x', r.bad, false), cell('check', r.good, true)]))),
    ig_takeaway(s.takeaway),
    footer(),
  ].filter(Boolean));
}

// 인포그래픽 데이터 충분성 검사 — 부족하면 body_info 폴백.
function ig_hasData(s) {
  switch (s.type) {
    case 'body_chart': return Array.isArray(s.chart) && s.chart.length >= 2;
    case 'body_vs': return s.colA && s.colB && Array.isArray(s.rows) && s.rows.length >= 1;
    case 'body_timeline': return Array.isArray(s.steps) && s.steps.length >= 1;
    case 'body_cause': return !!(s.left && s.right);
    case 'body_mistake': return Array.isArray(s.rows) && s.rows.length >= 1;
    default: return true;
  }
}

export function renderSlide(s, market) {
  // 인포그래픽 본문 — 데이터 부족 시 body_info 폴백
  if (['body_chart', 'body_vs', 'body_timeline', 'body_cause', 'body_mistake'].includes(s.type)) {
    if (!ig_hasData(s)) return renderBodyInfo(s);
    switch (s.type) {
      case 'body_chart': return renderBodyChart(s);
      case 'body_vs': return renderBodyVs(s);
      case 'body_timeline': return renderBodyTimeline(s);
      case 'body_cause': return renderBodyCause(s);
      case 'body_mistake': return renderBodyMistake(s);
    }
  }
  switch (s.type) {
    // 기존(하위호환)
    case 'cover': return renderCover(s, market);
    case 'info': return renderInfo(s);
    case 'review': return renderReview(s, market);
    case 'reviewshot': return renderReview(s, market); // 후기 캡처 alias — review 와 동일 contain 렌더(세로 비율 잘림 금지)
    case 'cta': return renderCta(s);
    // 신규 디자인 포맷
    case 'cover_fullimage': return renderCoverFullimage(s);
    case 'cover_textonly': return renderCoverTextonly(s);
    case 'cover_split': return renderCoverSplit(s);
    case 'cover_number': return renderCoverNumber(s);
    case 'body_short': return renderBodyShort(s);
    case 'body_long': return renderBodyLong(s);
    case 'body_info': return renderBodyInfo(s);   // ★ 통일 본문 템플릿(체크리스트)
    case 'body_textonly': return renderBodyTextonly(s);
    case 'body_fullimage': return renderBodyFullimage(s);
    // (레거시) 데이터-비주얼 본문 — 신규는 body_info 로 통일. 구 드래프트 하위호환용 유지.
    case 'body_stat': return renderBodyStat(s);
    case 'body_donut': return renderBodyDonut(s);
    case 'body_compare': return renderBodyCompare(s);
    case 'body_steps': return renderBodySteps(s);
    case 'body_closeup': return renderBodyCloseup(s);
    case 'cta_editorial': return renderCtaEditorial(s, market);
    default: return renderInfo(s);
  }
}

export async function bakePng(vdom, fonts) {
  const svg = await satori(vdom, { width: W, height: H, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  return png;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.CREATOR_INGEST_SECRET;
  if (!secret) return res.status(503).json({ error: 'Service misconfigured' });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  const { slides, market = 'kr', draftId } = req.body || {};
  if (!Array.isArray(slides) || !slides.length) return res.status(400).json({ error: 'slides 배열 필요' });
  if (slides.length > 10) return res.status(400).json({ error: '슬라이드 최대 10장' });

  try {
    const fonts = await loadFonts();
    const urls = [];
    for (let i = 0; i < slides.length; i++) {
      const png = await bakePng(renderSlide(slides[i], market), fonts);
      const blob = await put(`cardnews/${draftId || 'card'}-${i + 1}.png`, png, {
        access: 'public', contentType: 'image/png', addRandomSuffix: true,
      });
      urls.push(blob.url);
    }

    // draft 저장 (있으면)
    let saved = false;
    if (draftId) {
      try {
        const sb = getSupabase();
        const { data: row } = await sb.from('creator_drafts').select('data').eq('id', draftId).single();
        if (row?.data) {
          const d = row.data;
          d.mediaUrls = urls; d.format = 'cardnews';
          if (['draft', 'generating'].includes(d.status)) d.status = 'review';
          d.updatedAt = new Date().toISOString();
          await sb.from('creator_drafts').update({ data: d }).eq('id', draftId);
          saved = true;
        }
      } catch (e) { console.error('[render-card] save:', e.message); }
    }

    return res.status(200).json({ ok: true, count: urls.length, urls, savedToDraft: saved });
  } catch (e) {
    console.error('[render-card]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

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

// ── 하이퍼스크립트 (satori VDOM) ──
const h = (type, style, children) => ({ type, props: { style, ...(children !== undefined ? { children } : {}) } });
const row = (style, children) => h('div', { display: 'flex', flexDirection: 'row', alignItems: 'center', ...style }, children);
const col = (style, children) => h('div', { display: 'flex', flexDirection: 'column', ...style }, children);
const txt = (s, style) => h('div', { display: 'flex', ...style }, s);

// 블랙 필 라벨
const pill = (s, inv = false) => h('div', {
  display: 'flex', alignItems: 'center', backgroundColor: inv ? WHITE : BLACK, color: inv ? BLACK : WHITE,
  fontFamily: FONT, fontWeight: 700, fontSize: 30, padding: '12px 26px', borderRadius: 0, lineHeight: 1,
}, s);
// 스펙 라벨(모노 폐지 → 단일 폰트 medium + letterSpacing 으로 모노 느낌)
const mono = (s, style) => txt(s, { fontFamily: FONT, fontWeight: 500, fontSize: 26, color: BLACK, letterSpacing: 1, ...style });

// 리치텍스트 — `**강조**`=볼드(700), 나머지=라이트(300). 단어 단위 flexWrap 으로 흐름.
function richText(str, { fontSize, color, lineHeight = 1.5, justify = 'flex-start' } = {}) {
  const segs = []; const re = /\*\*(.+?)\*\*/g; let last = 0, m;
  while ((m = re.exec(str))) { if (m.index > last) segs.push({ t: str.slice(last, m.index), b: false }); segs.push({ t: m[1], b: true }); last = re.lastIndex; }
  if (last < str.length) segs.push({ t: str.slice(last), b: false });
  const words = segs.flatMap(s => s.t.split(/\s+/).filter(Boolean).map(w => ({ w, b: s.b })));
  return h('div', { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: justify },
    words.map(x => txt(x.w, { fontFamily: FONT, fontWeight: x.b ? 700 : 300, fontSize, color, lineHeight, marginRight: Math.round(fontSize * 0.28), marginBottom: Math.round(fontSize * 0.18) })));
}

// 손그림 거친 타원 (살짝 비뚤·오버슛) — 핵심 수치 강조용. img(data:svg)로 오버레이.
function roughEllipseSvg(w, h, color) {
  const p = `M ${w * .52} ${h * .1} C ${w * .92} ${h * .04} ${w * 1.0} ${h * .62} ${w * .56} ${h * .9} C ${w * .12} ${h * 1.04} ${w * .0} ${h * .42} ${w * .46} ${h * .12} C ${w * .62} ${h * .04} ${w * .8} ${h * .08} ${w * .9} ${h * .2}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><path d="${p}" fill="none" stroke="${color}" stroke-width="${Math.max(4, w * .014)}" stroke-linecap="round"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
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
  pill(market === 'us' ? 'AMAZON  4.8★ (27)' : 'OLIVE YOUNG 1위');

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
  const rating = market === 'us' ? '4.8★  AMAZON US' : 'OLIVE YOUNG 1위';
  const spec = (s.labels && s.labels.length) ? s.labels.join('   /   ') : (market === 'us' ? '500 DALTON   /   30+ PROTEIN' : '500 DALTON   /   단백질 29가지');
  return frame([
    // 상단: 실제 milli² 로고 + 모노 평점(필❌) + 얇은 구분선
    col({}, [
      row({ justifyContent: 'space-between', alignItems: 'center' }, [
        logoImg(40),
        // 손그림 원 포인트(핵심 수치) — 평점에 거친 타원 오버레이
        circled(mono(rating, { fontSize: 27, color: BLACK, letterSpacing: 1 }), 250, 34, { padX: 18, padY: 12 }),
      ]),
      h('div', { display: 'flex', height: 1, backgroundColor: '#E3E3E3', marginTop: 20 }, ''),
    ]),
    // 헤드라인 지배(초대형) + 짧은 서브 1줄
    col({ marginTop: 64 }, [
      s.headline ? txt(s.headline, { fontFamily: FONT, fontWeight: 700, fontSize: 100, color: BLACK, lineHeight: 1.04, letterSpacing: -3 }) : null,
      s.body ? txt(s.body, { fontFamily: FONT, fontWeight: 300, fontSize: 36, color: SUB, marginTop: 30 }) : null,
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
      s.headline ? txt(s.headline, { fontFamily: FONT, fontWeight: 700, fontSize: 68, color: BLACK, lineHeight: 1.1, letterSpacing: -1 }) : null,
      h('div', { display: 'flex', width: 120, height: 8, backgroundColor: BLACK, marginTop: 28, marginBottom: 28 }, ''),
      s.body ? richText(s.body, { fontSize: 42, color: '#2A2A2A', lineHeight: 1.5 }) : null, // 리치텍스트(**강조**=볼드)
      (s.labels && s.labels.length) ? col({ marginTop: 36, gap: 16 }, s.labels.map(l => mono(`/ ${l}`, { fontSize: 30 }))) : null,
    ].filter(Boolean)),
    // §5 info 슬라이드 이미지 지원 (직각)
    s.image ? h('div', { display: 'flex', width: '100%', height: 460, overflow: 'hidden', backgroundColor: GRAY, marginBottom: 24 }, [slideImage(s.image, { width: W - 160, height: 460 })]) : null,
    footer(),
  ].filter(Boolean));
}

function renderReview(s, market) {
  return frame([
    row({ justifyContent: 'space-between', alignItems: 'flex-start' }, [wordmark(), marketBadge(market)]),
    s.headline ? txt(s.headline, { fontFamily: FONT, fontWeight: 700, fontSize: 56, color: BLACK, lineHeight: 1.1, marginTop: 40, letterSpacing: -1 }) : null,
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
      s.headline ? txt(s.headline, { fontFamily: FONT, fontWeight: 700, fontSize: 64, color: WHITE, textAlign: 'center', lineHeight: 1.15, letterSpacing: -1 }) : null,
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
    return txt(text || headline, { fontFamily: FONT, fontWeight: 700, fontSize, color, lineHeight, letterSpacing });
  }
  // emphasis 기준 분할(앞/강조/뒤) → 단어 흐름. 강조어만 circled.
  const idx = text.indexOf(emph);
  const before = text.slice(0, idx);
  const after = text.slice(idx + emph.length);
  const mk = (w) => txt(w, { fontFamily: FONT, fontWeight: 700, fontSize, color, lineHeight, letterSpacing, marginRight: Math.round(fontSize * 0.24) });
  const parts = [];
  before.split(/\s+/).filter(Boolean).forEach(w => parts.push(mk(w)));
  // 강조어: 글자수 기반 폭 추정(한글/영문 평균). 동그라미는 emphasis 단어 길이에 맞춤.
  const charW = fontSize * 0.62;
  const ew = Math.max(fontSize, Math.round(emph.length * charW));
  parts.push(circled(
    txt(emph, { fontFamily: FONT, fontWeight: 700, fontSize, color, lineHeight, letterSpacing }),
    ew, Math.round(fontSize * 1.05), { color: circleColor, padX: 20, padY: 14 }
  ));
  after.split(/\s+/).filter(Boolean).forEach(w => parts.push(mk(w)));
  return h('div', { display: 'flex', flexWrap: 'wrap', alignItems: 'center' }, parts);
}

// headline 인자 정규화: 문자열 or {text,emphasis} 모두 허용.
const hl = (s) => (typeof s.headline === 'object' && s.headline) ? s.headline : { text: s.headline || '', emphasis: s.emphasis || '' };

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
            Math.max(240, Math.round(statStr.length * 240 * 0.6)), 252, { color: BLACK, padX: 24, padY: 18 }
          )])
        : txt(statStr, { fontFamily: FONT, fontWeight: 700, fontSize: 240, color: BLACK, lineHeight: 0.95, letterSpacing: -3 }),
      s.statLabel ? txt(String(s.statLabel), { fontFamily: FONT, fontWeight: 500, fontSize: 48, color: BLACK, marginTop: 16, letterSpacing: -1 }) : null,
      s.body ? h('div', { display: 'flex', marginTop: 32, maxWidth: 800 }, [richText(s.body, { fontSize: 38, color: '#2A2A2A', lineHeight: 1.5 })]) : null,
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
    // 트랙(회색) + 채움 막대(직각)
    h('div', { display: 'flex', width: '100%', height: 56, backgroundColor: GRAY, borderRadius: 0 }, [
      h('div', { display: 'flex', width: `${Math.round(ratio * 100)}%`, height: 56, backgroundColor: strong ? BLACK : '#D3D1C7', borderRadius: 0 }, ''),
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
function renderCtaEditorial(s) {
  const head = hl(s);
  const comment = s.comment || (s.labels && s.labels[0]) || '댓글로 알려주세요';
  const share = s.share || (s.labels && s.labels[1]) || '친구에게 공유';
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
        txt('— 댓글', { fontFamily: FONT, fontWeight: 300, fontSize: 30, color: SUB, marginRight: 16 }),
        txt(comment, { fontFamily: FONT, fontWeight: 500, fontSize: 30, color: BLACK }),
      ]),
      row({ alignItems: 'baseline' }, [
        txt('— 공유', { fontFamily: FONT, fontWeight: 300, fontSize: 30, color: SUB, marginRight: 16 }),
        txt(share, { fontFamily: FONT, fontWeight: 500, fontSize: 30, color: BLACK }),
      ]),
    ]),
  ], { bg: WHITE });
}

export function renderSlide(s, market) {
  switch (s.type) {
    // 기존(하위호환)
    case 'cover': return renderCover(s, market);
    case 'info': return renderInfo(s);
    case 'review': return renderReview(s, market);
    case 'cta': return renderCta(s);
    // 신규 디자인 포맷
    case 'cover_fullimage': return renderCoverFullimage(s);
    case 'cover_textonly': return renderCoverTextonly(s);
    case 'cover_split': return renderCoverSplit(s);
    case 'cover_number': return renderCoverNumber(s);
    case 'body_short': return renderBodyShort(s);
    case 'body_long': return renderBodyLong(s);
    case 'body_textonly': return renderBodyTextonly(s);
    case 'body_fullimage': return renderBodyFullimage(s);
    // 데이터-비주얼 본문(정보성) + 매크로 클로즈업 본문
    case 'body_stat': return renderBodyStat(s);
    case 'body_compare': return renderBodyCompare(s);
    case 'body_steps': return renderBodySteps(s);
    case 'body_closeup': return renderBodyCloseup(s);
    case 'cta_editorial': return renderCtaEditorial(s);
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

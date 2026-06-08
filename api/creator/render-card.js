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
const BLACK = '#0A0A0A', WHITE = '#FFFFFF', GRAY = '#F2F1EE', SUB = '#6B6B6B';
const LOGO_URL = 'https://zre3xstenznneqve.public.blob.vercel-storage.com/capture/milli_logo-S5AYbqtEpiw6igBWtUm0MPNMpgXZEf.png';

// ── 폰트 로드(모듈 캐시) ──
let FONTS = null;
export async function loadFonts() {
  if (FONTS) return FONTS;
  const f = async (u) => Buffer.from(await (await fetch(u)).arrayBuffer());
  const P = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard/packages/pretendard/dist/public/static';
  const [black, bold, light, mono] = await Promise.all([
    f(`${P}/Pretendard-Black.otf`),
    f(`${P}/Pretendard-Bold.otf`),
    f(`${P}/Pretendard-Regular.otf`),
    f('https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff'),
  ]);
  FONTS = [
    { name: 'Pretendard', data: black, weight: 900, style: 'normal' },
    { name: 'Pretendard', data: bold, weight: 700, style: 'normal' },
    { name: 'Pretendard', data: light, weight: 400, style: 'normal' }, // 리치텍스트 라이트
    { name: 'Mono', data: mono, weight: 700, style: 'normal' },
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
  fontFamily: 'Pretendard', fontWeight: 700, fontSize: 30, padding: '12px 26px', borderRadius: 0, lineHeight: 1,
}, s);
// 모노 스펙 라벨
const mono = (s, style) => txt(s, { fontFamily: 'Mono', fontWeight: 700, fontSize: 26, color: BLACK, letterSpacing: 1, ...style });

// 리치텍스트 — `**강조**`=볼드(900), 나머지=라이트(400). 단어 단위 flexWrap 으로 흐름.
function richText(str, { fontSize, color, lineHeight = 1.5, justify = 'flex-start' } = {}) {
  const segs = []; const re = /\*\*(.+?)\*\*/g; let last = 0, m;
  while ((m = re.exec(str))) { if (m.index > last) segs.push({ t: str.slice(last, m.index), b: false }); segs.push({ t: m[1], b: true }); last = re.lastIndex; }
  if (last < str.length) segs.push({ t: str.slice(last), b: false });
  const words = segs.flatMap(s => s.t.split(/\s+/).filter(Boolean).map(w => ({ w, b: s.b })));
  return h('div', { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: justify },
    words.map(x => txt(x.w, { fontFamily: 'Pretendard', fontWeight: x.b ? 900 : 400, fontSize, color, lineHeight, marginRight: Math.round(fontSize * 0.28), marginBottom: Math.round(fontSize * 0.18) })));
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

const wordmark = (color = BLACK) => row({ alignItems: 'flex-start' }, [
  txt('milli', { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 40, color, letterSpacing: -1 }),
  txt('2', { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 22, color, marginTop: 2 }),
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
    padding: 80, fontFamily: 'Pretendard',
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
        { type: 'img', props: { src: LOGO_URL, style: { height: 40, objectFit: 'contain' } } },
        // 손그림 원 포인트(핵심 수치) — 평점에 거친 타원 오버레이
        circled(mono(rating, { fontSize: 27, color: BLACK, letterSpacing: 1 }), 250, 34, { padX: 18, padY: 12 }),
      ]),
      h('div', { display: 'flex', height: 1, backgroundColor: '#E3E3E3', marginTop: 20 }, ''),
    ]),
    // 헤드라인 지배(초대형) + 짧은 서브 1줄
    col({ marginTop: 64 }, [
      s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 108, color: BLACK, lineHeight: 1.02, letterSpacing: -3 }) : null,
      s.body ? txt(s.body, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 36, color: SUB, marginTop: 30 }) : null,
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
      s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 68, color: BLACK, lineHeight: 1.1, letterSpacing: -1 }) : null,
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
    s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 56, color: BLACK, lineHeight: 1.1, marginTop: 40, letterSpacing: -1 }) : null,
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
      s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 64, color: WHITE, textAlign: 'center', lineHeight: 1.15, letterSpacing: -1 }) : null,
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

export function renderSlide(s, market) {
  switch (s.type) {
    case 'cover': return renderCover(s, market);
    case 'info': return renderInfo(s);
    case 'review': return renderReview(s, market);
    case 'cta': return renderCta(s);
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

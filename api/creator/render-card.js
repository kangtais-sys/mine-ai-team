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

// ── 폰트 로드(모듈 캐시) ──
let FONTS = null;
export async function loadFonts() {
  if (FONTS) return FONTS;
  const f = async (u) => Buffer.from(await (await fetch(u)).arrayBuffer());
  const [black, bold, mono] = await Promise.all([
    f('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/packages/pretendard/dist/public/static/Pretendard-Black.otf'),
    f('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/packages/pretendard/dist/public/static/Pretendard-Bold.otf'),
    f('https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff'),
  ]);
  FONTS = [
    { name: 'Pretendard', data: black, weight: 900, style: 'normal' },
    { name: 'Pretendard', data: bold, weight: 700, style: 'normal' },
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
  fontFamily: 'Pretendard', fontWeight: 700, fontSize: 30, padding: '12px 26px', borderRadius: 999, lineHeight: 1,
}, s);
// 모노 스펙 라벨
const mono = (s, style) => txt(s, { fontFamily: 'Mono', fontWeight: 700, fontSize: 26, color: BLACK, letterSpacing: 1, ...style });

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
function renderCover(s, market) {
  return frame([
    row({ justifyContent: 'space-between', alignItems: 'flex-start' }, [wordmark(), marketBadge(market)]),
    col({ marginTop: 56, flex: 1 }, [
      s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 92, color: BLACK, lineHeight: 1.05, letterSpacing: -2 }) : null,
      s.body ? txt(s.body, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 38, color: SUB, lineHeight: 1.4, marginTop: 28 }) : null,
      (s.labels && s.labels.length) ? row({ marginTop: 36, gap: 14, flexWrap: 'wrap' }, s.labels.map(l => pill(l))) : null,
      s.image ? h('div', { display: 'flex', marginTop: 'auto', width: '100%', height: 540, borderRadius: 28, overflow: 'hidden', border: `2px solid ${BLACK}` }, [slideImage(s.image, { width: W - 160, height: 540 })]) : null,
    ].filter(Boolean)),
    footer(),
  ]);
}

function renderInfo(s) {
  return frame([
    row({ justifyContent: 'space-between', alignItems: 'flex-start' }, [wordmark(), s.source ? mono(s.source, { fontSize: 22, color: SUB }) : null].filter(Boolean)),
    col({ marginTop: 48, flex: 1 }, [
      s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 68, color: BLACK, lineHeight: 1.1, letterSpacing: -1 }) : null,
      h('div', { display: 'flex', width: 120, height: 8, backgroundColor: BLACK, marginTop: 28, marginBottom: 28 }, ''),
      s.body ? txt(s.body, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 42, color: '#2A2A2A', lineHeight: 1.5 }) : null,
      (s.labels && s.labels.length) ? col({ marginTop: 40, gap: 16 }, s.labels.map(l => mono(`/ ${l}`, { fontSize: 30 }))) : null,
    ].filter(Boolean)),
    footer(),
  ]);
}

function renderReview(s, market) {
  return frame([
    row({ justifyContent: 'space-between', alignItems: 'flex-start' }, [wordmark(), marketBadge(market)]),
    s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 56, color: BLACK, lineHeight: 1.1, marginTop: 40, letterSpacing: -1 }) : null,
    s.image ? h('div', { display: 'flex', marginTop: 36, width: '100%', height: 720, borderRadius: 24, overflow: 'hidden', backgroundColor: GRAY, border: `2px solid ${BLACK}` }, [slideImage(s.image, { width: W - 160, height: 720, objectFit: 'contain' })]) : null,
    s.source ? mono(`출처 · ${s.source}`, { fontSize: 24, color: SUB, marginTop: 24 }) : null,
    footer(),
  ].filter(Boolean));
}

function renderCta(s) {
  return frame([
    col({ flex: 1, justifyContent: 'center', alignItems: 'center' }, [
      h('div', { display: 'flex', transform: 'scale(2)', marginBottom: 60 }, [wordmark()]),
      s.headline ? txt(s.headline, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 64, color: BLACK, textAlign: 'center', lineHeight: 1.15, letterSpacing: -1 }) : null,
      s.body ? txt(s.body, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 36, color: SUB, textAlign: 'center', marginTop: 24, lineHeight: 1.4 }) : null,
      row({ marginTop: 48 }, [pill(`${s.cta || '최다판매구성 추천받기'}  →`)]),
    ].filter(Boolean)),
    footer(),
  ], { bg: WHITE });
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

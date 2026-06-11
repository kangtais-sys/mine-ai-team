// POST /api/creator/render-ad — 오너-후킹 전환 광고 Piece A (docs/owner-conversion-ad-spec.md).
// 단일 1080×1350 합성: 오너 히어로 풀블리드 + 상단 훅 + 중앙 제품 인서트(실제 제품컷) + 효능 1줄
//   + 하단 블랙 오퍼밴드(1+1·24,900 / 34%↓·당일출발) + CTA + 증거칩 + 좌하단 "AI 연출".
// 컴플라이언스: AI연출 명시 / 1+1 24,900 정확 / KR 수치만(US$·별점 금지). 제품은 AI 아닌 실제 제품컷 합성.
// 인증: Authorization: Bearer <CREATOR_INGEST_SECRET>. 렌더 스택 render-card 와 동일(loadFonts/bakePng·1080×1350).
import { put } from '@vercel/blob';
import { getSupabase } from '../../lib/supabase.js';
import { loadFonts, bakePng } from './render-card.js';
import { fetchImageDataUrl } from './render-promo.js';

export const config = { maxDuration: 120 };

const W = 1080, H = 1350;
const BLACK = '#0A0A0A', WHITE = '#FFFFFF';

const h = (type, style, children) => ({ type, props: { style, ...(children !== undefined ? { children } : {}) } });
const col = (style, children) => h('div', { display: 'flex', flexDirection: 'column', ...style }, children);
const row = (style, children) => h('div', { display: 'flex', flexDirection: 'row', alignItems: 'center', ...style }, children);
const txt = (s, style) => h('div', { display: 'flex', ...style }, s);
const img = (src, style) => ({ type: 'img', props: { src, style } });
const pill = (s, st = {}) => h('div', { display: 'flex', alignItems: 'center', backgroundColor: WHITE, color: BLACK, fontFamily: 'Pretendard', fontWeight: 700, fontSize: 32, padding: '16px 30px', borderRadius: 0, lineHeight: 1, ...st }, s);

// 훅 파싱: {line1,line2} | "a\nb" | "a / b"
function parseHook(hook) {
  if (hook && typeof hook === 'object') return [hook.line1 || '', hook.line2 || ''];
  if (typeof hook === 'string' && hook.trim()) {
    const parts = hook.split(/\n|\s\/\s/).map(s => s.trim()).filter(Boolean);
    return [parts[0] || '', parts[1] || ''];
  }
  return ['30만이 물어본 내 아침 물광', '사실 미스트 하나 바꿨어요'];
}

function buildAd({ ownerImg, productImg, hook, offer }) {
  const [l1, l2] = parseHook(hook);
  const o = offer || {};
  const deal = o.deal || '1+1';
  const price = o.price || '24,900원';
  const sub = o.sub || `${o.discount || '34%'}↓ · ${o.urgency || '당일출발'}`;
  const cta = o.cta || '지금 자사몰에서 받기';
  const evidence = o.evidence || '지금까지 32만+ 관심';
  const efficacy = o.efficacy || '500달톤 프로틴 미스트 · 진짜 흡수되는 크기';

  return h('div', { width: W, height: H, display: 'flex', position: 'relative', backgroundColor: '#111', fontFamily: 'Pretendard' }, [
    // 오너 히어로 풀블리드
    ownerImg ? img(ownerImg, { position: 'absolute', left: 0, top: 0, width: W, height: H, objectFit: 'cover' }) : txt('', { position: 'absolute', width: W, height: H }),
    // 상단 가독 스크림
    h('div', { position: 'absolute', left: 0, top: 0, width: W, height: 470, display: 'flex', backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0) 100%)' }, ''),
    // 상단 훅(3초)
    col({ position: 'absolute', top: 64, left: 64, width: W - 128 }, [
      l1 ? txt(l1, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 70, color: WHITE, lineHeight: 1.08, letterSpacing: -2 }) : null,
      l2 ? txt(l2, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 46, color: '#F0F0F0', lineHeight: 1.15, marginTop: 12 }) : null,
    ].filter(Boolean)),
    // 효능 1줄(밴드 위, 가독 칩 배경)
    h('div', { position: 'absolute', left: 56, bottom: 396, maxWidth: 540, display: 'flex', backgroundColor: 'rgba(10,10,10,0.72)', padding: '14px 20px' }, [
      txt(efficacy, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 30, color: WHITE, lineHeight: 1.25 }),
    ]),
    // 중앙 제품 인서트(실제 제품컷, 흰 박스·직각)
    productImg ? h('div', { position: 'absolute', right: 56, bottom: 372, width: 248, height: 310, display: 'flex', backgroundColor: WHITE, border: `3px solid ${WHITE}`, overflow: 'hidden' }, [
      img(productImg, { width: 248, height: 310, objectFit: 'cover' }),
    ]) : null,
    // 하단 블랙 오퍼밴드
    col({ position: 'absolute', left: 0, bottom: 0, width: W, height: 360, backgroundColor: BLACK, padding: '36px 56px', justifyContent: 'center' }, [
      // 증거칩
      row({}, [h('div', { display: 'flex', border: `2px solid #FFFFFF`, padding: '8px 18px', borderRadius: 0 }, [txt(evidence, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 26, color: WHITE })])]),
      // 오퍼(큰 숫자)
      row({ alignItems: 'baseline', marginTop: 16 }, [
        txt(`${deal} · ${price}`, { fontFamily: 'Pretendard', fontWeight: 900, fontSize: 84, color: WHITE, letterSpacing: -3, lineHeight: 1 }),
      ]),
      txt(sub, { fontFamily: 'Pretendard', fontWeight: 700, fontSize: 32, color: '#C7C7CC', marginTop: 10 }),
      // CTA
      row({ marginTop: 22 }, [pill(`${cta}  →`)]),
    ]),
    // 좌하단 "AI 연출"
    txt('AI 연출', { position: 'absolute', left: 18, bottom: 14, fontFamily: 'Pretendard', fontWeight: 700, fontSize: 18, color: 'rgba(255,255,255,0.55)' }),
  ].filter(Boolean));
}

export const __buildAdForTest = buildAd; // 로컬 시각검증용

// 보드 시드 (ingest 계약: channel+date 업서트). 단일 이미지 광고 → mediaUrl + mediaUrls[1].
async function seedDraft(sb, { channel, date, url, caption, hashtags, slotType, status }) {
  const region = channel.startsWith('us') ? 'us' : 'kr';
  const platform = channel.endsWith('tt') ? 'tiktok' : 'instagram';
  const PROFILE = {
    kr: (process.env.ZERNIO_MILLIMILLI_PROFILE_ID || '69d08cc1986d57bb8f733102').replace(/\\[rn]/g, '').trim(),
    us: (process.env.ZERNIO_MILLIMILLI_US_PROFILE_ID || '69fbfcd01fc1fdb66f249aa8').replace(/\\[rn]/g, '').trim(),
  };
  const { data: rows } = await sb.from('creator_drafts').select('id, data').limit(300);
  const existing = (rows || []).find(r => r.data && r.data.version === 'milli-v1' && r.data.channel === channel && r.data.date === date && r.data.slotType === slotType);
  if (existing) {
    const d = existing.data;
    d.mediaUrl = url; d.mediaUrls = [url]; d.caption = caption; d.hashtags = hashtags;
    d.format = 'ad'; d.status = status; d.updatedAt = new Date().toISOString();
    await sb.from('creator_drafts').update({ data: d }).eq('id', existing.id);
    return { channel, id: existing.id, action: 'updated' };
  }
  const id = `milli_${channel}_${date}_${slotType}_${Date.now().toString(36)}`;
  const draft = {
    id, version: 'milli-v1', channel, region, platform, date, slotType, status, format: 'ad',
    caption, hashtags, mediaUrl: url, mediaUrls: [url],
    profileId: PROFILE[region], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await sb.from('creator_drafts').insert({ id, persona_id: null, data: draft });
  return { channel, id, action: 'created' };
}

function buildCaption(offer) {
  const o = offer || {};
  return {
    caption: [
      '30만이 물어본 내 아침 물광 — 사실 미스트 하나 바꿨어요. (AI 연출)',
      '',
      '500달톤 프로틴 미스트 — 진짜 흡수되는 크기. 한 번 뿌리면 속부터 차오르는 물광.',
      '',
      `🔥 ${o.evidence || '지금까지 32만+ 관심'}`,
      `✔ ${o.deal || '1+1'} 미스트 2병 ${o.price || '24,900원'} (${o.discount || '34%'}↓)`,
      `✔ ${o.urgency || '당일출발(~14시)'} · 5만원↑ 무료배송`,
      '',
      '💬 아침 물광, 너는 뭐 써? 댓글로 알려줘요 👇',
      '📌 저장해두고 다음에',
      '🔖 화장 들뜨는 친구 태그',
      '',
      '※ AI 연출 컷 · 화장품 표현 범위 내',
    ].join('\n'),
    hashtags: '#밀리밀리 #단백질미스트 #500달톤 #물광 #아침물광 #수분미스트 #속건조 #자사몰 #스킨케어 #뷰티꿀팁',
  };
}

export async function renderAd({ owner_url, product_url, hook, offer, market = 'kr', date, channel = 'kr_ig', publish = false }) {
  if (!owner_url) throw new Error('owner_url 필수');
  const d = date || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST
  const ownerImg = await fetchImageDataUrl(owner_url);
  if (!ownerImg) throw new Error('owner 이미지 다운로드 실패');
  let productImg = null;
  try { productImg = product_url ? await fetchImageDataUrl(product_url) : null; }
  catch (e) { console.error('[render-ad] product:', e.message); }

  const fonts = await loadFonts();
  const png = await bakePng(buildAd({ ownerImg, productImg, hook, offer }), fonts);
  const blob = await put(`ad/${channel}-${d}-owner.png`, png, { access: 'public', contentType: 'image/png', addRandomSuffix: true });

  const { caption, hashtags } = buildCaption(offer);
  const sb = getSupabase();
  const draft = await seedDraft(sb, { channel, date: d, url: blob.url, caption, hashtags, slotType: 'ad_owner', status: publish ? 'approved' : 'review' });
  return { ok: true, date: d, mediaUrl: blob.url, draft, caption, hashtags };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.CREATOR_INGEST_SECRET;
  if (!secret) return res.status(503).json({ error: 'Service misconfigured (CREATOR_INGEST_SECRET)' });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const out = await renderAd(req.body || {});
    return res.status(200).json(out);
  } catch (e) {
    console.error('[render-ad]', e.message);
    return res.status(/필수|다운로드/.test(e.message) ? 400 : 500).json({ error: e.message });
  }
}

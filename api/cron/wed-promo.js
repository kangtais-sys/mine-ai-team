// 수요일 프로모 주간 cron — 매주 수 08:00 KST(= 화 23:00 UTC, vercel.json "0 23 * * 2").
//  US: docs/manifests/wed_us_image_manifest.json(캐시 이미지+오퍼) → render-promo(market=us)
//  KR: 자사몰 product_no=248 서버 fetch(캡차 없음·검증됨)로 fresh 오퍼 + 매니페스트 큐레이션 이미지 → render-promo(market=kr)
//  → 둘 다 status=review 로만 보드 시드(자동발행 X). 완료 통보(Redis 요약 + 로그).
// 인증: Bearer CRON_SECRET (미들웨어는 /api/cron/* 통과). ?dry=1 = 파싱/인자만 반환(렌더·시드 없음).
import { Redis } from '@upstash/redis';
import { renderPromo } from '../creator/render-promo.js';
import usManifest from '../../docs/manifests/wed_us_image_manifest.json' with { type: 'json' };
import krManifest from '../../docs/manifests/wed_kr_image_manifest.json' with { type: 'json' };

export const config = { maxDuration: 300 };

const KR_PRODUCT_URL = 'https://millimilli.kr/product/detail.html?product_no=248';
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// KST(UTC+9) 기준 YYYY-MM-DD
function kstDate() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
const digits = (s) => parseInt(String(s || '').replace(/[^0-9]/g, ''), 10) || 0;
const pick = (html, re) => { const m = re.exec(html); return m ? m[1].trim() : null; };
// 관심수 → 만 단위 반올림 라벨 "32만+". 문자열의 첫 숫자 토큰만 사용(뒤 경고문 숫자 오염 방지).
function roundInterest(raw) {
  const m = String(raw || '').match(/[0-9][0-9,]{3,}/); // 첫 4자리+ 숫자(예: 319,941)
  const n = m ? digits(m[0]) : 0;
  return n ? `${Math.round(n / 10000)}만+` : null;
}

// US — 매니페스트 캐시(이미지+오퍼). proof 는 US-clean 갤러리 흡수컷(올영 뱃지 회피).
function buildUsArgs(date) {
  const g = usManifest.product_gallery, a = usManifest.aplus_labeled, o = usManifest.offer_live;
  const science = (a.find(x => /dalton|ppm/i.test(x.alt)) || {}).url;
  const proof = g.find(u => /41RewGas7lL/.test(u)) || g[4];
  return {
    market: 'us', date, publish: false,
    images: { hero: g[7], deal: g[6], science, proof },
    offer: { price: o.price, bonus: o.bonus, rating: o.rating, reviewCount: o.review_count, shipping: o.shipping },
  };
}

// KR — 자사몰 서버 fetch 로 fresh 오퍼(판매가·정가·할인·[리뉴얼] 뱃지), 나머지는 매니페스트 폴백.
async function buildKrArgs(date) {
  const o = krManifest.offer_live;
  let html = '', fetched = false;
  try { const r = await fetch(KR_PRODUCT_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } }); if (r.ok) { html = await r.text(); fetched = true; } }
  catch (e) { console.error('[wed-promo] KR fetch:', e.message); }

  const salePrice = pick(html, /id="span_product_price_text"[^>]*>\s*([0-9,]+\s*원)/) || o.sale_price;
  const listPrice = pick(html, /span_product_price_custom[^>]*>\s*<strike>\s*([0-9,]+\s*원)/) || o.list_price;
  const sN = digits(salePrice), lN = digits(listPrice);
  const discount = (sN && lN && lN > sN) ? `${Math.round((1 - sN / lN) * 100)}%` : o.discount;
  const badge = /\[리뉴얼\]/.test(html) ? '[리뉴얼]' : '[리뉴얼]'; // 미스트 뱃지(매니페스트 규칙). '1분 완판'(앰플) 금지.
  const interest = roundInterest(o.social_proof) || '32만+';

  // 이미지: 매니페스트 큐레이션 미스트 셀렉션(경로기반·안정). g0=순수 1+1 미스트(샴푸/앰플/'1-SET' 회피).
  const g = krManifest.product_images_hires;
  const images = { hero: g[0], deal: g[0], science: krManifest.detail_strip_sample, proof: g[0] };

  const offer = {
    price: salePrice, listPrice, discount, badge, interest,
    bonus: '1+1 · 미스트 2병',
    shipping: '5만원↑ 무료배송 · ~14시 당일출고',
    gift: '7만원↑ 프로틴 앰플 증정',
  };
  const freshFields = {
    salePrice: /id="span_product_price_text"[^>]*>\s*[0-9,]+\s*원/.test(html),
    listPrice: /span_product_price_custom[^>]*>\s*<strike>\s*[0-9,]+\s*원/.test(html),
    badgeRenew: /\[리뉴얼\]/.test(html),
  };
  return { args: { market: 'kr', date, images, offer, publish: false }, meta: { fetched, freshFields } };
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const date = kstDate();
  const dry = req.query?.dry === '1';
  const usArgs = buildUsArgs(date);
  const { args: krArgs, meta: krMeta } = await buildKrArgs(date);

  if (dry) {
    return res.status(200).json({ ok: true, dry: true, date, us: { images: usArgs.images, offer: usArgs.offer }, kr: { images: krArgs.images, offer: krArgs.offer, ...krMeta } });
  }

  const results = [];
  // US
  try { const r = await renderPromo(usArgs); results.push({ market: 'us', ok: true, drafts: r.drafts, slides: r.slides }); }
  catch (e) { console.error('[wed-promo US]', e.message); results.push({ market: 'us', ok: false, error: e.message }); }
  // KR
  try { const r = await renderPromo(krArgs); results.push({ market: 'kr', ok: true, drafts: r.drafts, slides: r.slides, ...krMeta, offer: { price: krArgs.offer.price, listPrice: krArgs.offer.listPrice, discount: krArgs.offer.discount, interest: krArgs.offer.interest } }); }
  catch (e) { console.error('[wed-promo KR]', e.message); results.push({ market: 'kr', ok: false, error: e.message }); }

  const seeded = results.filter(r => r.ok).reduce((n, r) => n + (r.drafts?.length || 0), 0);
  const summary = { date, seeded, message: `수요일 프로모 ${seeded}건 보드 검토 대기(review) 시드`, results, at: new Date().toISOString() };

  // 완료 통보 — Chief AI 일간체크/대시보드가 읽도록 Redis 요약 저장(보드에도 review 로 노출됨)
  try { await redis.set('creator:wed-promo:latest', summary, { ex: 86400 * 8 }); } catch (e) { console.error('[wed-promo] redis:', e.message); }
  console.log(`[wed-promo] ${date} review 시드 ${seeded}건:`, JSON.stringify(results));

  return res.status(results.every(r => r.ok) ? 200 : 207).json({ ok: results.every(r => r.ok), ...summary });
}

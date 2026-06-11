// 로컬 KR 렌더 검증: 자사몰 매니페스트로 수요일 KR 프로모 5장을 /tmp/promo_kr 에 굽는다(배포·Blob 없이).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { loadFonts, bakePng } from '../api/creator/render-card.js';
import { buildSlides, buildCaption, fetchImageDataUrl } from '../api/creator/render-promo.js';

const M = JSON.parse(readFileSync('docs/manifests/wed_kr_image_manifest.json', 'utf8'));
const g = M.product_images_hires, o = M.offer_live;
const images = { hero: g[0], deal: g[0], science: M.detail_strip_sample, proof: g[5] };  // 미스트 통일(g1=앰플,g2=샴푸 회피)
const offer = {
  price: o.sale_price,           // 24,900원 (1+1)
  listPrice: o.list_price,       // 38,000원
  discount: o.discount,          // 34%
  bonus: '1+1 · 미스트 2병',
  shipping: '5만원↑ 무료배송 · ~14시 당일출고',
  gift: '7만원↑ 프로틴 앰플 증정',
  interest: '319,937',
  soldOut: '1분 완판',
};
const market = 'kr';
console.log('images:', Object.fromEntries(Object.entries(images).map(([k, v]) => [k, v?.slice(0, 70)])));
console.log('offer:', offer);

const im = {};
for (const k of ['hero', 'deal', 'science', 'proof']) {
  im[k] = await fetchImageDataUrl(images[k]).catch(e => { console.error(k, e.message); return null; });
  console.log(`  ${k}: ${im[k] ? (im[k].length / 1024).toFixed(0) + 'KB' : 'NULL'}`);
}
const fonts = await loadFonts();
const slides = buildSlides(im, offer, market);
mkdirSync('/tmp/promo_kr', { recursive: true });
const names = ['1_cover', '2_science', '3_proof', '4_deal', '5_cta'];
for (let i = 0; i < slides.length; i++) {
  const png = await bakePng(slides[i], fonts);
  writeFileSync(`/tmp/promo_kr/${names[i]}.png`, png);
  console.log(`  ✓ /tmp/promo_kr/${names[i]}.png (${(png.length / 1024).toFixed(0)}KB)`);
}
const { caption, hashtags } = buildCaption(offer, market);
console.log('\n=== KR CAPTION ===\n' + caption + '\n\n' + hashtags);

// 로컬 렌더 검증: 매니페스트 실측 URL로 수요일 프로모 5장을 /tmp/promo 에 PNG로 굽는다(배포·Blob 없이).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { loadFonts, bakePng } from '../api/creator/render-card.js';
import { buildSlides, buildCaption, fetchImageDataUrl } from '../api/creator/render-promo.js';

const M = JSON.parse(readFileSync('docs/manifests/wed_us_image_manifest.json', 'utf8'));
const g = M.product_gallery, a = M.aplus_labeled, o = M.offer_live;
const images = {
  hero: g[7], deal: g[6],
  science: a.find(x => /dalton|ppm/i.test(x.alt))?.url,
  proof: 'https://m.media-amazon.com/images/I/41RewGas7lL._SL1500_.jpg',
};
const offer = { price: o.price, bonus: o.bonus, rating: o.rating, reviewCount: o.review_count, shipping: o.shipping };
const market = 'us';

console.log('images:', Object.fromEntries(Object.entries(images).map(([k, v]) => [k, v?.slice(0, 70)])));
console.log('offer:', offer);

const im = {};
for (const k of ['hero', 'deal', 'science', 'proof']) {
  im[k] = await fetchImageDataUrl(images[k]).catch(e => { console.error(k, e.message); return null; });
  console.log(`  ${k}: ${im[k] ? (im[k].length / 1024).toFixed(0) + 'KB dataURL' : 'NULL'}`);
}

const fonts = await loadFonts();
const slides = buildSlides(im, offer, market);
mkdirSync('/tmp/promo', { recursive: true });
const names = ['1_cover', '2_science', '3_proof', '4_deal', '5_cta'];
for (let i = 0; i < slides.length; i++) {
  const png = await bakePng(slides[i], fonts);
  writeFileSync(`/tmp/promo/${names[i]}.png`, png);
  console.log(`  ✓ /tmp/promo/${names[i]}.png (${(png.length / 1024).toFixed(0)}KB)`);
}
const { caption, hashtags } = buildCaption(offer, market);
console.log('\n=== CAPTION ===\n' + caption + '\n\n' + hashtags);

// 로컬 검증: 오너-후킹 전환광고 Piece A 1장을 /tmp/ad_owner.png 로 굽는다(배포·Blob·시드 없이).
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadFonts, bakePng } from '../api/creator/render-card.js';
import { fetchImageDataUrl } from '../api/creator/render-promo.js';

// render-ad 의 buildAd 를 그대로 쓰기 위해 동적 import 후 내부 함수 재현은 불가 → 같은 입력으로 엔드포인트 모듈의 renderAd 는 Blob/seed 포함.
// 여기선 시각검증만: buildAd 를 재노출하지 않았으므로, 동일 레이아웃을 renderAd 경로 대신 직접 호출 위해 import.
import * as RA from '../api/creator/render-ad.js';

const owner = 'https://d8j0ntlcm91z4.cloudfront.net/user_38PAdEfRanROtVrNU82Klb8ZOSl/hf_20260611_015718_b9e8f457-cd99-4cac-92e7-e1872970ef9f.png';
const product = 'https://millimilli.kr/web/product/small/202606/5bd5f3743667a7a3056ed74fc1de916d.png';

// buildAd 는 비공개 → 시각검증을 위해 export 가 없으면 renderAd 의 합성 로직과 동일하게 재호출 불가.
// 대신 fetchImageDataUrl + (이 스크립트에 build 로직 복제 없이) 모듈의 __buildAdForTest 사용.
if (!RA.__buildAdForTest) { console.error('render-ad.js 에 __buildAdForTest export 필요'); process.exit(2); }

const ownerImg = await fetchImageDataUrl(owner);
const productImg = await fetchImageDataUrl(product).catch(() => null);
console.log('owner', ownerImg ? 'OK' : 'NULL', '| product', productImg ? 'OK' : 'NULL');
const fonts = await loadFonts();
const png = await bakePng(RA.__buildAdForTest({ ownerImg, productImg, hook: null, offer: null }), fonts);
mkdirSync('/tmp', { recursive: true });
writeFileSync('/tmp/ad_owner.png', png);
console.log('wrote /tmp/ad_owner.png', (png.length / 1024).toFixed(0) + 'KB');

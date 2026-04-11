// ── ScreenshotOne 캡처 (모바일 뷰 + 팝업 차단) ──
async function capture(url, options = {}) {
  if (!process.env.SCREENSHOT_ACCESS_KEY) return null;
  const params = new URLSearchParams({
    access_key: process.env.SCREENSHOT_ACCESS_KEY,
    url,
    viewport_width: '375',
    viewport_height: '812',
    device_scale_factor: '3',
    format: 'jpg',
    image_quality: '90',
    full_page: 'false',
    delay: options.delay || '5',
    // 팝업/배너 완전 차단
    block_ads: 'true',
    block_cookie_banners: 'true',
    hide_cookie_banners: 'true',
    ignore_host_errors: 'true',
    wait_until: 'networkidle',
    // 동의 버튼 자동 클릭
    click_accept: 'true',
    // 최신 iPhone Safari UA
    user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    // 셀렉터 지정 시 해당 영역만 캡처
    ...(options.selector ? { selector: options.selector } : {}),
    // 팝업 닫기 스크립트 (CSS로 강제 숨기기)
    styles: 'dialog,.modal,.popup,.layer_pop,.btn_close_pop,.app-banner,.smart-banner,.login-popup,.dim,.overlay,[class*="modal"],[class*="popup"],[class*="layer"],[id*="modal"],[id*="popup"]{display:none!important;visibility:hidden!important;}',
  });
  try {
    const res = await fetch(`https://api.screenshotone.com/take?${params}`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) { console.warn(`[SS] Too small (${buf.length}b): ${url.substring(0, 50)}`); return null; }
    console.log(`[SS] OK ${buf.length}b: ${url.substring(0, 50)}`);
    return buf;
  } catch (e) { console.warn(`[SS] Error: ${e.message}`); return null; }
}

// ── 쿠팡 (모바일 + 제품 영역 셀렉터) ──
async function captureCoupang(keyword) {
  console.log(`[SS] Coupang: ${keyword}`);
  // 모바일 쿠팡 검색
  let buf = await capture(`https://m.coupang.com/nm/search?q=${encodeURIComponent(keyword)}`, { selector: '.search-content' });
  if (buf) return buf;
  // fallback: 데스크탑 쿠팡
  return capture(`https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}&channel=user`);
}

// ── Pinterest (모바일) ──
async function capturePinterest(keyword) {
  console.log(`[SS] Pinterest: ${keyword}`);
  // 모바일 Pinterest (로그인 벽 낮음)
  return capture(`https://kr.pinterest.com/search/pins/?q=${encodeURIComponent(keyword)}`);
}

// ── 올리브영 (글로벌 모바일 → 국내 → 쿠팡 fallback) ──
async function captureOliveyoung(keyword) {
  console.log(`[SS] Oliveyoung: ${keyword}`);
  let buf = await capture(`https://global.oliveyoung.com/search?query=${encodeURIComponent(keyword)}`);
  if (buf) return buf;
  // 모바일 국내
  buf = await capture(`https://m.oliveyoung.co.kr/m/product/search?query=${encodeURIComponent(keyword)}`, { selector: '.cate_prd_list' });
  if (buf) return buf;
  console.log(`[SS] Oliveyoung failed → Coupang`);
  return captureCoupang(keyword);
}

// ── Zernio 업로드 ──
async function uploadToZernio(buf) {
  if (!buf || !process.env.ZERNIO_API_KEY) return null;
  try {
    const formData = new FormData();
    formData.append('files', new Blob([buf], { type: 'image/jpeg' }), 'img.jpg');
    const r = await fetch('https://zernio.com/api/v1/media', {
      method: 'POST', headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` }, body: formData,
    });
    return (await r.json()).files?.[0]?.url || null;
  } catch { return null; }
}

// ── 통합 이미지 획득 ──
export async function getImageUrl(type, keyword) {
  if (!keyword) return null;

  // 1차: 지정된 소스
  let buf = null;
  if (type === 'coupang' || type === '쿠팡') buf = await captureCoupang(keyword);
  else if (type === 'oliveyoung' || type === '올리브영') buf = await captureOliveyoung(keyword);
  else if (type === 'pinterest' || type === 'google' || type === '핀터레스트') buf = await capturePinterest(keyword);

  if (buf) { const url = await uploadToZernio(buf); if (url) return url; }

  // 2차: fallback (pinterest→쿠팡, 쿠팡→pinterest)
  if (type === 'pinterest' || type === 'google') {
    buf = await captureCoupang(keyword);
    if (buf) { const url = await uploadToZernio(buf); if (url) return url; }
  } else {
    buf = await capturePinterest(keyword + ' aesthetic');
    if (buf) { const url = await uploadToZernio(buf); if (url) return url; }
  }

  return null;
}

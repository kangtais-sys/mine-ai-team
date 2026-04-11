// ── ScreenshotOne 캡처 ──
async function capture(url, options = {}) {
  if (!process.env.SCREENSHOT_ACCESS_KEY) return null;
  const params = new URLSearchParams({
    access_key: process.env.SCREENSHOT_ACCESS_KEY,
    url,
    viewport_width: options.width || '1400',
    viewport_height: options.height || '900',
    format: 'jpg',
    image_quality: '90',
    full_page: 'false',
    delay: options.delay || '5',
    block_ads: 'true',
    block_cookie_banners: 'true',
    ignore_host_errors: 'true',
    ...(options.user_agent ? { user_agent: options.user_agent } : {}),
  });
  try {
    const res = await fetch(`https://api.screenshotone.com/take?${params}`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // 1KB 이하면 빈 이미지 (차단됨)
    if (buf.length < 1000) { console.warn(`[Screenshot] Too small (${buf.length}b): ${url.substring(0, 60)}`); return null; }
    return buf;
  } catch { return null; }
}

// ── 쿠팡 캡처 ──
async function captureCoupang(keyword) {
  console.log(`[Screenshot] Coupang: ${keyword}`);
  return capture(`https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}&channel=user`, { delay: '5' });
}

// ── Pinterest 캡처 (모바일 UA로 로그인 벽 우회) ──
async function capturePinterest(keyword) {
  console.log(`[Screenshot] Pinterest: ${keyword}`);
  return capture(
    `https://kr.pinterest.com/search/pins/?q=${encodeURIComponent(keyword)}`,
    { delay: '5', user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1' }
  );
}

// ── 올리브영 (글로벌 시도 → 실패 시 쿠팡) ──
async function captureOliveyoung(keyword) {
  console.log(`[Screenshot] Oliveyoung: ${keyword}`);
  // 글로벌 시도
  let buf = await capture(`https://global.oliveyoung.com/search?query=${encodeURIComponent(keyword)}`, { delay: '5' });
  if (buf) return buf;
  // 국내 시도
  buf = await capture(`https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=${encodeURIComponent(keyword)}`, { delay: '5' });
  if (buf) return buf;
  // 올리브영 실패 → 쿠팡으로 fallback
  console.log(`[Screenshot] Oliveyoung failed, trying Coupang`);
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

// ── 통합 이미지 획득 (타입별) ──
export async function getImageUrl(type, keyword) {
  if (!keyword) return null;

  // 쿠팡
  if (type === 'coupang' || type === '쿠팡') {
    const buf = await captureCoupang(keyword);
    if (buf) { const url = await uploadToZernio(buf); if (url) return url; }
  }

  // 올리브영 (실패 시 쿠팡 자동 fallback)
  if (type === 'oliveyoung' || type === '올리브영') {
    const buf = await captureOliveyoung(keyword);
    if (buf) { const url = await uploadToZernio(buf); if (url) return url; }
  }

  // Pinterest (모바일 UA)
  if (type === 'pinterest' || type === 'google' || type === '핀터레스트') {
    const buf = await capturePinterest(keyword);
    if (buf) { const url = await uploadToZernio(buf); if (url) return url; }
  }

  // Fallback chain: pinterest 실패 → 쿠팡, 쿠팡 실패 → pinterest
  if (type === 'pinterest' || type === 'google') {
    const buf = await captureCoupang(keyword);
    if (buf) { const url = await uploadToZernio(buf); if (url) return url; }
  }
  if (type === 'oliveyoung' || type === 'coupang') {
    const buf = await capturePinterest(keyword + ' aesthetic');
    if (buf) { const url = await uploadToZernio(buf); if (url) return url; }
  }

  return null; // 전부 실패 시 sisuru-select에서 Imagen fallback
}

// ── ScreenshotOne 캡처 ──
export async function captureScreenshot(url, options = {}) {
  if (!process.env.SCREENSHOT_ACCESS_KEY) return null;
  const params = new URLSearchParams({
    access_key: process.env.SCREENSHOT_ACCESS_KEY,
    url,
    viewport_width: options.width || '1400',
    viewport_height: options.height || '900',
    format: 'jpg',
    image_quality: '90',
    full_page: 'false',
    delay: options.delay || '3',
    block_ads: 'true',
    block_cookie_banners: 'true',
  });
  try {
    const res = await fetch(`https://api.screenshotone.com/take?${params}`);
    if (!res.ok || !res.headers.get('content-type')?.includes('image')) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch { return null; }
}

// ── 올리브영 글로벌 (로그인 불필요) ──
export async function captureOliveyoung(keyword) {
  const url = `https://global.oliveyoung.com/product/list?searchWord=${encodeURIComponent(keyword)}`;
  return captureScreenshot(url, { width: '1400', height: '900', delay: '3' });
}

// ── Pinterest 이미지 URL 직접 추출 (스크린샷 X, HTML 파싱) ──
export async function getPinterestImageUrl(keyword) {
  try {
    const url = `https://kr.pinterest.com/search/pins/?q=${encodeURIComponent(keyword)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Pinterest CDN 이미지 URL 추출 (736x = 중간 해상도)
    const matches = html.match(/https:\/\/i\.pinimg\.com\/736x\/[a-zA-Z0-9/_.-]+\.jpg/g);
    if (!matches || matches.length === 0) return null;

    // 중복 제거 + 처음 5개 중 랜덤 선택 (다양성)
    const unique = [...new Set(matches)];
    const pick = unique[Math.floor(Math.random() * Math.min(unique.length, 5))];
    console.log(`[Pinterest] Found ${unique.length} images, picked: ${pick?.substring(0, 60)}`);
    return pick;
  } catch (e) {
    console.warn('[Pinterest] Extract failed:', e.message);
    return null;
  }
}

// ── 통합: 타입별 이미지 URL 획득 ──
export async function getImageUrl(type, keyword) {
  // 1. Pinterest 직접 URL
  if (type === 'pinterest' || type === 'google') {
    const pinUrl = await getPinterestImageUrl(keyword);
    if (pinUrl) return pinUrl;
  }

  // 2. 올리브영 글로벌 스크린샷 → Zernio 업로드
  if (type === 'oliveyoung' || type === '올리브영') {
    const buf = await captureOliveyoung(keyword);
    if (buf) return await uploadToZernio(buf);
  }

  // 3. Fallback: Pinterest 실패 시 올리브영, 올리브영 실패 시 Pinterest
  if (type === 'pinterest' || type === 'google') {
    const buf = await captureOliveyoung(keyword);
    if (buf) return await uploadToZernio(buf);
  }
  if (type === 'oliveyoung') {
    const pinUrl = await getPinterestImageUrl(keyword + ' aesthetic');
    if (pinUrl) return pinUrl;
  }

  return null;
}

// Zernio 미디어 업로드
async function uploadToZernio(buf) {
  if (!process.env.ZERNIO_API_KEY) return null;
  try {
    const formData = new FormData();
    formData.append('files', new Blob([buf], { type: 'image/jpeg' }), 'screenshot.jpg');
    const r = await fetch('https://zernio.com/api/v1/media', {
      method: 'POST', headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` }, body: formData,
    });
    return (await r.json()).files?.[0]?.url || null;
  } catch { return null; }
}

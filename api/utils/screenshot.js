// ScreenshotOne API
export async function captureScreenshot(url, options = {}) {
  if (!process.env.SCREENSHOT_ACCESS_KEY) return null;
  const params = new URLSearchParams({
    access_key: process.env.SCREENSHOT_ACCESS_KEY,
    url,
    viewport_width: options.width || '1200',
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

// 올리브영 제품 검색 캡처
export async function captureOliveyoung(keyword) {
  return captureScreenshot(
    `https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=${encodeURIComponent(keyword)}`,
    { delay: '4' }
  );
}

// Google Images 감성 이미지 캡처 (Pinterest 대체 — 로그인 벽 없음)
export async function captureGoogleImages(keyword) {
  return captureScreenshot(
    `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(keyword)}+aesthetic`,
    { delay: '3' }
  );
}

// 캡처 → Zernio 업로드 → URL
export async function captureAndUpload(type, keyword) {
  let buf = null;

  if (type === 'oliveyoung' || type === '올리브영') {
    buf = await captureOliveyoung(keyword);
  } else if (type === 'google' || type === 'pinterest' || type === 'Pinterest') {
    // Pinterest → Google Images로 대체 (Pinterest 로그인 벽)
    buf = await captureGoogleImages(keyword);
  }

  // fallback: 올리브영 실패 시 Google, Google 실패 시 올리브영
  if (!buf && type === 'oliveyoung') buf = await captureGoogleImages(keyword);
  if (!buf && (type === 'google' || type === 'pinterest')) buf = await captureOliveyoung(keyword);

  if (!buf || !process.env.ZERNIO_API_KEY) return null;
  try {
    const formData = new FormData();
    formData.append('files', new Blob([buf], { type: 'image/jpeg' }), 'screenshot.jpg');
    const r = await fetch('https://zernio.com/api/v1/media', {
      method: 'POST', headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` }, body: formData,
    });
    return (await r.json()).files?.[0]?.url || null;
  } catch { return null; }
}

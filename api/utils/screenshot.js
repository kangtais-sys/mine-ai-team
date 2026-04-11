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

export async function captureOliveyoung(keyword) {
  const url = `https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=${encodeURIComponent(keyword)}`;
  return captureScreenshot(url, { width: '1200', height: '900', delay: '3' });
}

export async function capturePinterest(keyword) {
  const url = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(keyword)}+aesthetic&rs=typed`;
  return captureScreenshot(url, { width: '1200', height: '900', delay: '4' });
}

// 캡처 → Zernio 업로드 → URL
export async function captureAndUpload(type, keyword) {
  let buf = null;

  // 1순위: 올리브영
  if (type === '올리브영' || type === 'oliveyoung') {
    buf = await captureOliveyoung(keyword);
  }
  // 2순위: Pinterest
  if (!buf && (type === 'Pinterest' || type === 'pinterest' || type === '핀터레스트')) {
    buf = await capturePinterest(keyword);
  }
  // Pinterest 실패 시 올리브영 fallback
  if (!buf && type === 'Pinterest') {
    buf = await captureOliveyoung(keyword);
  }

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

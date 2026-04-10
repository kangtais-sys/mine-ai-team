// ScreenshotOne API로 웹페이지 특정 영역 캡처
// https://screenshotone.com/docs

export async function captureScreenshot(url, options = {}) {
  const apiKey = process.env.SCREENSHOTONE_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    access_key: apiKey,
    url,
    viewport_width: options.width || '1080',
    viewport_height: options.height || '1350',
    device_scale_factor: '2',
    format: 'png',
    block_ads: 'true',
    block_cookie_banners: 'true',
    delay: options.delay || '3',
    ...(options.selector ? { selector: options.selector } : {}),
    ...(options.full_page === false ? { full_page: 'false' } : {}),
  });

  try {
    const res = await fetch(`https://api.screenshotone.com/take?${params}`);
    if (!res.ok) {
      console.warn(`[Screenshot] Failed ${res.status}: ${url}`);
      return null;
    }
    const buf = await res.arrayBuffer();
    return Buffer.from(buf);
  } catch (e) {
    console.warn(`[Screenshot] Error:`, e.message);
    return null;
  }
}

// 올리브영 제품 검색 결과 캡처
export async function captureOliveyoung(keyword) {
  const url = `https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=${encodeURIComponent(keyword)}`;
  return captureScreenshot(url, {
    selector: '.cate_prd_list', // 상품 리스트 영역
    width: '1080',
    height: '1350',
    delay: '5',
  });
}

// Pinterest 검색 결과 캡처
export async function capturePinterest(keyword) {
  const url = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(keyword)}`;
  return captureScreenshot(url, {
    width: '1080',
    height: '1350',
    delay: '5',
    full_page: false,
  });
}

// 캡처 → Zernio 업로드 → URL 반환
export async function captureAndUpload(type, keyword) {
  let buf;
  if (type === '올리브영' || type === '올리브영캡처') {
    buf = await captureOliveyoung(keyword);
  } else if (type === 'Pinterest' || type === '핀터레스트') {
    buf = await capturePinterest(keyword);
  } else {
    return null;
  }

  if (!buf || !process.env.ZERNIO_API_KEY) return null;

  try {
    const formData = new FormData();
    formData.append('files', new Blob([buf], { type: 'image/png' }), 'screenshot.png');
    const uploadRes = await fetch('https://zernio.com/api/v1/media', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` },
      body: formData,
    });
    const data = await uploadRes.json();
    return data.files?.[0]?.url || null;
  } catch {
    return null;
  }
}

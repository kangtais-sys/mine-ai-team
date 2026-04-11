// ── Pinterest 이미지 URL 직접 추출 (fetch + 정규식) ──
async function getPinterestImages(keyword) {
  try {
    const res = await fetch(
      `https://kr.pinterest.com/search/pins/?q=${encodeURIComponent(keyword + ' aesthetic')}`,
      { headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      }}
    );
    if (!res.ok) return [];
    const html = await res.text();
    const matches = html.match(/https:\/\/i\.pinimg\.com\/736x\/[a-f0-9/]+\.jpg/g) || [];
    const unique = [...new Set(matches)];
    console.log(`[Pinterest] "${keyword}": ${unique.length} images found`);
    return unique;
  } catch (e) {
    console.warn(`[Pinterest] Error: ${e.message}`);
    return [];
  }
}

// ── 올리브영 CDN 이미지 URL 추출 ──
async function getOliveyoungImages(keyword) {
  try {
    const res = await fetch(
      `https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=${encodeURIComponent(keyword)}`,
      { headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      }}
    );
    if (!res.ok) return [];
    const html = await res.text();
    const matches = html.match(/https:\/\/image\.oliveyoung\.co\.kr\/[^\s"']+\.(?:jpg|png|webp)/gi) || [];
    const unique = [...new Set(matches)].filter(u => u.includes('/goods/') || u.includes('/product/'));
    console.log(`[Oliveyoung] "${keyword}": ${unique.length} images found`);
    return unique;
  } catch (e) {
    console.warn(`[Oliveyoung] Error: ${e.message}`);
    return [];
  }
}

// ── 쿠팡 CDN 이미지 URL 추출 ──
async function getCoupangImages(keyword) {
  try {
    const res = await fetch(
      `https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}&channel=user`,
      { headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html',
      }}
    );
    if (!res.ok) return [];
    const html = await res.text();
    const matches = html.match(/https:\/\/thumbnail[0-9]*\.coupangcdn\.com\/[^\s"']+\.(?:jpg|png|webp)/gi) || [];
    const unique = [...new Set(matches)];
    console.log(`[Coupang] "${keyword}": ${unique.length} images found`);
    return unique;
  } catch (e) {
    console.warn(`[Coupang] Error: ${e.message}`);
    return [];
  }
}

// ── 다이소 CDN 이미지 URL 추출 ──
async function getDaisoImages(keyword) {
  try {
    const res = await fetch(
      `https://www.daiso.co.kr/goods/search?query=${encodeURIComponent(keyword)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' }}
    );
    if (!res.ok) return [];
    const html = await res.text();
    const matches = html.match(/https:\/\/[^\s"']*daiso[^\s"']*\.(?:jpg|png|webp)/gi) || [];
    const unique = [...new Set(matches)];
    console.log(`[Daiso] "${keyword}": ${unique.length} images found`);
    return unique;
  } catch (e) {
    console.warn(`[Daiso] Error: ${e.message}`);
    return [];
  }
}

// ── 통합: 타입별 이미지 URL 반환 ──
export async function getImageUrl(type, keyword) {
  if (!keyword) return null;

  let images = [];

  // 1차: 지정 소스
  if (type === 'oliveyoung' || type === '올리브영') images = await getOliveyoungImages(keyword);
  else if (type === 'coupang' || type === '쿠팡') images = await getCoupangImages(keyword);
  else if (type === 'daiso' || type === '다이소') images = await getDaisoImages(keyword);
  else images = await getPinterestImages(keyword); // pinterest/google/기본

  if (images.length > 0) {
    const pick = images[Math.floor(Math.random() * Math.min(images.length, 5))];
    return pick;
  }

  // 2차: Pinterest fallback (다른 소스 실패 시)
  if (type !== 'pinterest') {
    images = await getPinterestImages(keyword + ' korean beauty');
    if (images.length > 0) return images[Math.floor(Math.random() * Math.min(images.length, 5))];
  }

  // 3차: 올리브영 fallback
  if (type !== 'oliveyoung') {
    images = await getOliveyoungImages(keyword);
    if (images.length > 0) return images[0];
  }

  console.warn(`[Image] All sources failed for "${keyword}"`);
  return null;
}

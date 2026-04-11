// ── Pinterest 이미지 검색 (카테고리+주제 기반 지능형) ──

const categoryBase = {
  '시술': { moodKeywords: ['글로우 피부', '탄력 피부', '피부결 클로즈업', '광채 얼굴'], direction: '피부 클로즈업 시술 전후 얼굴' },
  '성형': { moodKeywords: ['자연스러운 메이크업', '맑은 피부', '눈매 클로즈업', '턱선 얼굴'], direction: '자연스러운 피부 얼굴 클로즈업' },
  '제품': { moodKeywords: ['뷰티 테이블', '스킨케어 루틴', '욕실 감성', '크림 텍스처'], direction: '뷰티 감성 플랫레이 또는 사용 장면' },
  '성분': { moodKeywords: ['피부 클로즈업', '세럼 텍스처', '글로우 스킨', '수분 피부'], direction: '성분 감성 또는 피부 결과물' },
  '부작용': { moodKeywords: ['피부 케어', '트러블 케어', '민감성 피부', '피부과 감성'], direction: '진지한 피부 케어 클로즈업' },
  '가격비교': { moodKeywords: ['뷰티 쇼핑', '드럭스토어 감성', '올리브영 하울', '가성비 뷰티'], direction: '라이프스타일 감성 쇼핑' },
  '트렌드': { moodKeywords: ['트렌디 메이크업', '감성 뷰티', '핀터레스트 뷰티', 'Y2K 뷰티'], direction: 'MZ 뷰티 트렌드 감성' },
};

const topicImageMap = {
  '아이크림': '눈가 주름 눈밑 피부 클로즈업 MZ 일상', '눈': '눈메이크업 눈가 클로즈업 감성',
  '립': '립메이크업 글로시 립 감성 뷰티', '입술': '립틴트 글로시 입술 클로즈업',
  '선크림': '선케어 여름 피부 자외선 차단 감성 야외', '모공': '모공 피부결 클로즈업 세럼 텍스처',
  '수분': '글로우 수분 피부 세럼 물광', '탄력': '탄력 피부 얼굴선 리프팅 감성',
  '미백': '맑은 피부 화이트닝 글로우', '주름': '안티에이징 피부 케어 클로즈업',
  '보톡스': '자연스러운 얼굴 피부 클로즈업 시술 감성', '필러': '볼륨감 얼굴 자연스러운 메이크업',
  '레이저': '피부 클리닉 글로우 피부 시술 결과', '리프팅': '탄력 턱선 얼굴선 리프팅 감성',
  '물광': '물광 주사 글로우 피부 수분 광채', '다이소': '다이소 뷰티 감성 드럭스토어 하울',
  '올리브영': '올리브영 하울 뷰티 쇼핑 감성', '세럼': '세럼 텍스처 글로우 스킨 뷰티',
  '크림': '크림 텍스처 스킨케어 감성 뷰티 테이블', '가성비': 'MZ 뷰티 하울 드럭스토어 감성',
  '편의점': '편의점 뷰티 감성 MZ 일상', '쿠팡': '쿠팡 뷰티 하울 언박싱 감성',
};

function buildPinterestQuery(category, topic, slideNum, title, imageContext) {
  const base = categoryBase[category] || categoryBase['트렌드'];

  // 주제에서 매칭 키워드 찾기
  let topicQ = '';
  for (const [kw, desc] of Object.entries(topicImageMap)) {
    if (topic.includes(kw) || (title || '').includes(kw) || (imageContext || '').includes(kw)) {
      topicQ = desc; break;
    }
  }

  // imageContext 우선 사용
  if (imageContext) topicQ = imageContext + ' 감성 뷰티';

  let q = '';
  switch (slideNum) {
    case 1: q = (topicQ || base.moodKeywords[0]) + ' 감성 핀터레스트'; break;
    case 2: q = (topicQ || base.moodKeywords[1]) + ' 클로즈업 MZ'; break;
    case 3: q = (topicQ || base.direction) + ' 뷰티 케어'; break;
    case 4: q = base.moodKeywords[Math.floor(Math.random() * base.moodKeywords.length)] + ' 비교 뷰티'; break;
    case 5: q = 'MZ 뷰티 라이프스타일 감성 일상 피부케어'; break;
    case 6: q = '스킨케어 루틴 뷰티 테이블 감성 정리'; break;
    default: q = topicQ || base.direction;
  }

  if (!q.includes('감성') && !q.includes('사진')) q += ' 감성 사진';
  return q;
}

async function fetchPinterestImage(query) {
  try {
    const res = await fetch(`https://kr.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'Referer': 'https://kr.pinterest.com/',
      }
    });
    const html = await res.text();
    const matches = html.match(/https:\/\/i\.pinimg\.com\/736x\/[a-f0-9/]+\.jpg/g) || [];
    const unique = [...new Set(matches)];
    if (unique.length === 0) { console.warn(`[Pinterest] 0 results: "${query.substring(0, 30)}"`); return null; }

    // 앞 2개 스킵(광고) + 랜덤 선택
    const candidates = unique.length > 5 ? unique.slice(2, 15) : unique;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    console.log(`[Pinterest] "${query.substring(0, 25)}" → ${unique.length}개 중 선택`);
    return pick;
  } catch (e) {
    console.warn(`[Pinterest] Error: ${e.message}`);
    return null;
  }
}

// ── 통합: 슬라이드별 이미지 URL 반환 ──
export async function getImageUrl(type, keyword, options = {}) {
  if (!keyword) return null;
  const { category, topic, slideNum, title, imageContext } = options;

  // Pinterest 지능형 검색
  const query = buildPinterestQuery(category || '트렌드', topic || keyword, slideNum || 1, title, imageContext || keyword);
  const url = await fetchPinterestImage(query);
  if (url) return url;

  // fallback: 원래 키워드로 재시도
  const url2 = await fetchPinterestImage(keyword + ' 뷰티 감성');
  if (url2) return url2;

  console.warn(`[Image] All failed: "${keyword}"`);
  return null;
}

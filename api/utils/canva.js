import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CANVA_API = 'https://api.canva.com/rest/v1';
const TEMPLATE_ID = 'DAHGRefiPUY';

// 슬라이드별 element ID 매핑
const SLIDE_ELEMENTS = {
  1: { subtitle: 'PBQnrYjN0zCRC3Qh-LBVwGtM2N0t4XDbL', title: 'PBQnrYjN0zCRC3Qh-LBzWG8127hWWVY46', bg: 'PBQnrYjN0zCRC3Qh' },
  2: { subtitle: 'PB3VCDYPtHydNdT8-LB7917xn6XZcgpjN', title: 'PB3VCDYPtHydNdT8-LBKQ0zWqzn66jH6g', bg: 'PB3VCDYPtHydNdT8' },
  3: { subtitle: 'PBCqmxYrmz7rSD4l-LBWDqLtL3tZy8wd8', body: 'PBCqmxYrmz7rSD4l-LBbqcgKT0CWPGzTB', bg: 'PBCqmxYrmz7rSD4l' },
  4: { subtitle: 'PBJwgDJyb9kLGzXQ-LBpTTZvVGdjv6156', body: 'PBJwgDJyb9kLGzXQ-LBGPTXHzVPXLmB3C', bg: 'PBJwgDJyb9kLGzXQ' },
  5: { subtitle: 'PBLKRZrylx2bpQ8k-LBb02BjHpp8vpMgN', body: 'PBLKRZrylx2bpQ8k-LBZwClRY7j080DJg', bg: 'PBLKRZrylx2bpQ8k' },
  6: { subtitle: 'PBmy6rSmx3gy064x-LBMrQN66JprCStGs', body: 'PBmy6rSmx3gy064x-LBzYknXmH8WsCxH5', bg: 'PBmy6rSmx3gy064x' },
  7: { cta: 'PBMrbcC5vhggqX8S-LBD4pGxd1XFSMFTW', bg: 'PBMrbcC5vhggqX8S' }, // 고정
};

async function getCanvaToken() {
  let token = await redis.get('canva:access_token');
  if (token) return token;

  const refreshToken = await redis.get('canva:refresh_token');
  if (!refreshToken) throw new Error('Canva 인증 필요 — /api/auth/canva 에서 연동');

  const res = await fetch(`${CANVA_API}/oauth/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error('Canva token refresh failed: ' + (data.error || ''));

  await redis.set('canva:access_token', data.access_token, { ex: data.expires_in || 3600 });
  if (data.refresh_token) await redis.set('canva:refresh_token', data.refresh_token);

  return data.access_token;
}

async function canvaApi(method, path, body) {
  const token = await getCanvaToken();
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${CANVA_API}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(`Canva API ${res.status}: ${JSON.stringify(data).substring(0, 200)}`);
  return data;
}

// Canva에 이미지 에셋 업로드
async function uploadAsset(imageUrl) {
  const token = await getCanvaToken();

  // Import from URL
  const res = await fetch(`${CANVA_API}/asset-uploads`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: imageUrl }),
  });
  const data = await res.json();
  return data.asset?.id || data.job?.id;
}

// 7장 카드뉴스 생성
export async function createCardNews(slides, imageUrls) {
  // 1. 템플릿에서 새 디자인 생성
  const design = await canvaApi('POST', '/designs', {
    design_type: { type: 'preset', name: 'instagramPost' },
    template_id: TEMPLATE_ID,
  });
  const designId = design.design?.id;
  if (!designId) throw new Error('Design creation failed');
  console.log('[Canva] Design created:', designId);

  // 2. 편집 트랜잭션 시작
  const tx = await canvaApi('POST', `/designs/${designId}/editing-transactions`);
  const txId = tx.editing_transaction?.id;
  console.log('[Canva] Transaction started:', txId);

  // 3. 장별 텍스트 교체
  const operations = [];
  for (const slide of slides) {
    const els = SLIDE_ELEMENTS[slide.slide];
    if (!els) continue;
    if (slide.slide === 7) continue; // CTA 고정

    // 소제목/제목/본문 텍스트 교체
    if (els.subtitle && (slide.type === 'hook' || slide.type === 'hook_deep')) {
      operations.push({ operation: 'replace_text', element_id: els.subtitle, text: slide.subtitle || slide.type === 'hook' ? '후킹' : '후킹 심화' });
    }
    if (els.title && slide.text) {
      operations.push({ operation: 'replace_text', element_id: els.title, text: slide.text });
    }
    if (els.body && slide.text) {
      operations.push({ operation: 'replace_text', element_id: els.body, text: slide.text });
    }
    if (els.subtitle && slide.slide >= 3) {
      operations.push({ operation: 'replace_text', element_id: els.subtitle, text: slide.subtitle || `STEP ${slide.slide - 2}` });
    }
  }

  // 4. 이미지 교체 (있는 경우)
  for (let i = 0; i < Math.min(imageUrls.length, 6); i++) {
    const url = imageUrls[i];
    if (!url) continue;
    const els = SLIDE_ELEMENTS[i + 1];
    if (!els?.bg) continue;

    try {
      const assetId = await uploadAsset(url);
      if (assetId) {
        operations.push({ operation: 'update_fill', element_id: els.bg, asset_id: assetId });
      }
    } catch (e) {
      console.warn(`[Canva] Image ${i + 1} upload failed:`, e.message);
    }
  }

  // 5. 편집 실행
  if (operations.length > 0) {
    await canvaApi('POST', `/designs/${designId}/editing-transactions/${txId}/operations`, { operations });
    console.log(`[Canva] ${operations.length} operations applied`);
  }

  // 6. 트랜잭션 커밋
  await canvaApi('POST', `/designs/${designId}/editing-transactions/${txId}/commit`);
  console.log('[Canva] Transaction committed');

  // 7. PNG Export
  const exportRes = await canvaApi('POST', `/designs/${designId}/exports`, {
    format: { type: 'png' },
    quality: 'high',
  });

  // Export는 비동기 — 폴링
  let exportUrl = null;
  const exportId = exportRes.export?.id || exportRes.job?.id;
  if (exportId) {
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise(r => setTimeout(r, 3000));
      const status = await canvaApi('GET', `/designs/${designId}/exports/${exportId}`);
      if (status.export?.status === 'completed' || status.export?.urls) {
        exportUrl = status.export?.urls?.[0]?.url || status.export?.url;
        break;
      }
    }
  }

  console.log('[Canva] Export:', exportUrl ? 'success' : 'pending');
  return { designId, exportUrl, operationsCount: operations.length };
}

export { getCanvaToken, SLIDE_ELEMENTS, TEMPLATE_ID };

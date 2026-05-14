import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ── Higgsfield API 설정 ──────────────────────────────────────────
// 실제 플랫폼 URL: platform.higgsfield.ai (기존 api.higgsfield.ai 는 구버전)
const HIGGSFIELD_BASE = 'https://platform.higgsfield.ai';

function higgsfieldAuth() {
  const key = process.env.HIGGSFIELD_API_KEY;
  const secret = process.env.HIGGSFIELD_API_SECRET;
  if (!key) throw new Error('HIGGSFIELD_API_KEY 없음');
  // 시크릿 있으면 Key key:secret, 없으면 Key key
  return secret ? `Key ${key}:${secret}` : `Key ${key}`;
}

// 영상 생성 요청 → request_id 반환 (비동기 처리)
async function requestHiggsfieldVideo(visualPrompt, format, personaImageUrl) {
  const auth = higgsfieldAuth();

  // 페르소나 이미지가 실제 HTTP URL인 경우에만 image-to-video 사용
  // base64 data URL은 Higgsfield API가 지원 안 함 → text-to-video 폴백
  const isHttpUrl = personaImageUrl?.startsWith('http');

  const modelId = isHttpUrl
    ? 'kling-video/v2.1/pro/image-to-video'  // Kling 2.1 Pro image-to-video
    : 'higgsfield-ai/dop/turbo';              // Higgsfield DoP Turbo (text-to-video)

  const body = isHttpUrl
    ? { image_url: personaImageUrl, prompt: visualPrompt, duration: 5, aspect_ratio: '9:16' }
    : { prompt: visualPrompt, duration: 5, aspect_ratio: '9:16' };

  console.log(`[Creator Media] Higgsfield mode: ${isHttpUrl ? 'image-to-video (Kling 2.1)' : 'text-to-video (DoP Turbo)'}`);

  const res = await fetch(`${HIGGSFIELD_BASE}/${modelId}`, {
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    // image-to-video 실패 시 text-to-video DoP Turbo로 폴백
    if (isHttpUrl) {
      console.warn(`[Creator Media] Kling image-to-video 실패, DoP Turbo로 폴백: ${err.substring(0, 150)}`);
      const fallback = await fetch(`${HIGGSFIELD_BASE}/higgsfield-ai/dop/turbo`, {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: visualPrompt, duration: 5, aspect_ratio: '9:16' }),
      });
      if (!fallback.ok) {
        const fbErr = await fallback.text();
        throw new Error(`Higgsfield DoP Turbo 폴백 실패 ${fallback.status}: ${fbErr.substring(0, 200)}`);
      }
      const fbData = await fallback.json();
      if (!fbData.request_id) throw new Error(`request_id 없음 (폴백): ${JSON.stringify(fbData)}`);
      return fbData.request_id;
    }
    throw new Error(`Higgsfield ${modelId} ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  if (!data.request_id) throw new Error(`Higgsfield request_id 없음: ${JSON.stringify(data)}`);
  return data.request_id;
}

// 상태 조회 → { status, videoUrl, raw }
export async function checkHiggsfieldStatus(requestId) {
  const auth = higgsfieldAuth();

  const res = await fetch(`${HIGGSFIELD_BASE}/requests/${requestId}/status`, {
    headers: { 'Authorization': auth },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Higgsfield status ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  // status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw'
  return {
    status: data.status,
    videoUrl: data.video?.url || null,
    raw: data,
  };
}

// ── 카드뉴스 템플릿 4종 ──────────────────────────────────────────
const CARD_TEMPLATES = {
  clean: { bg: '#FFFFFF', text: '#1A1A1A', accent: '#1A1A1A', font: "'Noto Sans KR', sans-serif" },
  bold:  { bg: '#D55A35', text: '#1A1A1A', accent: '#0E1B2C', font: "'Noto Sans KR', sans-serif" },
  mag:   { bg: '#F5EDE0', text: '#1A1A1A', accent: '#E8FF4D', font: "'Noto Sans KR', sans-serif" },
  noir:  { bg: '#1A1A1A', text: '#FFFFFF', accent: '#FFFFFF', font: "'Noto Serif KR', serif" },
};

// 슬라이드 HTML 생성 (htmlcsstoimage.com or Satori 용 — 1080x1080)
function buildSlideHtml(slide, templateKey) {
  const t = CARD_TEMPLATES[templateKey] || CARD_TEMPLATES.clean;
  const num = String(slide.num || 1).padStart(2, '0');
  const title = (slide.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = (slide.body || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&family=Noto+Serif+KR:wght@400;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px; height: 1080px; overflow: hidden;
    background: ${t.bg};
    font-family: ${t.font};
    color: ${t.text};
    display: flex; flex-direction: column; justify-content: flex-end;
    padding: 90px 80px;
  }
  .slide-num { font-size: 13px; font-weight: 700; color: ${t.text}; opacity: 0.35; margin-bottom: 16px; letter-spacing: 0.12em; }
  .bar { width: 36px; height: 3px; background: ${t.accent}; border-radius: 2px; margin-bottom: 28px; }
  .title { font-size: 58px; font-weight: 900; line-height: 1.15; margin-bottom: 24px; word-break: keep-all; }
  .body { font-size: 26px; line-height: 1.75; opacity: 0.75; max-width: 85%; word-break: keep-all; }
</style>
</head>
<body>
  <div class="slide-num">${num}</div>
  <div class="bar"></div>
  <div class="title">${title}</div>
  <div class="body">${body}</div>
</body>
</html>`;
}

// htmlcsstoimage.com — HTML→PNG 변환 (HCTI 키 있을 때만)
async function renderSlideImage(slide, templateKey) {
  const userId = process.env.HCTI_API_USER_ID;
  const apiKey = process.env.HCTI_API_KEY;
  if (!userId || !apiKey) throw new Error('HCTI 키 없음');

  const html = buildSlideHtml(slide, templateKey);
  const auth = Buffer.from(`${userId}:${apiKey}`).toString('base64');

  const res = await fetch('https://hcti.io/v1/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
    body: JSON.stringify({ html, viewport_width: 1080, viewport_height: 1080 }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HCTI ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  return data.url || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id 필수' });

  const raw = await redis.get(`creator:draft:${id}`);
  if (!raw) return res.status(404).json({ error: '드래프트 없음' });
  const draft = typeof raw === 'string' ? JSON.parse(raw) : raw;

  const isVideo = draft.format === 'reel' || draft.format === 'shorts';
  const isCardNews = draft.format === 'cardnews';

  try {
    if (isVideo) {
      if (!draft.visualPrompt) return res.status(400).json({ error: 'visualPrompt 없음 (generate 먼저)' });

      const requestId = await requestHiggsfieldVideo(
        draft.visualPrompt,
        draft.format,
        draft.personaImageUrl,
      );

      const updated = {
        ...draft,
        higgsfieldJobId: requestId,   // request_id 저장 (cron이 폴링)
        status: 'generating',
        updatedAt: new Date().toISOString(),
      };
      await redis.set(`creator:draft:${id}`, updated, { ex: 86400 * 30 });
      return res.status(200).json({ success: true, draft: updated, message: '영상 생성 시작 (완료까지 1-3분)' });
    }

    if (isCardNews) {
      const templateKey = draft.cardnewsTemplate || 'clean';

      if (!process.env.HCTI_API_USER_ID || !process.env.HCTI_API_KEY) {
        // HCTI 없으면 텍스트 미리보기 모드 (슬라이드 JSON으로 렌더)
        const updated = { ...draft, status: 'review', mediaUrls: [], updatedAt: new Date().toISOString() };
        await redis.set(`creator:draft:${id}`, updated, { ex: 86400 * 30 });
        return res.status(200).json({
          success: true, draft: updated,
          message: `카드뉴스 텍스트 미리보기 모드 (${templateKey} 템플릿)`,
        });
      }

      const imageUrls = [];
      for (const slide of draft.slides || []) {
        try {
          const url = await renderSlideImage(slide, templateKey);
          if (url) imageUrls.push(url);
        } catch (e) {
          console.error('[Creator CardNews] Slide render error:', e.message);
        }
      }

      const updated = { ...draft, mediaUrls: imageUrls, status: 'review', updatedAt: new Date().toISOString() };
      await redis.set(`creator:draft:${id}`, updated, { ex: 86400 * 30 });
      return res.status(200).json({ success: true, draft: updated });
    }

    return res.status(400).json({ error: '알 수 없는 format' });
  } catch (e) {
    console.error('[Creator Media]', e.message);
    const failed = { ...draft, status: 'failed', error: e.message, updatedAt: new Date().toISOString() };
    await redis.set(`creator:draft:${id}`, failed, { ex: 86400 * 30 }).catch(() => {});
    return res.status(500).json({ error: e.message });
  }
}

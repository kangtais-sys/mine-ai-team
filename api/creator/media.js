import { Redis } from '@upstash/redis';
import { randomUUID } from 'crypto';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ── Higgsfield API 설정 ──────────────────────────────────────────
// 플랫폼 URL: platform.higgsfield.ai
// 인증: Key {apiKey} 헤더
// 엔드포인트 (OpenAPI 검증 완료 2026-05):
//   영상: POST /v1/image2video/kling  또는  /v1/image2video/dop
//   상태: GET  /requests/{request_id}/status
//   응답: { request_id, status, video: { url } }
// ⚠️ 모든 영상 모델은 input_image(URL) 필수 — 텍스트 전용 없음
const HIGGSFIELD_BASE = 'https://platform.higgsfield.ai';

function higgsfieldHeaders() {
  const key = (process.env.HIGGSFIELD_API_KEY || '').replace(/^["']|["']$/g, '').trim();
  if (!key) throw new Error('HIGGSFIELD_API_KEY 없음');
  // Higgsfield Cloud API 인증: hf-api-key 헤더 (UUID 형식)
  // Origin 헤더 필수 — 없으면 서버가 500 반환
  return {
    'hf-api-key': key,
    'Content-Type': 'application/json',
    'Origin': 'https://cloud.higgsfield.ai',
    'Referer': 'https://cloud.higgsfield.ai/',
  };
}

// base64 data URL → Redis 저장 후 이미지 프록시 HTTP URL 반환
// Higgsfield는 base64를 직접 받을 수 없어서 공개 HTTP URL이 필요
async function ensureHttpUrl(imageUrl) {
  if (!imageUrl) throw new Error('페르소나 이미지 없음 — 크리에이터 설정에서 이미지를 먼저 생성해주세요');
  if (imageUrl.startsWith('http')) return imageUrl; // 이미 HTTP URL

  // base64 data URL → Redis에 임시 저장 → 프록시 URL 반환
  const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('지원되지 않는 이미지 형식');

  const mimeType = match[1];
  const base64Data = match[2];
  const id = randomUUID();

  await redis.set(`creator:temp-img:${id}`, { mimeType, data: base64Data }, { ex: 3600 }); // 1시간 TTL

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://mine-ai-team.vercel.app';
  const proxyUrl = `${baseUrl}/api/creator/image-proxy?id=${id}`;

  console.log(`[Creator Media] base64 → 프록시 URL: ${proxyUrl}`);
  return proxyUrl;
}

// 영상 생성 요청 → request_id 반환 (비동기)
async function requestHiggsfieldVideo(visualPrompt, personaImageUrl) {
  // base64면 자동으로 Vercel Blob에 업로드해서 HTTP URL 획득
  const imageUrl = await ensureHttpUrl(personaImageUrl);

  const headers = higgsfieldHeaders();

  // 1차: Kling v2.1 Std image-to-video (더 안정적)
  // 응답: { id, type, jobs: [...] } → id가 request_id
  const klingBody = {
    params: {
      prompt: visualPrompt,
      input_image: { type: 'image_url', image_url: imageUrl },
      model: 'kling-v2-1',
      mode: 'std',
      duration: 5,
    },
  };

  console.log('[Creator Media] Higgsfield Kling v2.1 요청 시작');
  const klingRes = await fetch(`${HIGGSFIELD_BASE}/v1/image2video/kling`, {
    method: 'POST',
    headers,
    body: JSON.stringify(klingBody),
  });

  if (klingRes.ok) {
    const klingData = await klingRes.json();
    const requestId = klingData.id || klingData.request_id;
    if (requestId) {
      console.log(`[Creator Media] Kling 요청 성공: ${requestId}`);
      return { requestId, model: 'kling-v2-1' };
    }
  }

  // Kling 실패 시 DoP Turbo로 폴백
  const klingErr = await klingRes.text().catch(() => '');
  console.warn(`[Creator Media] Kling 실패 (${klingRes.status}): ${klingErr.substring(0, 150)} → DoP Turbo 폴백`);

  const dopBody = {
    params: {
      prompt: visualPrompt,
      input_images: [{ type: 'image_url', image_url: imageUrl }],
      model: 'dop-turbo',
    },
  };

  const dopRes = await fetch(`${HIGGSFIELD_BASE}/v1/image2video/dop`, {
    method: 'POST',
    headers,
    body: JSON.stringify(dopBody),
  });

  if (!dopRes.ok) {
    const dopErr = await dopRes.text();
    throw new Error(`Higgsfield DoP Turbo 실패 ${dopRes.status}: ${dopErr.substring(0, 200)}`);
  }

  const dopData = await dopRes.json();
  const dopRequestId = dopData.id || dopData.request_id;
  if (!dopRequestId) throw new Error(`request_id 없음 (DoP): ${JSON.stringify(dopData).substring(0, 200)}`);

  console.log(`[Creator Media] DoP Turbo 요청 성공: ${dopRequestId}`);
  return { requestId: dopRequestId, model: 'dop-turbo' };
}

// 상태 조회 → { status, videoUrl, raw }
export async function checkHiggsfieldStatus(requestId) {
  const headers = higgsfieldHeaders();

  const res = await fetch(`${HIGGSFIELD_BASE}/requests/${requestId}/status`, {
    headers,
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

      const { requestId, model: usedModel } = await requestHiggsfieldVideo(
        draft.visualPrompt,
        draft.personaImageUrl,
      );

      const updated = {
        ...draft,
        higgsfieldJobId: requestId,   // request_id 저장 (cron이 폴링)
        higgsfieldModel: usedModel,   // 사용된 모델 기록
        status: 'generating',
        updatedAt: new Date().toISOString(),
      };
      await redis.set(`creator:draft:${id}`, updated, { ex: 86400 * 30 });
      return res.status(200).json({ success: true, draft: updated, message: `영상 생성 시작 (${usedModel}, 완료까지 1-3분)` });
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

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

  // VERCEL_URL은 배포별 URL이라 Higgsfield에서 접근 못할 수 있음 → 안정 도메인 사용
  const baseUrl = process.env.APP_URL || 'https://mine-ai-team.vercel.app';
  const proxyUrl = `${baseUrl}/api/creator/image-proxy?id=${id}`;

  console.log(`[Creator Media] base64 → 프록시 URL: ${proxyUrl}`);
  return proxyUrl;
}

// ── HeyGen Talking Photo API ──────────────────────────────────────
// 실제 사람처럼 보이는 립싱크 영상 생성
// 1) 페르소나 이미지 → 토킹 포토 업로드 → talking_photo_id (Redis 캐시)
// 2) ElevenLabs 오디오 → HeyGen 오디오 에셋 → asset_id
// 3) video/generate → video_id → cron이 폴링

function heygenHeaders(extra = {}) {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error('HEYGEN_API_KEY 없음');
  return { 'X-Api-Key': key, ...extra };
}

// 페르소나 이미지 → HeyGen 토킹 포토 (캐시: 30일)
async function getOrCreateTalkingPhoto(personaImageUrl, cacheKey) {
  // 1. 캐시 확인
  const cached = await redis.get(`heygen:talking_photo:${cacheKey}`).catch(() => null);
  if (cached) {
    console.log(`[HeyGen] 토킹 포토 캐시 히트: ${cached}`);
    return cached;
  }

  // 2. 이미지 다운로드
  const imgUrl = await ensureHttpUrl(personaImageUrl);
  const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(15000) });
  if (!imgRes.ok) throw new Error(`페르소나 이미지 다운로드 실패 ${imgRes.status}`);
  const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

  // 3. HeyGen 토킹 포토 업로드 (multipart form-data)
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('image', imgBuffer, { filename: 'persona.jpg', contentType });

  const uploadRes = await fetch('https://upload.heygen.com/v1/talking_photo', {
    method: 'POST',
    headers: {
      ...heygenHeaders(),
      ...form.getHeaders(),
    },
    body: form,
    signal: AbortSignal.timeout(30000),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`HeyGen 토킹 포토 업로드 실패 ${uploadRes.status}: ${errText.substring(0, 300)}`);
  }

  const uploadData = await uploadRes.json();
  const talkingPhotoId = uploadData?.data?.talking_photo_id || uploadData?.talking_photo_id;
  if (!talkingPhotoId) throw new Error(`talking_photo_id 없음: ${JSON.stringify(uploadData).substring(0, 200)}`);

  console.log(`[HeyGen] 토킹 포토 생성 완료: ${talkingPhotoId}`);
  await redis.set(`heygen:talking_photo:${cacheKey}`, talkingPhotoId, { ex: 86400 * 30 }).catch(() => {});
  return talkingPhotoId;
}

// ElevenLabs 오디오(base64) → HeyGen 오디오 에셋 업로드 → asset_id
async function uploadAudioToHeyGen(audioBase64) {
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  const uploadRes = await fetch('https://upload.heygen.com/v1/asset', {
    method: 'POST',
    headers: {
      ...heygenHeaders({ 'Content-Type': 'audio/mpeg' }),
    },
    body: audioBuffer,
    signal: AbortSignal.timeout(30000),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`HeyGen 오디오 업로드 실패 ${uploadRes.status}: ${errText.substring(0, 300)}`);
  }

  const uploadData = await uploadRes.json();
  const assetId = uploadData?.data?.id;
  if (!assetId) throw new Error(`HeyGen 오디오 asset_id 없음: ${JSON.stringify(uploadData).substring(0, 200)}`);
  console.log(`[HeyGen] 오디오 업로드 완료: ${assetId}`);
  return assetId;
}

// HeyGen 영상 생성 요청 → video_id
async function createHeyGenVideo(talkingPhotoId, audioAssetId) {
  const body = {
    video_inputs: [{
      character: {
        type: 'talking_photo',
        talking_photo_id: talkingPhotoId,
        talking_photo_style: 'circle',
        talking_style: 'expressive',
        expression: 'happy',
        super_resolution: true,
        matting: true,          // 배경 제거 (나중에 배경 합성 가능)
      },
      voice: {
        type: 'audio',
        audio_asset_id: audioAssetId,
      },
      background: {
        type: 'color',
        value: '#FAFAFA',       // 밝은 뉴트럴 배경 (K-뷰티 스튜디오 느낌)
      },
    }],
    dimension: { width: 1080, height: 1920 },  // 9:16 세로형
    caption: false,
  };

  const genRes = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: heygenHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!genRes.ok) {
    const errText = await genRes.text();
    throw new Error(`HeyGen 영상 생성 실패 ${genRes.status}: ${errText.substring(0, 300)}`);
  }

  const genData = await genRes.json();
  const videoId = genData?.data?.video_id;
  if (!videoId) throw new Error(`HeyGen video_id 없음: ${JSON.stringify(genData).substring(0, 200)}`);
  console.log(`[HeyGen] 영상 생성 요청 완료: ${videoId}`);
  return videoId;
}

// HeyGen 영상 상태 조회
export async function checkHeyGenStatus(videoId) {
  const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
    headers: heygenHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HeyGen status ${res.status}: ${err.substring(0, 200)}`);
  }
  const data = await res.json();
  const d = data?.data || data;
  return {
    status: d.status,           // pending | processing | completed | failed
    videoUrl: d.video_url || null,
    duration: d.duration || null,
  };
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

      // ── HeyGen 우선: 오디오가 있으면 립싱크 토킹 포토 영상 생성 ──
      if (draft.audioBase64 && process.env.HEYGEN_API_KEY) {
        try {
          console.log('[Creator Media] HeyGen Talking Photo 모드 시작');
          if (!draft.personaImageUrl) throw new Error('페르소나 이미지 없음 — 크리에이터 설정에서 이미지를 먼저 생성해주세요');

          // 캐시 키: 페르소나 이미지 URL의 앞 40자
          const cacheKey = (draft.personaImageUrl || '').substring(0, 40).replace(/[^a-zA-Z0-9]/g, '_');

          const talkingPhotoId = await getOrCreateTalkingPhoto(draft.personaImageUrl, cacheKey);
          const audioAssetId = await uploadAudioToHeyGen(draft.audioBase64);
          const videoId = await createHeyGenVideo(talkingPhotoId, audioAssetId);

          const updated = {
            ...draft,
            heygenVideoId: videoId,
            videoEngine: 'heygen',
            status: 'generating',
            updatedAt: new Date().toISOString(),
          };
          await redis.set(`creator:draft:${id}`, updated, { ex: 86400 * 30 });
          return res.status(200).json({ success: true, draft: updated, message: 'HeyGen 립싱크 영상 생성 시작 (완료까지 1-3분)' });
        } catch (heygenErr) {
          console.warn('[Creator Media] HeyGen 실패, Higgsfield로 폴백:', heygenErr.message);
          // HeyGen 실패 시 Higgsfield로 폴백
        }
      }

      // ── Higgsfield 폴백 (오디오 없거나 HeyGen 실패 시) ──
      const { requestId, model: usedModel } = await requestHiggsfieldVideo(
        draft.visualPrompt,
        draft.personaImageUrl,
      );

      const updated = {
        ...draft,
        higgsfieldJobId: requestId,
        higgsfieldModel: usedModel,
        videoEngine: 'higgsfield',
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

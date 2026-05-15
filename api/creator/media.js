import { Redis } from '@upstash/redis';
import { randomUUID } from 'crypto';
import FormDataPkg from 'form-data';

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

// ── 페르소나 대표 이미지 자동 조회 ──────────────────────────────
// draft.personaImageUrl 없을 때 Redis에서 isPrimary 이미지 자동으로 가져옴
async function getPrimaryPersonaImageUrl(personaKey) {
  const key = personaKey
    ? `creator:persona:${personaKey}:images`
    : 'creator:persona:millimilli:images';
  const raw = await redis.get(key).catch(() => null);
  if (!raw) return null;
  const images = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!Array.isArray(images) || images.length === 0) return null;
  const primary = images.find(img => img.isPrimary) || images[0];
  return primary?.url || null;
}

// ── HeyGen v3 API ────────────────────────────────────────────────
// 문서: https://developers.heygen.com
// 실제 사람처럼 보이는 립싱크 영상 생성 (Image-to-Video)
// 1) 페르소나 이미지 → POST /v3/assets → image asset_id (캐시 24hr)
// 2) 오디오 base64 → POST /v3/assets → audio asset_id
// 3) POST /v3/videos (type:"image") → video_id → cron이 폴링
// 4) GET /v3/videos/{video_id} → status:completed → video URL

function heygenHeaders(extra = {}) {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error('HEYGEN_API_KEY 없음');
  return { 'X-Api-Key': key, ...extra };
}

// 파일(Buffer) → HeyGen /v3/assets → asset_id
// form-data npm 패키지 사용 (package.json에 ^4.0.5)
async function uploadAssetToHeyGen(buffer, filename, mimeType) {
  const form = new FormDataPkg();
  form.append('file', buffer, { filename, contentType: mimeType });

  const uploadRes = await fetch('https://api.heygen.com/v3/assets', {
    method: 'POST',
    headers: {
      'X-Api-Key': process.env.HEYGEN_API_KEY,
      ...form.getHeaders(),
    },
    body: form,
    signal: AbortSignal.timeout(60000),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`HeyGen /v3/assets 업로드 실패 ${uploadRes.status}: ${errText.substring(0, 300)}`);
  }

  const data = await uploadRes.json();
  const assetId = data?.data?.asset_id;
  if (!assetId) throw new Error(`HeyGen asset_id 없음: ${JSON.stringify(data).substring(0, 200)}`);
  console.log(`[HeyGen] 에셋 업로드 완료: ${assetId} (${filename})`);
  return assetId;
}

// 페르소나 이미지 → image asset_id (24시간 캐시)
async function getOrCreateImageAsset(personaImageUrl) {
  // 프록시 URL로 변환
  const imgUrl = await ensureHttpUrl(personaImageUrl);

  // 캐시 키: URL 앞 60자 기반
  const cacheKey = `heygen:image_asset:${imgUrl.substring(0, 60).replace(/[^a-zA-Z0-9]/g, '_')}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    console.log(`[HeyGen] 이미지 에셋 캐시 히트: ${cached}`);
    return cached;
  }

  // 이미지 다운로드
  const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(20000) });
  if (!imgRes.ok) throw new Error(`페르소나 이미지 다운로드 실패 ${imgRes.status}: ${imgUrl}`);
  const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : 'jpg';

  const assetId = await uploadAssetToHeyGen(imgBuffer, `persona.${ext}`, contentType);
  await redis.set(cacheKey, assetId, { ex: 86400 }).catch(() => {}); // 24시간 캐시
  return assetId;
}

// 오디오 base64 → HeyGen audio asset_id
async function uploadAudioAsset(audioBase64) {
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  return uploadAssetToHeyGen(audioBuffer, 'audio.mp3', 'audio/mpeg');
}

// HeyGen v3 영상 생성 (image-to-video with lipsync)
// docs: https://developers.heygen.com/image-to-video-1.md
async function createHeyGenVideo(imageAssetId, audioAssetId, _bgUrl, scriptSentiment) {
  // expressiveness: 스크립트 감정에 따라
  const expressiveness = scriptSentiment === 'excited' ? 'high' : 'medium';
  // motion_prompt: 자연스러운 움직임 유도
  const motion_prompt = '자연스럽게 고개를 끄덕이며 카메라를 바라보기';

  const body = {
    type: 'image',
    image: {
      type: 'asset_id',
      asset_id: imageAssetId,
    },
    audio_asset_id: audioAssetId,
    aspect_ratio: '9:16',      // 세로형 숏츠
    resolution: '1080p',
    expressiveness,
    motion_prompt,
    title: 'K-beauty Shorts',
  };

  const genRes = await fetch('https://api.heygen.com/v3/videos', {
    method: 'POST',
    headers: heygenHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!genRes.ok) {
    const errText = await genRes.text();
    throw new Error(`HeyGen v3 영상 생성 실패 ${genRes.status}: ${errText.substring(0, 300)}`);
  }

  const genData = await genRes.json();
  const videoId = genData?.data?.video_id;
  if (!videoId) throw new Error(`HeyGen video_id 없음: ${JSON.stringify(genData).substring(0, 200)}`);
  console.log(`[HeyGen] v3 영상 생성 요청 완료: ${videoId}`);
  return videoId;
}

// ── Higgsfield 배경 이미지 생성 (K뷰티 스튜디오) ─────────────────
// visualPrompt → 사람 없는 배경만 생성 → HeyGen 배경으로 사용
// Redis 24시간 캐시
async function generateBackgroundImage(visualPrompt) {
  const cacheKey = `heygen:bg:${Buffer.from(visualPrompt).toString('base64').substring(0, 40)}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) { console.log('[HeyGen BG] 캐시 히트'); return cached; }

  const headers = higgsfieldHeaders();
  // Reve text-to-image (배경 씬 전용)
  const bgPrompt = `${visualPrompt}, no people, no person, background only, ultra realistic, 9:16 vertical`;

  // 1차 시도: reve/text-to-image
  try {
    const res = await fetch(`${HIGGSFIELD_BASE}/reve/text-to-image`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ params: { prompt: bgPrompt, aspect_ratio: '9:16' } }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const data = await res.json();
      const url = data?.image?.url || data?.url || data?.images?.[0]?.url;
      if (url) {
        await redis.set(cacheKey, url, { ex: 86400 }).catch(() => {});
        console.log('[HeyGen BG] Reve 배경 생성 완료:', url.substring(0, 60));
        return url;
      }
    }
  } catch (e) {
    console.warn('[HeyGen BG] Reve 실패:', e.message);
  }

  // 2차 시도: soul/standard
  try {
    const res = await fetch(`${HIGGSFIELD_BASE}/v1/text2image/soul`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ params: { prompt: bgPrompt, model: 'higgsfield-ai/soul/standard' } }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const data = await res.json();
      const url = data?.image?.url || data?.url;
      if (url) {
        await redis.set(cacheKey, url, { ex: 86400 }).catch(() => {});
        console.log('[HeyGen BG] Soul 배경 생성 완료:', url.substring(0, 60));
        return url;
      }
    }
  } catch (e) {
    console.warn('[HeyGen BG] Soul 실패:', e.message);
  }

  console.warn('[HeyGen BG] 배경 생성 실패 — 단색 폴백');
  return null;
}

// 스크립트 감정 분석 (표정 설정용)
function analyzeScriptSentiment(script) {
  if (!script) return 'default';
  const excited = /와|대박|충격|진짜요\?|믿기지|놀라운|엄청|역대급|핵심/;
  const serious = /주의|위험|절대|금지|부작용|잘못|경고|사실은/;
  if (excited.test(script)) return 'excited';
  if (serious.test(script)) return 'serious';
  return 'default';
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
      console.log(`[Creator Media] audioBase64 있음: ${!!draft.audioBase64}, HEYGEN_API_KEY 있음: ${!!process.env.HEYGEN_API_KEY}`);
      if (draft.audioBase64 && process.env.HEYGEN_API_KEY) {
        try {
          console.log('[Creator Media] HeyGen Talking Photo 모드 시작');

          // 페르소나 이미지: 드래프트에 있으면 그대로, 없으면 Redis 대표 이미지 자동 조회
          let personaImageUrl = draft.personaImageUrl;
          if (!personaImageUrl) {
            personaImageUrl = await getPrimaryPersonaImageUrl(draft.personaKey || null);
          }
          if (!personaImageUrl) throw new Error('페르소나 대표 이미지 없음 — 크리에이터 설정에서 이미지를 먼저 등록해주세요');

          // v3: 이미지 → /v3/assets → image asset_id (캐시 24hr)
          const imageAssetId = await getOrCreateImageAsset(personaImageUrl);
          // v3: 오디오 base64 → /v3/assets → audio asset_id
          const audioAssetId = await uploadAudioAsset(draft.audioBase64);

          // 배경 이미지 생성 (실패해도 진행 — v3 image-to-video는 배경 별도 지정 불필요)
          const bgUrl = draft.visualPrompt
            ? await generateBackgroundImage(draft.visualPrompt).catch(() => null)
            : null;
          const sentiment = analyzeScriptSentiment(draft.script);

          const videoId = await createHeyGenVideo(imageAssetId, audioAssetId, bgUrl, sentiment);

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
          // HeyGen 에러를 드래프트 변수에 저장 (Higgsfield 폴백 시 보존됨)
          draft.heygenLastError = heygenErr.message;
          // HeyGen 실패 시 Higgsfield로 폴백
        }
      }

      // ── Higgsfield 폴백 (오디오 없거나 HeyGen 실패 시) ──
      let fallbackImageUrl = draft.personaImageUrl;
      if (!fallbackImageUrl) {
        fallbackImageUrl = await getPrimaryPersonaImageUrl(draft.personaKey || null);
      }
      const { requestId, model: usedModel } = await requestHiggsfieldVideo(
        draft.visualPrompt,
        fallbackImageUrl,
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

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const HIGGSFIELD_BASE = 'https://api.higgsfield.ai';

// Higgsfield 영상 생성 요청
async function requestHiggsfieldVideo(visualPrompt, format) {
  const apiKey = process.env.HIGGSFIELD_API_KEY;
  if (!apiKey) throw new Error('HIGGSFIELD_API_KEY 없음');

  const res = await fetch(`${HIGGSFIELD_BASE}/v1/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      task: 'text-to-video',
      prompt: visualPrompt,
      duration: 5,                   // 5초 (Reels/Shorts 기본)
      aspect_ratio: '9:16',          // 세로 영상
      fps: 30,
      motion_intensity: 'medium',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Higgsfield API ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  // 응답: { success, generation_id, status_url } 또는 { id, ... }
  const jobId = data.generation_id || data.id;
  if (!jobId) throw new Error(`Higgsfield jobId 없음: ${JSON.stringify(data)}`);
  return jobId;
}

// Higgsfield 상태 조회 → 완료 시 video_url 반환
export async function checkHiggsfieldStatus(jobId) {
  const apiKey = process.env.HIGGSFIELD_API_KEY;
  if (!apiKey) throw new Error('HIGGSFIELD_API_KEY 없음');

  const res = await fetch(`${HIGGSFIELD_BASE}/v1/generations/${jobId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Higgsfield status ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  // { status: 'pending'|'running'|'completed'|'failed', video_url: '...' }
  return {
    status: data.status,
    videoUrl: data.video_url || data.outputs?.video_url || null,
    raw: data,
  };
}

// 카드뉴스 템플릿 4종 (Ssobi 동일 스펙)
const CARD_TEMPLATES = {
  clean: { bg: '#FFFFFF', text: '#1A1A1A', accent: '#1A1A1A', font: "'Noto Sans KR', sans-serif" },
  bold:  { bg: '#D55A35', text: '#1A1A1A', accent: '#0E1B2C', font: "'Noto Sans KR', sans-serif" },
  mag:   { bg: '#F5EDE0', text: '#1A1A1A', accent: '#E8FF4D', font: "'Noto Sans KR', sans-serif" },
  noir:  { bg: '#1A1A1A', text: '#FFFFFF', accent: '#FFFFFF', font: "'Noto Serif KR', serif" },
};

// 슬라이드 HTML 생성 (htmlcsstoimage.com 용 — 1080x1080)
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

// htmlcsstoimage.com — HTML→PNG 변환
async function renderSlideImage(slide, templateKey) {
  const userId = process.env.HCTI_API_USER_ID;
  const apiKey = process.env.HCTI_API_KEY;
  if (!userId || !apiKey) throw new Error('HCTI 키 없음 (HCTI_API_USER_ID, HCTI_API_KEY)');

  const html = buildSlideHtml(slide, templateKey);
  const auth = Buffer.from(`${userId}:${apiKey}`).toString('base64');

  const res = await fetch('https://hcti.io/v1/image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
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

  // 드래프트 로드
  const raw = await redis.get(`creator:draft:${id}`);
  if (!raw) return res.status(404).json({ error: '드래프트 없음' });
  const draft = typeof raw === 'string' ? JSON.parse(raw) : raw;

  const isVideo = draft.format === 'reel' || draft.format === 'shorts';
  const isCardNews = draft.format === 'cardnews';

  try {
    if (isVideo) {
      // ── 영상: Higgsfield 비동기 요청 ──
      if (!draft.visualPrompt) return res.status(400).json({ error: 'visualPrompt 없음 (generate 먼저)' });

      const jobId = await requestHiggsfieldVideo(draft.visualPrompt, draft.format);

      const updated = {
        ...draft,
        higgsfieldJobId: jobId,
        status: 'generating',
        updatedAt: new Date().toISOString(),
      };
      await redis.set(`creator:draft:${id}`, updated, { ex: 86400 * 30 });
      return res.status(200).json({ success: true, draft: updated, message: '영상 생성 시작 (완료까지 1-3분)' });
    }

    if (isCardNews) {
      // ── 카드뉴스: htmlcsstoimage.com HTML→PNG 렌더링 ──
      const templateKey = draft.cardnewsTemplate || 'clean';

      // HCTI 키 없으면 텍스트 미리보기 모드
      if (!process.env.HCTI_API_USER_ID || !process.env.HCTI_API_KEY) {
        const updated = { ...draft, status: 'review', mediaUrls: [], updatedAt: new Date().toISOString() };
        await redis.set(`creator:draft:${id}`, updated, { ex: 86400 * 30 });
        return res.status(200).json({
          success: true, draft: updated,
          message: `HCTI 키 미설정 — ${CARD_TEMPLATES[templateKey] ? `${templateKey} 템플릿` : '텍스트'} 미리보기로 진행`,
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

      const updated = {
        ...draft,
        mediaUrls: imageUrls,
        status: 'review',
        updatedAt: new Date().toISOString(),
      };
      await redis.set(`creator:draft:${id}`, updated, { ex: 86400 * 30 });
      return res.status(200).json({ success: true, draft: updated });
    }

    return res.status(400).json({ error: '알 수 없는 format' });
  } catch (e) {
    console.error('[Creator Media]', e.message);

    // 실패 시 draft 상태 업데이트
    const failed = { ...draft, status: 'failed', error: e.message, updatedAt: new Date().toISOString() };
    await redis.set(`creator:draft:${id}`, failed, { ex: 86400 * 30 }).catch(() => {});

    return res.status(500).json({ error: e.message });
  }
}

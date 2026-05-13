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

// Bannerbear 카드뉴스 슬라이드 이미지 생성
async function generateBannerbearSlide(slide, templateUid, brandColors) {
  const apiKey = process.env.BANNERBEAR_API_KEY;
  if (!apiKey) throw new Error('BANNERBEAR_API_KEY 없음');

  const modifications = [
    { name: 'title', text: slide.title },
    { name: 'body', text: slide.body },
    ...(brandColors ? [{ name: 'background_color', color: brandColors.bg }] : []),
  ];

  const res = await fetch('https://sync.api.bannerbear.com/v2/images', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ template: templateUid, modifications }),
  });

  const data = await res.json();
  return data.image_url || null;
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
      // ── 카드뉴스: Bannerbear 동기 요청 ──
      const templateUid = process.env.BANNERBEAR_MILLIMILLI_TEMPLATE;
      if (!templateUid) {
        // 템플릿 없으면 슬라이드 텍스트만으로 review 상태 유지 (이미지 생성 스킵)
        const updated = { ...draft, status: 'review', mediaUrls: [], updatedAt: new Date().toISOString() };
        await redis.set(`creator:draft:${id}`, updated, { ex: 86400 * 30 });
        return res.status(200).json({ success: true, draft: updated, message: 'Bannerbear 템플릿 미설정 — 텍스트 미리보기로 진행' });
      }

      const imageUrls = [];
      for (const slide of draft.slides || []) {
        try {
          const url = await generateBannerbearSlide(slide, templateUid);
          if (url) imageUrls.push(url);
        } catch (e) {
          console.error('[Creator CardNews] Slide error:', e.message);
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

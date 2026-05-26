// 장면별 영상 생성 — Higgsfield Kling v2.1 Master (Pro image-to-video)
//
// === 2026-05-26 fal-ai 폐기, Higgsfield 공식 API 전면 교체 ===
// 이유: Higgsfield 의 kling-v2-1-master 가 fal 의 v2.1-pro 보다 한 단계 위 (Master 변형).
//       토큰/헤더 패턴은 media.js (이미 검증된 hf-api-key) 그대로 재사용.
//       PDF #2 (바이럴 릴스 가이드) 의 iPhone handheld suffix 를 prompt 끝에 자동 append.
//
// POST { personaImageUrl, visualPrompt, dialogue?, duration? } → { requestId }
// GET  ?requestId=xxx → { status, videoUrl? }
//
// 인증: HIGGSFIELD_API_KEY (platform.higgsfield.ai, hf-api-key 헤더)
//       ⚠️ 이건 platform key 임 — fnf 토큰(persona-soul.js/generate-image.js)과 별개.

export const config = { maxDuration: 60 };

const HIGGSFIELD_BASE = 'https://platform.higgsfield.ai';

// PDF #2 (바이럴 릴스): "찐사람" 시그널 = 핸드헬드 + 약한 흔들림 + iPhone 룩
// AI 영상의 "스튜디오 톤" 차단. 모든 영상에 자동 append.
const IPHONE_HANDHELD_SUFFIX =
  'shot on iPhone, handheld camera, subtle natural shake, vlog style, amateur phone recording, casual not steady';

function higgsfieldHeaders() {
  const key = (process.env.HIGGSFIELD_API_KEY || '').replace(/^["']|["']$/g, '').trim();
  if (!key) throw new Error('HIGGSFIELD_API_KEY 미설정');
  return {
    'hf-api-key': key,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Origin': 'https://cloud.higgsfield.ai',
    'Referer': 'https://cloud.higgsfield.ai/',
  };
}

function buildVideoPrompt(visualPrompt, dialogue) {
  return [
    visualPrompt,
    dialogue ? 'speaking dialogue naturally with synchronized mouth movements' : '',
    'photorealistic 9:16 vertical portrait, smooth motion, no warping',
    IPHONE_HANDHELD_SUFFIX,
  ].filter(Boolean).join(', ');
}

export default async function handler(req, res) {
  // GET — 상태 확인 (endpoint 경로 후보 fallback)
  if (req.method === 'GET') {
    const { requestId } = req.query;
    if (!requestId) return res.status(400).json({ error: 'requestId 필수' });

    const candidates = [
      `${HIGGSFIELD_BASE}/requests/${requestId}/status`,
      `${HIGGSFIELD_BASE}/v1/jobs/${requestId}`,
      `${HIGGSFIELD_BASE}/jobs/${requestId}`,
      `${HIGGSFIELD_BASE}/v1/image2video/kling/${requestId}`,
      `${HIGGSFIELD_BASE}/v1/jobsets/${requestId}`,
      `${HIGGSFIELD_BASE}/job-sets/${requestId}`,
    ];

    const attempts = [];
    let data = null;
    let usedUrl = null;

    try {
      for (const url of candidates) {
        const r = await fetch(url, {
          headers: higgsfieldHeaders(),
          signal: AbortSignal.timeout(8000),
        });
        if (r.ok) {
          data = await r.json();
          usedUrl = url;
          break;
        }
        const txt = await r.text().catch(() => '');
        attempts.push(`${url.replace(HIGGSFIELD_BASE, '')} -> ${r.status} ${txt.substring(0, 80)}`);
      }
      if (!data) {
        return res.status(500).json({
          error: 'Higgsfield status: 모든 후보 경로 실패',
          attempts,
        });
      }
      console.log(`[scene-video] status 경로 확정: ${usedUrl}`);
      // status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw'
      if (data.status === 'completed') {
        const videoUrl = data.video?.url || data.output?.video?.url || null;
        return res.status(200).json({ status: 'completed', videoUrl });
      }
      if (data.status === 'failed' || data.status === 'nsfw') {
        return res.status(200).json({
          status: 'failed',
          error: data.error || data.status,
        });
      }
      return res.status(200).json({
        status: data.status === 'queued' ? 'queued' : 'processing',
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — 영상 생성 요청
  if (req.method === 'POST') {
    const {
      personaImageUrl,
      visualPrompt,
      dialogue = '',
      duration = 5,
    } = req.body || {};

    if (!personaImageUrl || !visualPrompt) {
      return res.status(400).json({ error: 'personaImageUrl, visualPrompt 필수' });
    }

    // Kling 지원 duration: 5 또는 10초
    const clampedDuration = duration >= 8 ? 10 : 5;
    const prompt = buildVideoPrompt(visualPrompt, dialogue);

    const body = {
      params: {
        prompt,
        input_image: { type: 'image_url', image_url: personaImageUrl },
        model: 'kling-v2-1-master',
        duration: clampedDuration,
      },
    };

    try {
      const submitRes = await fetch(
        `${HIGGSFIELD_BASE}/v1/image2video/kling`,
        {
          method: 'POST',
          headers: higgsfieldHeaders(),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(55000),
        }
      );

      if (!submitRes.ok) {
        const err = await submitRes.text().catch(() => '');
        return res.status(500).json({
          error: `Kling Master 제출 실패 ${submitRes.status}: ${err.substring(0, 300)}`,
        });
      }

      const data = await submitRes.json();
      const requestId = data.id || data.request_id;
      if (!requestId) {
        return res.status(500).json({
          error: 'requestId 없음',
          raw: JSON.stringify(data).substring(0, 200),
        });
      }

      return res.status(200).json({
        success: true,
        requestId,
        status: 'queued',
        model: 'kling-v2-1-master',
        _raw: data,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

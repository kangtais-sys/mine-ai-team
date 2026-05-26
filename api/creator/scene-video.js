// 장면별 영상 생성 — Higgsfield Kling v2.1 Master (Pro image-to-video)
//
// === 2026-05-26 fal-ai 폐기, Higgsfield 공식 API 전면 교체 ===
// 이유: Higgsfield 의 kling-v2-1-master 가 fal 의 v2.1-pro 보다 한 단계 위 (Master 변형).
//       토큰/헤더 패턴은 media.js (이미 검증된 hf-api-key) 그대로 재사용.
//       PDF #2 (바이럴 릴스 가이드) 의 iPhone handheld suffix 를 prompt 끝에 자동 append.
//
// POST { personaImageUrl, visualPrompt, duration? } → { requestId }
// (dialogue 는 별도 voice.js + Creatomate 단계에서 처리, 영상엔 안 박힘)
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

// 입모양 동기화는 별도 단계 안 함 (lipsync 폐기). 영상은 액션/표정만,
// 보이스오버는 따로 깔아서 자막으로 보여주는 바이럴 패턴.
function buildVideoPrompt(visualPrompt) {
  return [
    visualPrompt,
    'photorealistic 9:16 vertical portrait, smooth motion, no warping',
    IPHONE_HANDHELD_SUFFIX,
  ].filter(Boolean).join(', ');
}

export default async function handler(req, res) {
  // GET — 상태 확인
  // 공식 higgsfield-js SDK 검증: GET /v1/job-sets/{jobset_id}
  // 응답: { id, jobs: [{ id, status, results }] } — jobs[0].status / jobs[0].results 사용
  if (req.method === 'GET') {
    const { requestId } = req.query;
    if (!requestId) return res.status(400).json({ error: 'requestId 필수' });

    try {
      const r = await fetch(
        `${HIGGSFIELD_BASE}/v1/job-sets/${requestId}`,
        {
          headers: higgsfieldHeaders(),
          signal: AbortSignal.timeout(8000),
        }
      );
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        return res.status(500).json({
          error: `Higgsfield status ${r.status}: ${txt.substring(0, 200)}`,
        });
      }
      const data = await r.json();
      const job = data.jobs?.[0];
      const status = job?.status || data.status;
      // status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw' | 'canceled'
      if (status === 'completed') {
        const videoUrl =
          job?.results?.video?.url ||
          job?.results?.url ||
          data.video?.url ||
          null;
        return res.status(200).json({ status: 'completed', videoUrl, _raw: data });
      }
      if (status === 'failed' || status === 'nsfw' || status === 'canceled') {
        return res.status(200).json({
          status: 'failed',
          error: job?.error || data.error || status,
        });
      }
      return res.status(200).json({
        status: status === 'queued' ? 'queued' : 'processing',
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
      duration = 5,
    } = req.body || {};

    if (!personaImageUrl || !visualPrompt) {
      return res.status(400).json({ error: 'personaImageUrl, visualPrompt 필수' });
    }

    // Kling 지원 duration: 5 또는 10초
    const clampedDuration = duration >= 8 ? 10 : 5;
    const prompt = buildVideoPrompt(visualPrompt);

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

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { maxDuration: 60 };

// 실제 플랫폼 URL (기존 api.higgsfield.ai는 구버전)
const HIGGSFIELD_BASE = 'https://platform.higgsfield.ai';

function higgsfieldAuth() {
  const key = process.env.HIGGSFIELD_API_KEY;
  const secret = process.env.HIGGSFIELD_API_SECRET;
  if (!key) return null;
  return secret ? `Key ${key}:${secret}` : `Key ${key}`;
}

// Higgsfield 상태 폴링 (request_id 기반)
async function checkHiggsfieldJob(requestId) {
  const auth = higgsfieldAuth();
  if (!auth) return null;

  const res = await fetch(`${HIGGSFIELD_BASE}/requests/${requestId}/status`, {
    headers: { Authorization: auth },
  });
  if (!res.ok) return null;

  const data = await res.json();
  // status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw'
  return {
    status: data.status,
    videoUrl: data.video?.url || null,
  };
}

// 5분마다 실행
// 1) generating 상태 드래프트 → Higgsfield 완료 확인 → review로 전환
// 2) scheduled 상태 드래프트 → 예약 시간 도달 시 발행
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://mine-ai-team.vercel.app';

    const ids = await redis.lrange('creator:list', 0, 199);
    if (!ids || ids.length === 0) return res.status(200).json({ published: 0, polled: 0 });

    const now = new Date();
    let published = 0;
    let polled = 0;
    const errors = [];

    for (const id of ids) {
      try {
        const raw = await redis.get(`creator:draft:${id}`);
        if (!raw) continue;
        const draft = typeof raw === 'string' ? JSON.parse(raw) : raw;

        // ── 1. Higgsfield 영상 생성 중인 드래프트 폴링 ──
        if (draft.status === 'generating' && draft.higgsfieldJobId) {
          const job = await checkHiggsfieldJob(draft.higgsfieldJobId).catch(() => null);

          if ((job?.status === 'completed') && job.videoUrl) {
            // 영상 완료 → review로 전환, mediaUrl 저장
            const updated = {
              ...draft,
              status: 'review',
              mediaUrl: job.videoUrl,
              updatedAt: new Date().toISOString(),
            };
            await redis.set(`creator:draft:${id}`, updated, { ex: 86400 * 30 });
            polled++;
            console.log(`[Creator Schedule] Video ready: ${id} (${job.videoUrl.substring(0, 60)})`);
          } else if (job?.status === 'failed' || job?.status === 'nsfw') {
            // 영상 실패
            const failed = {
              ...draft,
              status: 'failed',
              error: 'Higgsfield 영상 생성 실패',
              updatedAt: new Date().toISOString(),
            };
            await redis.set(`creator:draft:${id}`, failed, { ex: 86400 * 30 });
            console.warn(`[Creator Schedule] Video failed: ${id}`);
          }
          // pending/running 이면 그냥 pass — 다음 5분에 다시 확인
          continue;
        }

        // ── 2. 예약된 드래프트 발행 ──
        if (draft.status !== 'scheduled') continue;
        if (!draft.scheduledAt) continue;

        const scheduledAt = new Date(draft.scheduledAt);
        if (scheduledAt > now) continue;

        const pubRes = await fetch(`${baseUrl}/api/creator/publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.CRON_SECRET}`,
          },
          body: JSON.stringify({ id }),
        });
        const pubData = await pubRes.json();

        if (pubData.success) {
          published++;
          console.log(`[Creator Schedule] Published: ${id} (${draft.format}/${draft.platforms?.join(',')})`);
        } else {
          errors.push({ id, error: pubData.error });
          console.error(`[Creator Schedule] Failed: ${id}`, pubData.error);
        }
      } catch (e) {
        errors.push({ id, error: e.message });
      }
    }

    return res.status(200).json({
      published,
      polled,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    console.error('[Creator Schedule]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

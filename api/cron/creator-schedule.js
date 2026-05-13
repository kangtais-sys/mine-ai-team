import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { maxDuration: 60 };

// 5분마다 실행 — 예약 발행 시간이 된 드래프트 자동 발행
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://mine-ai-team.vercel.app';

    const ids = await redis.lrange('creator:list', 0, 199);
    if (!ids || ids.length === 0) return res.status(200).json({ published: 0 });

    const now = new Date();
    let published = 0;
    const errors = [];

    for (const id of ids) {
      try {
        const raw = await redis.get(`creator:draft:${id}`);
        if (!raw) continue;
        const draft = typeof raw === 'string' ? JSON.parse(raw) : raw;

        if (draft.status !== 'scheduled') continue;
        if (!draft.scheduledAt) continue;

        const scheduledAt = new Date(draft.scheduledAt);
        if (scheduledAt > now) continue; // 아직 시간 안 됨

        // 발행 실행
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

    return res.status(200).json({ published, errors: errors.length > 0 ? errors : undefined });
  } catch (e) {
    console.error('[Creator Schedule]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

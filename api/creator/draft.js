import { Redis } from '@upstash/redis';
import { checkHiggsfieldStatus } from './media.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id 필수' });

  const raw = await redis.get(`creator:draft:${id}`).catch(() => null);
  if (!raw) return res.status(404).json({ error: '드래프트 없음' });
  let draft = typeof raw === 'string' ? JSON.parse(raw) : raw;

  // ── GET: 드래프트 조회 + 영상 생성 중이면 Higgsfield 상태 폴링 ──
  if (req.method === 'GET') {
    if (draft.status === 'generating' && draft.higgsfieldJobId) {
      try {
        const { status, videoUrl } = await checkHiggsfieldStatus(draft.higgsfieldJobId);
        if (status === 'completed' && videoUrl) {
          draft = { ...draft, status: 'review', mediaUrl: videoUrl, updatedAt: new Date().toISOString() };
          await redis.set(`creator:draft:${id}`, draft, { ex: 86400 * 30 });
        } else if (status === 'failed') {
          draft = { ...draft, status: 'failed', updatedAt: new Date().toISOString() };
          await redis.set(`creator:draft:${id}`, draft, { ex: 86400 * 30 });
        }
        // pending/running → 그대로 반환 (프론트가 재폴링)
      } catch (e) {
        console.error('[Creator Draft Poll]', e.message);
      }
    }
    return res.status(200).json({ draft });
  }

  // ── PATCH: 드래프트 수정 ──
  if (req.method === 'PATCH') {
    const { caption, hashtags, scheduledAt, status, notes } = req.body || {};

    const updates = { updatedAt: new Date().toISOString() };
    if (caption !== undefined) updates.caption = caption;
    if (hashtags !== undefined) updates.hashtags = hashtags;
    if (notes !== undefined) updates.notes = notes;
    if (scheduledAt !== undefined) updates.scheduledAt = scheduledAt;
    if (status !== undefined) updates.status = status;

    const updated = { ...draft, ...updates };
    await redis.set(`creator:draft:${id}`, updated, { ex: 86400 * 30 });
    return res.status(200).json({ success: true, draft: updated });
  }

  // ── DELETE: 드래프트 삭제 ──
  if (req.method === 'DELETE') {
    await redis.del(`creator:draft:${id}`);
    // list에서 제거 (O(n)이지만 100개 이하라서 무방)
    const ids = await redis.lrange('creator:list', 0, 199);
    const filtered = ids.filter(i => i !== id);
    if (filtered.length !== ids.length) {
      await redis.del('creator:list');
      if (filtered.length > 0) await redis.rpush('creator:list', ...filtered);
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

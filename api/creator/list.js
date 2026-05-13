import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 최근 100개 ID 가져오기
    const ids = await redis.lrange('creator:list', 0, 99);
    if (!ids || ids.length === 0) return res.status(200).json({ drafts: [] });

    // 병렬로 드래프트 로드
    const raws = await Promise.all(ids.map(id => redis.get(`creator:draft:${id}`).catch(() => null)));

    const drafts = raws
      .map((raw, i) => {
        if (!raw) return null;
        try {
          const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
          return d;
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.status(200).json({ drafts });
  } catch (e) {
    console.error('[Creator List]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

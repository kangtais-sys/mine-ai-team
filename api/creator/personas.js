// 다중 페르소나 인덱스 관리
// GET  → 저장된 페르소나 ID 목록
// POST → 새 페르소나 ID 추가 (최대 3개)
// DELETE ?id=xxx → 페르소나 ID 및 관련 데이터 삭제

import { Redis } from '@upstash/redis';
import { randomUUID } from 'crypto';

const INDEX_KEY = 'creator:personas:index';
const MAX_PERSONAS = 3;

function getRedis() {
  return new Redis({
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export default async function handler(req, res) {
  const redis = getRedis();

  if (req.method === 'GET') {
    try {
      const ids = (await redis.get(INDEX_KEY)) ?? [];
      return res.status(200).json({ ids });
    } catch {
      return res.status(200).json({ ids: [] });
    }
  }

  if (req.method === 'POST') {
    try {
      const ids = (await redis.get(INDEX_KEY)) ?? [];
      if (ids.length >= MAX_PERSONAS) {
        return res.status(400).json({ error: `최대 ${MAX_PERSONAS}개까지 가능합니다` });
      }
      const newId = req.body?.id || randomUUID();
      const updated = [...ids, newId];
      await redis.set(INDEX_KEY, updated);
      return res.status(200).json({ id: newId, ids: updated });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 필수' });
    try {
      const ids = (await redis.get(INDEX_KEY)) ?? [];
      const updated = ids.filter(i => i !== id);
      await redis.set(INDEX_KEY, updated);
      // 관련 key 전체 삭제
      await Promise.allSettled([
        redis.del(`creator:persona:${id}`),
        redis.del(`creator:persona:${id}:images`),
        redis.del(`creator:persona:${id}:lora`),
        redis.del(`creator:persona:${id}:voice`),
      ]);
      return res.status(200).json({ success: true, ids: updated });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

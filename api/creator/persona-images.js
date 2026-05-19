// 페르소나 이미지 갤러리 관리
// GET  → 저장된 이미지 목록 반환
// POST → 새 이미지 저장 (최대 10장, 초과 시 오래된 것 삭제)
// DELETE ?id=xxx → 특정 이미지 삭제

import { Redis } from '@upstash/redis';
import { randomUUID } from 'crypto';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const IMAGES_KEY = 'creator:persona:millimilli:images';
const MAX_IMAGES = 10;
const TTL = 86400 * 90; // 90일

export default async function handler(req, res) {

  // GET — 목록
  if (req.method === 'GET') {
    try {
      const raw = await redis.get(IMAGES_KEY).catch(() => null);
      const images = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
      return res.status(200).json({ images });
    } catch {
      return res.status(200).json({ images: [] });
    }
  }

  // POST — 저장
  if (req.method === 'POST') {
    const { imageUrl, prompt, via, label } = req.body || {};
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl 필수' });

    const raw = await redis.get(IMAGES_KEY).catch(() => null);
    let images = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];

    const newImage = {
      id: randomUUID(),
      url: imageUrl,
      prompt: prompt || '',
      via: via || '',
      label: label || '',       // 예: '정면', '측면', '연구실', '제품 착용'
      isPrimary: images.length === 0, // 첫 이미지는 대표로
      savedAt: new Date().toISOString(),
    };

    images = [newImage, ...images].slice(0, MAX_IMAGES); // 최신순, 최대 10장
    await redis.set(IMAGES_KEY, images, { ex: TTL });

    return res.status(200).json({ success: true, image: newImage, images });
  }

  // PATCH — 대표 이미지 변경
  if (req.method === 'PATCH') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id 필수' });

    const raw = await redis.get(IMAGES_KEY).catch(() => null);
    let images = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];

    images = images.map(img => ({ ...img, isPrimary: img.id === id }));
    await redis.set(IMAGES_KEY, images, { ex: TTL });

    return res.status(200).json({ success: true, images });
  }

  // DELETE — 삭제
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 필수' });

    const raw = await redis.get(IMAGES_KEY).catch(() => null);
    let images = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];

    images = images.filter(img => img.id !== id);
    // 대표 이미지가 삭제됐으면 첫 번째를 대표로
    if (images.length > 0 && !images.some(img => img.isPrimary)) {
      images[0].isPrimary = true;
    }
    await redis.set(IMAGES_KEY, images, { ex: TTL });

    return res.status(200).json({ success: true, images });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

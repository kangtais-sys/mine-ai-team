// base64 이미지를 Redis에서 불러와 공개 HTTP 이미지로 서빙
// Higgsfield API가 base64를 지원하지 않아 임시 HTTP URL로 변환
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { api: { responseLimit: '10mb' } };

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).end('id required');

  const raw = await redis.get(`creator:temp-img:${id}`);
  if (!raw) return res.status(404).end('image not found or expired');

  const img = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const buffer = Buffer.from(img.data, 'base64');

  res.setHeader('Content-Type', img.mimeType || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Content-Length', buffer.length);
  return res.status(200).end(buffer);
}

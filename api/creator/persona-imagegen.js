// FLUX 1.1 Pro Ultra로 페르소나 각도별 초현실 이미지 생성
// POST { personaId, angle, extraPrompt, personaDesc }
// angle: 'front' | 'three-quarter' | 'closeup' | 'fullbody' | 'side'

import { Redis } from '@upstash/redis';

export const config = { maxDuration: 60 };

function getRedis() {
  return new Redis({
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

function falHeaders() {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY 미설정');
  return { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' };
}

const ANGLE_PROMPTS = {
  front:           'front view, looking directly at camera, neutral expression, studio lighting, eye contact',
  'three-quarter': 'three-quarter view, slight turn to the left, soft natural smile, cinematic lighting',
  closeup:         'extreme close-up face, every pore and fine skin texture visible, macro photography, sharp focus on skin detail',
  fullbody:        'full body shot, standing naturally, hands at sides, clean background, fashion photography',
  side:            'side profile view, looking left, soft bokeh background, golden hour portrait lighting',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { personaId, angle = 'front', extraPrompt = '', personaDesc = '' } = req.body || {};
  if (!personaId) return res.status(400).json({ error: 'personaId 필수' });

  const redis = getRedis();

  // LoRA 확인 (훈련 완료된 경우 적용)
  let loraUrl = null;
  try {
    const loraData = await redis.get(`creator:persona:${personaId}:lora`).catch(() => null);
    if (loraData?.status === 'ready' && loraData.loraUrl) loraUrl = loraData.loraUrl;
  } catch {}

  const anglePrompt = ANGLE_PROMPTS[angle] || ANGLE_PROMPTS.front;

  const promptParts = [
    loraUrl ? 'PERSONA' : 'Korean woman, beauty content creator',
    personaDesc || 'Korean woman, 20s-30s, beauty content creator, natural makeup',
    anglePrompt,
    extraPrompt,
    'ultra photorealistic, hyperrealistic skin texture, pores visible, skin imperfections, 8K resolution, professional photography, natural lighting, RAW photo quality',
  ].filter(Boolean);

  const prompt = promptParts.join(', ');

  const body = {
    prompt,
    num_images: 1,
    image_size: 'portrait_4_3',
    output_format: 'jpeg',
    safety_tolerance: '2',
  };

  if (loraUrl) {
    body.loras = [{ path: loraUrl, scale: 0.9 }];
  }

  try {
    const genRes = await fetch('https://fal.run/fal-ai/flux-pro/v1.1-ultra', {
      method: 'POST',
      headers: falHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55000),
    });

    if (!genRes.ok) {
      const err = await genRes.text();
      return res.status(500).json({ error: `FLUX 생성 실패 ${genRes.status}: ${err.substring(0, 200)}` });
    }

    const data = await genRes.json();
    const imageUrl = data?.images?.[0]?.url;
    if (!imageUrl) {
      return res.status(500).json({ error: 'FLUX 이미지 URL 없음', raw: JSON.stringify(data).substring(0, 200) });
    }

    return res.status(200).json({ success: true, imageUrl, angle, personaId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

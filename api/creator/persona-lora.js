// FLUX Portrait Trainer LoRA 훈련 관리
// POST { personaId, imageUrls[] } → fal.ai 비동기 제출 → requestId 저장
// GET ?personaId=xxx → 훈련 상태 / loraUrl 반환

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

export default async function handler(req, res) {
  const redis = getRedis();

  // GET — 훈련 상태 확인
  if (req.method === 'GET') {
    const { personaId } = req.query;
    if (!personaId) return res.status(400).json({ error: 'personaId 필수' });
    try {
      const loraData = await redis.get(`creator:persona:${personaId}:lora`).catch(() => null);
      if (!loraData) return res.status(200).json({ status: 'none' });
      if (loraData.status === 'ready') return res.status(200).json(loraData);

      // 훈련 중 — fal.ai 큐 상태 확인
      const statusRes = await fetch(
        `https://queue.fal.run/fal-ai/flux-lora-portrait-trainer/requests/${loraData.requestId}`,
        { headers: falHeaders() }
      );
      const statusData = await statusRes.json();

      if (statusData.status === 'COMPLETED') {
        const loraUrl = statusData.output?.diffusers_lora_file?.url;
        const updated = { status: 'ready', loraUrl, requestId: loraData.requestId, personaId };
        await redis.set(`creator:persona:${personaId}:lora`, updated, { ex: 86400 * 30 }).catch(() => {});
        return res.status(200).json(updated);
      }
      if (statusData.status === 'FAILED') {
        const failed = { status: 'failed', error: statusData.error, requestId: loraData.requestId };
        await redis.set(`creator:persona:${personaId}:lora`, failed, { ex: 3600 }).catch(() => {});
        return res.status(200).json(failed);
      }
      return res.status(200).json({
        status: statusData.status === 'IN_QUEUE' ? 'queued' : 'training',
        requestId: loraData.requestId,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — 훈련 시작
  if (req.method === 'POST') {
    const { personaId, imageUrls = [], triggerWord = 'PERSONA' } = req.body || {};
    if (!personaId || !imageUrls.length) {
      return res.status(400).json({ error: 'personaId, imageUrls 필수' });
    }
    try {
      const submitRes = await fetch('https://queue.fal.run/fal-ai/flux-lora-portrait-trainer', {
        method: 'POST',
        headers: falHeaders(),
        body: JSON.stringify({
          images_data_url: imageUrls[0],
          trigger_word: triggerWord,
          learning_rate: 0.0002,
          steps: 1000,
          multiresolution_training: true,
        }),
        signal: AbortSignal.timeout(55000),
      });

      if (!submitRes.ok) {
        const err = await submitRes.text();
        return res.status(500).json({ error: `fal.ai 제출 실패: ${err.substring(0, 200)}` });
      }

      const submitData = await submitRes.json();
      const requestId = submitData.request_id;
      if (!requestId) return res.status(500).json({ error: 'requestId 없음', raw: JSON.stringify(submitData).substring(0, 200) });

      await redis.set(
        `creator:persona:${personaId}:lora`,
        { status: 'queued', requestId, personaId, startedAt: new Date().toISOString() },
        { ex: 86400 * 7 }
      ).catch(() => {});

      return res.status(200).json({ success: true, requestId, status: 'queued' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

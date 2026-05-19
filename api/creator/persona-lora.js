// FLUX Portrait Trainer LoRA 훈련 관리 (Supabase)
// POST { personaId, imageUrls[] } → fal.ai 비동기 제출
// GET ?personaId=xxx → 훈련 상태 / loraUrl 반환

import { getSupabase } from '../../lib/supabase.js';

export const config = { maxDuration: 60 };

function falHeaders() {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY 미설정');
  return { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' };
}

async function getLoraData(sb, personaId) {
  const { data } = await sb
    .from('creator_persona_lora')
    .select('data')
    .eq('persona_id', personaId)
    .single();
  return data?.data || null;
}

async function setLoraData(sb, personaId, loraData) {
  await sb.from('creator_persona_lora').upsert({
    persona_id: personaId,
    data: loraData,
    updated_at: new Date().toISOString(),
  });
}

export default async function handler(req, res) {
  const sb = getSupabase();

  if (req.method === 'GET') {
    const { personaId } = req.query;
    if (!personaId) return res.status(400).json({ error: 'personaId 필수' });
    try {
      const loraData = await getLoraData(sb, personaId);
      if (!loraData) return res.status(200).json({ status: 'none' });
      if (loraData.status === 'ready') return res.status(200).json(loraData);

      // 훈련 중 — fal.ai 상태 확인
      const statusRes = await fetch(
        `https://queue.fal.run/fal-ai/flux-lora-portrait-trainer/requests/${loraData.requestId}`,
        { headers: falHeaders() }
      );
      const statusData = await statusRes.json();

      if (statusData.status === 'COMPLETED') {
        const loraUrl = statusData.output?.diffusers_lora_file?.url;
        const updated = { status: 'ready', loraUrl, requestId: loraData.requestId, personaId };
        await setLoraData(sb, personaId, updated);
        return res.status(200).json(updated);
      }
      if (statusData.status === 'FAILED') {
        const failed = { status: 'failed', error: statusData.error, requestId: loraData.requestId };
        await setLoraData(sb, personaId, failed);
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
      if (!requestId) return res.status(500).json({ error: 'requestId 없음' });

      await setLoraData(sb, personaId, {
        status: 'queued', requestId, personaId, startedAt: new Date().toISOString(),
      });

      return res.status(200).json({ success: true, requestId, status: 'queued' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

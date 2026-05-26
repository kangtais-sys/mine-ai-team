// 씬 영상 → 입모양 동기화 — fal-ai/sync-lipsync (Sync Labs 1.9)
//
// Kling 으로 만든 씬 영상의 신체/배경 모션을 그대로 보존하면서
// 입 부분만 audio 에 맞춰 교체. iPhone handheld 톤 유지의 핵심.
//
// 흐름:
//   POST { videoUrl, audioUrl | audioBase64, syncMode? } → { requestId }
//   GET  ?requestId=xxx → { status, lipsyncedVideoUrl? }
//
// audioBase64 가 오면 Supabase Storage 에 임시 업로드 → public URL 사용 (fal 은 data URI 거부).
//
// 인증: FAL_API_KEY (Authorization: Key xxx)
// 비용: $0.70/분 (5초 영상 ≈ $0.06)

import { getSupabase } from '../../lib/supabase.js';
import { randomUUID } from 'crypto';

export const config = { maxDuration: 60 };

const FAL_QUEUE_BASE = 'https://queue.fal.run/fal-ai/sync-lipsync';
const BUCKET = 'creator-library';

function falHeaders() {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY 미설정');
  return {
    Authorization: `Key ${key}`,
    'Content-Type': 'application/json',
  };
}

async function uploadAudioToSupabase(audioBase64, mimeType = 'audio/mpeg') {
  const sb = getSupabase();
  const buf = Buffer.from(audioBase64, 'base64');
  const ext = mimeType.includes('mp3') || mimeType.includes('mpeg') ? 'mp3'
            : mimeType.includes('wav') ? 'wav' : 'm4a';
  const path = `lipsync-audio/${randomUUID()}.${ext}`;
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: mimeType, upsert: false });
  if (error) throw new Error(`Supabase audio upload 실패: ${error.message}`);
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl;
}

export default async function handler(req, res) {
  // GET — 상태 확인
  // fal queue: GET /requests/{id}/status → { status: "IN_QUEUE"|"IN_PROGRESS"|"COMPLETED" }
  //           COMPLETED 시 GET /requests/{id} → 실제 결과
  if (req.method === 'GET') {
    const { requestId } = req.query;
    if (!requestId) return res.status(400).json({ error: 'requestId 필수' });

    try {
      const statusRes = await fetch(
        `${FAL_QUEUE_BASE}/requests/${requestId}/status`,
        {
          headers: falHeaders(),
          signal: AbortSignal.timeout(8000),
        }
      );

      if (!statusRes.ok) {
        const txt = await statusRes.text().catch(() => '');
        return res.status(500).json({
          error: `fal status ${statusRes.status}: ${txt.substring(0, 200)}`,
        });
      }

      const statusData = await statusRes.json();
      const s = statusData.status;

      if (s === 'COMPLETED') {
        const resultRes = await fetch(
          `${FAL_QUEUE_BASE}/requests/${requestId}`,
          {
            headers: falHeaders(),
            signal: AbortSignal.timeout(8000),
          }
        );
        if (!resultRes.ok) {
          const txt = await resultRes.text().catch(() => '');
          return res.status(500).json({
            error: `fal result ${resultRes.status}: ${txt.substring(0, 200)}`,
          });
        }
        const result = await resultRes.json();
        const lipsyncedVideoUrl = result.video?.url || null;
        return res.status(200).json({
          status: 'completed',
          lipsyncedVideoUrl,
        });
      }

      if (s === 'IN_QUEUE') {
        return res.status(200).json({ status: 'queued' });
      }
      if (s === 'IN_PROGRESS') {
        return res.status(200).json({ status: 'processing' });
      }
      return res.status(200).json({ status: 'failed', error: s });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — lipsync 요청 제출
  if (req.method === 'POST') {
    const {
      videoUrl,
      audioUrl,
      audioBase64,
      audioMimeType = 'audio/mpeg',
      syncMode = 'cut_off',
    } = req.body || {};

    if (!videoUrl) return res.status(400).json({ error: 'videoUrl 필수' });
    if (!audioUrl && !audioBase64) {
      return res.status(400).json({ error: 'audioUrl 또는 audioBase64 필수' });
    }

    try {
      let finalAudioUrl = audioUrl;
      if (!finalAudioUrl && audioBase64) {
        finalAudioUrl = await uploadAudioToSupabase(audioBase64, audioMimeType);
        console.log(`[scene-lipsync] audio 업로드 완료: ${finalAudioUrl}`);
      }

      const submitRes = await fetch(FAL_QUEUE_BASE, {
        method: 'POST',
        headers: falHeaders(),
        body: JSON.stringify({
          video_url: videoUrl,
          audio_url: finalAudioUrl,
          sync_mode: syncMode,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!submitRes.ok) {
        const err = await submitRes.text().catch(() => '');
        return res.status(500).json({
          error: `fal sync-lipsync 제출 실패 ${submitRes.status}: ${err.substring(0, 300)}`,
        });
      }

      const data = await submitRes.json();
      const requestId = data.request_id;
      if (!requestId) {
        return res.status(500).json({
          error: 'request_id 없음',
          raw: JSON.stringify(data).substring(0, 200),
        });
      }

      return res.status(200).json({
        success: true,
        requestId,
        status: 'queued',
        audioUrl: finalAudioUrl,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

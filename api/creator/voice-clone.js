// ElevenLabs IVC (Instant Voice Cloning) — Supabase
// POST { personaId, audioBase64, mimeType, name } → voice_id 반환
// GET ?personaId=xxx → 저장된 voice_id 반환

import { getSupabase } from '../../lib/supabase.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const sb = getSupabase();

  if (req.method === 'GET') {
    const { personaId } = req.query;
    if (!personaId) return res.status(400).json({ error: 'personaId 필수' });
    try {
      const { data } = await sb
        .from('creator_persona_voices')
        .select('data')
        .eq('persona_id', personaId)
        .single();
      return res.status(200).json(data?.data || { voiceId: null });
    } catch {
      return res.status(200).json({ voiceId: null });
    }
  }

  if (req.method === 'POST') {
    const { personaId, audioBase64, mimeType = 'audio/mpeg', name } = req.body || {};
    if (!personaId || !audioBase64) {
      return res.status(400).json({ error: 'personaId, audioBase64 필수' });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ELEVENLABS_API_KEY 미설정' });

    try {
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      const ext = mimeType.includes('mp3') || mimeType.includes('mpeg') ? 'mp3'
               : mimeType.includes('wav') ? 'wav' : 'm4a';

      const formData = new FormData();
      formData.append('name', name || `Persona-${personaId.substring(0, 8)}`);
      formData.append('description', `AI 크리에이터 페르소나 목소리 — ${personaId}`);
      formData.append('files', new Blob([audioBuffer], { type: mimeType }), `voice-sample.${ext}`);
      formData.append('labels', JSON.stringify({ use_case: 'social_media', language: 'ko' }));

      const cloneRes = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: formData,
        signal: AbortSignal.timeout(55000),
      });

      if (!cloneRes.ok) {
        const err = await cloneRes.text();
        return res.status(500).json({ error: `ElevenLabs 클로닝 실패 ${cloneRes.status}: ${err.substring(0, 300)}` });
      }

      const data = await cloneRes.json();
      const voiceId = data?.voice_id;
      if (!voiceId) return res.status(500).json({ error: 'voice_id 없음' });

      await sb.from('creator_persona_voices').upsert({
        persona_id: personaId,
        data: { voiceId, name: data.name || name, personaId, createdAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      });

      return res.status(200).json({ success: true, voiceId, name: data.name });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

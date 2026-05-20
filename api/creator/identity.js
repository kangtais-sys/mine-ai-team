// Identity 메타 CRUD — creator_identity 테이블
// GET  ?id=mine-primary           → { identity }
// POST { id, displayName, ... }   → { success, identity }   (upsert)
// PATCH { id, ...fields }         → { success, identity }
// DELETE ?id=mine-primary         → { success }

import { getSupabase } from '../../lib/supabase.js';

export const config = { maxDuration: 15 };

const DEFAULT_ID = 'mine-primary';

export default async function handler(req, res) {
  const sb = getSupabase();

  if (req.method === 'GET') {
    const id = req.query.id || DEFAULT_ID;
    const { data, error } = await sb
      .from('creator_identity')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'identity 없음', id });
    return res.status(200).json({ identity: data });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const id = body.id || DEFAULT_ID;
    const payload = {
      id,
      display_name: body.displayName ?? body.display_name ?? 'MINE',
      heygen_avatar_id: body.heygenAvatarId ?? body.heygen_avatar_id ?? null,
      voice_id: body.voiceId ?? body.voice_id ?? null,
      languages: body.languages ?? ['en', 'zh', 'ja', 'ko'],
      brand_tone: body.brandTone ?? body.brand_tone ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await sb
      .from('creator_identity')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, identity: data });
  }

  if (req.method === 'PATCH') {
    const body = req.body || {};
    const id = body.id || DEFAULT_ID;
    const updates = { updated_at: new Date().toISOString() };
    if (body.displayName !== undefined) updates.display_name = body.displayName;
    if (body.heygenAvatarId !== undefined) updates.heygen_avatar_id = body.heygenAvatarId;
    if (body.voiceId !== undefined) updates.voice_id = body.voiceId;
    if (body.languages !== undefined) updates.languages = body.languages;
    if (body.brandTone !== undefined) updates.brand_tone = body.brandTone;

    const { data, error } = await sb
      .from('creator_identity')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, identity: data });
  }

  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id 필수' });
    const { error } = await sb.from('creator_identity').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

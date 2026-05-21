// Identity 메타 CRUD — creator_identity 테이블
// 스키마: (id TEXT PK, data JSONB, created_at, updated_at)
//   → displayName / heygenAvatarId / voiceId / languages / brandTone 은 모두 data JSONB 안.
//
// GET  ?id=mine-primary           → { identity: { id, data, created_at, updated_at } }
// POST { id, displayName, ... }   → upsert — 기존 data 와 merge (부분 갱신 OK)
// PATCH { id, ...fields }         → 기존 data 와 merge update
// DELETE ?id=mine-primary         → { success }

import { getSupabase } from '../../lib/supabase.js';

export const config = { maxDuration: 15 };

const DEFAULT_ID = 'mine-primary';

// body 필드 → data JSONB 키 매핑 (snake_case 도 받음)
function pickDataFields(body, prev = {}) {
  const out = { ...prev };
  const has = (k) => body[k] !== undefined;
  if (has('displayName') || has('display_name'))
    out.displayName = body.displayName ?? body.display_name;
  if (has('heygenAvatarId') || has('heygen_avatar_id'))
    out.heygenAvatarId = body.heygenAvatarId ?? body.heygen_avatar_id;
  if (has('voiceId') || has('voice_id'))
    out.voiceId = body.voiceId ?? body.voice_id;
  if (has('languages')) out.languages = body.languages;
  if (has('brandTone') || has('brand_tone'))
    out.brandTone = body.brandTone ?? body.brand_tone;
  // 베이스 얼굴 프리셋 — [{ id, name, assetId, url, description, created_at }]
  if (has('savedBases') || has('saved_bases'))
    out.saved_bases = body.savedBases ?? body.saved_bases;
  return out;
}

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

    const { data: existing } = await sb
      .from('creator_identity')
      .select('data')
      .eq('id', id)
      .maybeSingle();

    const prev = existing?.data || {};
    const merged = pickDataFields(body, prev);
    // 신규 생성 시 기본값 채우기
    if (!existing) {
      if (merged.displayName === undefined) merged.displayName = 'MINE';
      if (merged.languages === undefined) merged.languages = ['en', 'zh', 'ja', 'ko'];
    }

    const { data: row, error } = await sb
      .from('creator_identity')
      .upsert({ id, data: merged, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, identity: row });
  }

  if (req.method === 'PATCH') {
    const body = req.body || {};
    const id = body.id || DEFAULT_ID;

    const { data: existing, error: getErr } = await sb
      .from('creator_identity')
      .select('data')
      .eq('id', id)
      .maybeSingle();
    if (getErr) return res.status(500).json({ error: getErr.message });
    if (!existing) return res.status(404).json({ error: 'identity 없음', id });

    const merged = pickDataFields(body, existing.data || {});

    const { data: row, error } = await sb
      .from('creator_identity')
      .update({ data: merged, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, identity: row });
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

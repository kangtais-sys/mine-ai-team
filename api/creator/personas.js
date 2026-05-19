// 다중 페르소나 인덱스 관리 (Supabase)
// GET  → 저장된 페르소나 ID 목록
// POST → 새 페르소나 생성 (최대 3개)
// DELETE ?id=xxx → 페르소나 및 관련 데이터 삭제

import { getSupabase } from '../../lib/supabase.js';
import { randomUUID } from 'crypto';

const MAX_PERSONAS = 3;

export default async function handler(req, res) {
  const sb = getSupabase();

  if (req.method === 'GET') {
    try {
      const { data, error } = await sb
        .from('creator_personas')
        .select('id, data, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const ids = (data || []).map(r => r.id);
      return res.status(200).json({ ids, personas: data || [] });
    } catch (e) {
      return res.status(200).json({ ids: [], personas: [] });
    }
  }

  if (req.method === 'POST') {
    try {
      const { data: existing, error: listErr } = await sb
        .from('creator_personas')
        .select('id');
      if (listErr) throw listErr;
      if ((existing || []).length >= MAX_PERSONAS) {
        return res.status(400).json({ error: `최대 ${MAX_PERSONAS}개까지 가능합니다` });
      }
      const newId = req.body?.id || randomUUID();
      const initialData = req.body?.data || { name: '새 페르소나', id: newId };
      const { error: insertErr } = await sb
        .from('creator_personas')
        .insert({ id: newId, data: { ...initialData, id: newId } });
      if (insertErr) throw insertErr;
      const { data: updated } = await sb.from('creator_personas').select('id').order('created_at');
      return res.status(200).json({ id: newId, ids: (updated || []).map(r => r.id) });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 필수' });
    try {
      await Promise.allSettled([
        sb.from('creator_personas').delete().eq('id', id),
        sb.from('creator_persona_images').delete().eq('persona_id', id),
        sb.from('creator_persona_lora').delete().eq('persona_id', id),
        sb.from('creator_persona_voices').delete().eq('persona_id', id),
        sb.from('creator_drafts').delete().eq('persona_id', id),
      ]);
      const { data: updated } = await sb.from('creator_personas').select('id').order('created_at');
      return res.status(200).json({ success: true, ids: (updated || []).map(r => r.id) });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

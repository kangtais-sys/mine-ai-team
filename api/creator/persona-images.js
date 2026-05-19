// 페르소나 이미지 갤러리 관리 (Supabase)
// GET  → 저장된 이미지 목록 반환
// POST → 새 이미지 저장 (최대 10장)
// PATCH { id } → 대표 이미지 변경
// DELETE ?id=xxx → 특정 이미지 삭제

import { getSupabase } from '../../lib/supabase.js';
import { randomUUID } from 'crypto';

const MAX_IMAGES = 10;

export default async function handler(req, res) {
  const sb = getSupabase();
  const personaId = req.query?.personaId || req.body?.personaId || 'millimilli';

  if (req.method === 'GET') {
    try {
      const { data, error } = await sb
        .from('creator_persona_images')
        .select('*')
        .eq('persona_id', personaId)
        .order('saved_at', { ascending: false });
      if (error) throw error;
      const images = (data || []).map(r => ({
        id: r.id, url: r.url, prompt: r.prompt, via: r.via,
        label: r.label, angle: r.angle, isPrimary: r.is_primary, savedAt: r.saved_at,
      }));
      return res.status(200).json({ images });
    } catch {
      return res.status(200).json({ images: [] });
    }
  }

  if (req.method === 'POST') {
    const { imageUrl, prompt, via, label, angle } = req.body || {};
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl 필수' });

    try {
      // 현재 이미지 수 확인
      const { data: existing } = await sb
        .from('creator_persona_images')
        .select('id')
        .eq('persona_id', personaId)
        .order('saved_at', { ascending: true });

      // 최대 10장 초과 시 가장 오래된 것 삭제
      if ((existing || []).length >= MAX_IMAGES) {
        const toDelete = existing.slice(0, existing.length - MAX_IMAGES + 1).map(r => r.id);
        await sb.from('creator_persona_images').delete().in('id', toDelete);
      }

      const isPrimary = (existing || []).length === 0 || angle === 'front';
      const newId = randomUUID();

      const { error } = await sb.from('creator_persona_images').insert({
        id: newId,
        persona_id: personaId,
        url: imageUrl,
        prompt: prompt || '',
        via: via || '',
        label: label || '',
        angle: angle || '',
        is_primary: isPrimary,
        saved_at: new Date().toISOString(),
      });
      if (error) throw error;

      const { data: all } = await sb
        .from('creator_persona_images')
        .select('*')
        .eq('persona_id', personaId)
        .order('saved_at', { ascending: false });

      const images = (all || []).map(r => ({
        id: r.id, url: r.url, prompt: r.prompt, via: r.via,
        label: r.label, angle: r.angle, isPrimary: r.is_primary, savedAt: r.saved_at,
      }));

      return res.status(200).json({ success: true, image: images[0], images });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'PATCH') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id 필수' });
    try {
      // 전부 false
      await sb.from('creator_persona_images').update({ is_primary: false }).eq('persona_id', personaId);
      // 선택한 것만 true
      await sb.from('creator_persona_images').update({ is_primary: true }).eq('id', id);

      const { data: all } = await sb
        .from('creator_persona_images')
        .select('*')
        .eq('persona_id', personaId)
        .order('saved_at', { ascending: false });
      const images = (all || []).map(r => ({
        id: r.id, url: r.url, prompt: r.prompt, via: r.via,
        label: r.label, angle: r.angle, isPrimary: r.is_primary, savedAt: r.saved_at,
      }));
      return res.status(200).json({ success: true, images });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 필수' });
    try {
      await sb.from('creator_persona_images').delete().eq('id', id);
      const { data: all } = await sb
        .from('creator_persona_images')
        .select('*')
        .eq('persona_id', personaId)
        .order('saved_at', { ascending: false });
      // 대표 이미지 없으면 첫 번째로 설정
      if (all && all.length > 0 && !all.some(r => r.is_primary)) {
        await sb.from('creator_persona_images').update({ is_primary: true }).eq('id', all[0].id);
        all[0].is_primary = true;
      }
      const images = (all || []).map(r => ({
        id: r.id, url: r.url, prompt: r.prompt, via: r.via,
        label: r.label, angle: r.angle, isPrimary: r.is_primary, savedAt: r.saved_at,
      }));
      return res.status(200).json({ success: true, images });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

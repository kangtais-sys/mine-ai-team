import { getSupabase } from '../../lib/supabase.js';
import { checkHiggsfieldStatus } from './media.js';

export default async function handler(req, res) {
  const { id } = req.query;

  // id 없는 GET = 목록 조회 (이어서 작업할 V3 draft 목록)
  if (!id && req.method === 'GET') {
    const sb = getSupabase();
    const identityId = req.query.identityId;
    const { data, error } = await sb
      .from('creator_drafts')
      .select('id, persona_id, data, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    const drafts = (data || [])
      .map((r) => r.data)
      .filter((d) =>
        d &&
        d.version === 'v3' &&
        d.baseAssetId &&
        Array.isArray(d.scenes) &&
        d.scenes.length > 0 &&
        (!identityId || d.identityId === identityId)
      )
      .sort((a, b) => {
        const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return tb - ta;
      });
    return res.status(200).json({ drafts });
  }

  if (!id) return res.status(400).json({ error: 'id 필수' });

  const sb = getSupabase();
  const { data: row } = await sb.from('creator_drafts').select('data').eq('id', id).single();
  if (!row) return res.status(404).json({ error: '드래프트 없음' });
  let draft = row.data;

  if (req.method === 'GET') {
    if (draft.status === 'generating' && draft.higgsfieldJobId) {
      try {
        const { status, videoUrl } = await checkHiggsfieldStatus(draft.higgsfieldJobId);
        if (status === 'completed' && videoUrl) {
          draft = { ...draft, status: 'review', mediaUrl: videoUrl, updatedAt: new Date().toISOString() };
          await sb.from('creator_drafts').update({ data: draft }).eq('id', id);
        } else if (status === 'failed') {
          draft = { ...draft, status: 'failed', updatedAt: new Date().toISOString() };
          await sb.from('creator_drafts').update({ data: draft }).eq('id', id);
        }
      } catch (e) {
        console.error('[Creator Draft Poll]', e.message);
      }
    }
    return res.status(200).json({ draft });
  }

  if (req.method === 'PATCH') {
    const { caption, hashtags, scheduledAt, status, notes, mediaUrl, scenes, global_slots, globalSlots } = req.body || {};
    const updates = { updatedAt: new Date().toISOString() };
    if (caption !== undefined) updates.caption = caption;
    if (hashtags !== undefined) updates.hashtags = hashtags;
    if (notes !== undefined) updates.notes = notes;
    if (scheduledAt !== undefined) updates.scheduledAt = scheduledAt;
    if (status !== undefined) updates.status = status;
    if (mediaUrl !== undefined) updates.mediaUrl = mediaUrl;
    if (scenes !== undefined) updates.scenes = scenes;
    // 전역 슬롯 — snake_case/camelCase 둘 다 수용
    const gs = global_slots !== undefined ? global_slots : globalSlots;
    if (gs !== undefined) updates.global_slots = gs;
    const updated = { ...draft, ...updates };
    await sb.from('creator_drafts').update({ data: updated }).eq('id', id);
    return res.status(200).json({ success: true, draft: updated });
  }

  if (req.method === 'DELETE') {
    await sb.from('creator_drafts').delete().eq('id', id);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

import { getSupabase } from '../../lib/supabase.js';
import { checkHiggsfieldStatus } from './media.js';

export default async function handler(req, res) {
  const { id } = req.query;
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
    const { caption, hashtags, scheduledAt, status, notes, mediaUrl, scenes } = req.body || {};
    const updates = { updatedAt: new Date().toISOString() };
    if (caption !== undefined) updates.caption = caption;
    if (hashtags !== undefined) updates.hashtags = hashtags;
    if (notes !== undefined) updates.notes = notes;
    if (scheduledAt !== undefined) updates.scheduledAt = scheduledAt;
    if (status !== undefined) updates.status = status;
    if (mediaUrl !== undefined) updates.mediaUrl = mediaUrl;
    if (scenes !== undefined) updates.scenes = scenes;
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

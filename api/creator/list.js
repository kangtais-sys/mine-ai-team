import { getSupabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { personaId } = req.query;

  try {
    const sb = getSupabase();
    let query = sb
      .from('creator_drafts')
      .select('id, persona_id, data, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (personaId) query = query.eq('persona_id', personaId);
    const { data, error } = await query;
    if (error) throw error;
    const drafts = (data || []).map(r => r.data).filter(Boolean);
    return res.status(200).json({ drafts });
  } catch (e) {
    console.error('[Creator List]', e.message);
    return res.status(200).json({ drafts: [] });
  }
}

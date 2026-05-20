// Style Profile 조회 (Phase 1.5 = 읽기 전용)
// GET ?identityId=mine-primary  → { profile, exists }
// 추출/갱신은 Phase 2의 style-profile-update.js

import { getSupabase } from '../../lib/supabase.js';

export const config = { maxDuration: 10 };

const DEFAULT_ID = 'mine-primary';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const identityId = req.query.identityId || DEFAULT_ID;

  const sb = getSupabase();
  const { data, error } = await sb
    .from('creator_style_profile')
    .select('*')
    .eq('identity_id', identityId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) {
    return res.status(200).json({
      exists: false,
      profile: null,
      message: 'Style Profile이 아직 생성되지 않음 (Phase 2의 style-profile-update에서 생성)',
    });
  }

  return res.status(200).json({ exists: true, profile: data });
}

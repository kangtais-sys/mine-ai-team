// 자산 등록 — Storage는 클라이언트가 직접 업로드, 서버는 creator_assets row insert만
// POST { identityId, files: [{ url, path, mimeType, filename, assetType, source }] }
//   → { success, assets: [...], errors: [...] }
// assetType: 'photo' | 'video' | 'reference_photo' | 'reference_video' | 'product' | 'bgm'
// source:    'manual_upload' | 'reference'

import { getSupabase } from '../../lib/supabase.js';

export const config = { maxDuration: 15 };

const DEFAULT_ID = 'mine-primary';
const MAX_FILES_PER_REQ = 20;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { identityId = DEFAULT_ID, files } = req.body || {};
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'files 배열 필수' });
  }
  if (files.length > MAX_FILES_PER_REQ) {
    return res.status(400).json({ error: `한 번에 최대 ${MAX_FILES_PER_REQ}개` });
  }

  const sb = getSupabase();
  const uploaded = [];
  const errors = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i] || {};
    const { url, path, assetType, source = 'manual_upload' } = f;
    if (!url || !assetType) {
      errors.push({ index: i, error: 'url / assetType 필수' });
      continue;
    }

    const { data: row, error: insErr } = await sb
      .from('creator_assets')
      .insert({
        identity_id: identityId,
        asset_type: assetType,
        source,
        url,
        storage_path: path || null,
        thumbnail_url: null,
        auto_tags: {},
        manual_tags: [],
        is_favorite: false,
      })
      .select()
      .single();

    if (insErr) {
      errors.push({ index: i, filename: f.filename, error: insErr.message, storagePath: path });
      continue;
    }
    uploaded.push(row);
  }

  return res.status(200).json({
    success: uploaded.length > 0,
    uploaded_count: uploaded.length,
    failed_count: errors.length,
    assets: uploaded,
    errors,
  });
}

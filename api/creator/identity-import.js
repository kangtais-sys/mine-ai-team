// 다중 파일 업로드 → Supabase Storage(creator-library) → creator_assets row 생성
// POST { identityId, files: [{ base64, mimeType, filename, assetType, source }] }
//   → { success, assets: [{ id, url, asset_type, ... }] }
// assetType: 'photo' | 'video' | 'reference_photo' | 'reference_video' | 'product' | 'bgm'
// source:    'manual_upload' | 'reference'

import { getSupabase } from '../../lib/supabase.js';
import { randomUUID } from 'crypto';

export const config = { maxDuration: 60 };

const BUCKET = 'creator-library';
const DEFAULT_ID = 'mine-primary';
const MAX_FILES_PER_REQ = 20;

function extFromMime(mime = '') {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('audio/mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return 'jpg';
}

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
    const { base64, mimeType = 'image/jpeg', filename, assetType, source = 'manual_upload' } = f;
    if (!base64 || !assetType) {
      errors.push({ index: i, error: 'base64 / assetType 필수' });
      continue;
    }

    try {
      const buffer = Buffer.from(base64, 'base64');
      const ext = extFromMime(mimeType);
      const safeName = (filename || `${assetType}-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${identityId}/${assetType}/${randomUUID()}-${safeName.endsWith(`.${ext}`) ? safeName : `${safeName}.${ext}`}`;

      const { error: upErr } = await sb.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: mimeType, upsert: false });
      if (upErr) {
        errors.push({ index: i, filename, error: upErr.message });
        continue;
      }

      const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = pub?.publicUrl;

      const { data: row, error: insErr } = await sb
        .from('creator_assets')
        .insert({
          identity_id: identityId,
          asset_type: assetType,
          source,
          url: publicUrl,
          thumbnail_url: null,
          auto_tags: {},
          manual_tags: [],
          is_favorite: false,
        })
        .select()
        .single();
      if (insErr) {
        errors.push({ index: i, filename, error: insErr.message, storagePath: path });
        continue;
      }

      uploaded.push(row);
    } catch (e) {
      errors.push({ index: i, filename: f.filename, error: e.message });
    }
  }

  return res.status(200).json({
    success: uploaded.length > 0,
    uploaded_count: uploaded.length,
    failed_count: errors.length,
    assets: uploaded,
    errors,
  });
}

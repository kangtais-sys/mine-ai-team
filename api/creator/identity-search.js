// creator_assets 검색 + 편집 핸들러
// GET ?identityId=mine-primary
//     &assetType=photo,video
//     &space=vanity,cafe         (auto_tags.space contains)
//     &mood=cozy,warm            (auto_tags.mood overlap)
//     &usableFor=talking_head    (auto_tags.usable_for contains)
//     &tag=tag1,tag2             (manual_tags overlap/contains)
//     &tagMode=or|and            (default: or — overlaps / and — contains 전부 포함)
//     &favorite=true             (is_favorite)
//     &limit=50&offset=0&sort=newest|favorited|most_used
//   → { assets: [...], total }
//
// PATCH ?id=123    body: { is_favorite, manual_tags, notes, favorited_at, is_heygen_primary, use_count }
//   → { success, asset }
// DELETE ?id=123   → row + Storage 파일 같이 삭제 → { success, storage_removed }

import { getSupabase } from '../../lib/supabase.js';

export const config = { maxDuration: 15 };

const PATCH_ALLOWED = new Set([
  'is_favorite',
  'favorited_at',
  'manual_tags',
  'notes',
  'is_heygen_primary',
  'use_count',
]);

const SORT_MAP = {
  newest: { col: 'created_at', asc: false },
  oldest: { col: 'created_at', asc: true },
  favorited: { col: 'favorited_at', asc: false },
  most_used: { col: 'use_count', asc: false },
};

function csv(v) {
  if (!v) return [];
  return String(v)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export default async function handler(req, res) {
  const sb = getSupabase();

  if (req.method === 'PATCH') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id 필수' });
    const body = req.body || {};
    const updates = {};
    for (const k of Object.keys(body)) {
      if (PATCH_ALLOWED.has(k)) updates[k] = body[k];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: '수정 가능한 필드 없음' });
    }
    // is_favorite=true 가 들어오면 favorited_at 자동
    if (updates.is_favorite === true && updates.favorited_at === undefined) {
      updates.favorited_at = new Date().toISOString();
    }
    if (updates.is_favorite === false && updates.favorited_at === undefined) {
      updates.favorited_at = null;
    }

    const { data, error } = await sb
      .from('creator_assets')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, asset: data });
  }

  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id 필수' });

    // 1) row 조회해서 storage_path 확보
    const { data: row, error: getErr } = await sb
      .from('creator_assets')
      .select('storage_path')
      .eq('id', id)
      .maybeSingle();
    if (getErr) return res.status(500).json({ error: getErr.message });

    // 2) Storage 파일 정리 (best-effort — 실패해도 row 삭제는 계속)
    let storageRemoved = false;
    let storageError = null;
    if (row?.storage_path) {
      const { error: stErr } = await sb.storage
        .from('creator-library')
        .remove([row.storage_path]);
      if (stErr) {
        storageError = stErr.message;
        console.error('[identity-search DELETE] storage remove fail', stErr.message);
      } else {
        storageRemoved = true;
      }
    }

    // 3) row 삭제
    const { error } = await sb.from('creator_assets').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message, storage_removed: storageRemoved });
    return res.status(200).json({ success: true, storage_removed: storageRemoved, storage_error: storageError });
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const q = req.query;

  const identityId = q.identityId || 'mine-primary';
  const assetTypes = csv(q.assetType);
  const spaces = csv(q.space);
  const moods = csv(q.mood);
  const usableFor = csv(q.usableFor);
  const manualTags = csv(q.tag);
  const tagMode = q.tagMode === 'and' ? 'and' : 'or';
  const favorite = q.favorite === 'true' ? true : q.favorite === 'false' ? false : null;
  const limit = Math.min(parseInt(q.limit || '50', 10) || 50, 200);
  const offset = Math.max(parseInt(q.offset || '0', 10) || 0, 0);
  const sort = SORT_MAP[q.sort] || SORT_MAP.newest;

  let query = sb
    .from('creator_assets')
    .select('*', { count: 'exact' })
    .eq('identity_id', identityId);

  if (assetTypes.length) query = query.in('asset_type', assetTypes);
  if (favorite !== null) query = query.eq('is_favorite', favorite);
  if (manualTags.length) {
    // and: 모두 포함, or: 하나라도 매치
    query = tagMode === 'and'
      ? query.contains('manual_tags', manualTags)
      : query.overlaps('manual_tags', manualTags);
  }

  // auto_tags JSONB 필터 — Supabase contains 연산
  if (spaces.length === 1) query = query.eq('auto_tags->>space', spaces[0]);
  if (spaces.length > 1) query = query.in('auto_tags->>space', spaces);
  if (moods.length) query = query.contains('auto_tags', { mood: moods });
  if (usableFor.length) query = query.contains('auto_tags', { usable_for: usableFor });

  query = query.order(sort.col, { ascending: sort.asc, nullsFirst: false });
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({
    assets: data || [],
    total: count ?? (data?.length || 0),
    limit,
    offset,
  });
}

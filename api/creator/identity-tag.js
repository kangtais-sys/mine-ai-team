// Claude Vision 자동 태깅 — creator_assets.auto_tags JSONB 채움
// POST { assetIds: [1, 2, ...] }  또는  { assetId: 1 }
//   → { success, tagged: [{ id, auto_tags }], errors }
// 비디오 자산은 일단 스킵 (URL → 썸네일 추출은 Phase 2)

import Anthropic from '@anthropic-ai/sdk';
import { getSupabase } from '../../lib/supabase.js';

export const config = { maxDuration: 120 };

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

const TAG_SCHEMA_PROMPT = `이미지를 K-뷰티 숏폼 콘텐츠 자산 관점에서 분석해서 JSON으로만 응답해.
스키마:
{
  "space": "vanity|bedroom|bathroom|living_room|kitchen|cafe|studio|outdoor|other",
  "outfit": "string (예: white_tee_jeans, robe_silk, dress_pastel)",
  "mood": ["cozy", "warm", "minimal", ...],
  "colors": ["#hex", "#hex"],
  "lighting": "natural|soft|harsh|backlit|golden",
  "camera_angle": "eye_level|low|high|closeup|wide",
  "subject": "self_face|self_body|product|space|broll",
  "products_visible": ["스킨케어", "메이크업", ...],
  "skin_tone_visible": true,
  "usable_for": ["talking_head", "product_closeup", "lifestyle_broll", "hook_3sec"]
}
JSON 외 텍스트 절대 금지.`;

async function tagOne(asset) {
  if (asset.asset_type?.includes('video') || asset.asset_type === 'bgm') {
    return { id: asset.id, skipped: true, reason: `${asset.asset_type} 태깅은 Phase 2` };
  }

  const url = asset.thumbnail_url || asset.url;
  if (!url) return { id: asset.id, error: 'url 없음' };

  const imgRes = await fetch(url);
  if (!imgRes.ok) return { id: asset.id, error: `이미지 fetch 실패 ${imgRes.status}` };
  const arrBuf = await imgRes.arrayBuffer();
  const b64 = Buffer.from(arrBuf).toString('base64');
  const mediaType = imgRes.headers.get('content-type') || 'image/jpeg';

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: TAG_SCHEMA_PROMPT },
        ],
      },
    ],
  });

  const raw = msg.content?.[0]?.text?.trim() || '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { id: asset.id, error: 'JSON 파싱 실패', raw: raw.substring(0, 200) };

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    return { id: asset.id, error: 'JSON parse error', raw: raw.substring(0, 200) };
  }

  return { id: asset.id, auto_tags: parsed };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const ids = Array.isArray(body.assetIds)
    ? body.assetIds
    : body.assetId
      ? [body.assetId]
      : [];
  if (ids.length === 0) return res.status(400).json({ error: 'assetIds 또는 assetId 필수' });
  if (ids.length > 10) return res.status(400).json({ error: '한 번에 최대 10개' });

  const sb = getSupabase();
  const { data: assets, error } = await sb
    .from('creator_assets')
    .select('id, asset_type, url, thumbnail_url')
    .in('id', ids);
  if (error) return res.status(500).json({ error: error.message });
  if (!assets?.length) return res.status(404).json({ error: '자산 없음' });

  const tagged = [];
  const errors = [];

  for (const a of assets) {
    try {
      const result = await tagOne(a);
      if (result.error) {
        errors.push(result);
        continue;
      }
      if (result.skipped) {
        errors.push(result);
        continue;
      }
      const { error: upErr } = await sb
        .from('creator_assets')
        .update({ auto_tags: result.auto_tags, tagged_at: new Date().toISOString() })
        .eq('id', a.id);
      if (upErr) {
        errors.push({ id: a.id, error: upErr.message });
        continue;
      }
      tagged.push({ id: a.id, auto_tags: result.auto_tags });
    } catch (e) {
      errors.push({ id: a.id, error: e.message });
    }
  }

  return res.status(200).json({
    success: tagged.length > 0,
    tagged_count: tagged.length,
    failed_count: errors.length,
    tagged,
    errors,
  });
}

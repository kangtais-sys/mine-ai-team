// Higgsfield 학습된 캐릭터(Soul ID 포함) 목록 조회
//
// GET /api/creator/higgsfield-characters
//   → fnf.higgsfield.ai/agents/custom-references GET
//   → 응답 정규화 + raw 동봉 (첫 호출에서 스키마 확인 후 raw 제거 예정)
//
// 인증: lib/higgsfield-tokens.js 위임 (Supabase higgsfield_tokens 단일 행)
//   → Redis 토큰 캐시는 제거됨 (silent fail 근본 차단)
//
// 과금: GET만. 학습/생성 POST 없음.
//
// 결과 활용 예정:
//   - PersonaCreator STEP 1에서 "내 학습된 캐릭터 드롭다운"
//   - persona-soul.js의 soulId 손 붙여넣기 → 이 응답의 id 자동 선택으로 교체

import { fnfFetch as fnfFetchBase } from '../../lib/higgsfield-tokens.js';

export const config = { maxDuration: 30 };

const FNF_BASE = 'https://fnf.higgsfield.ai';

function fnfFetch(url, options = {}) {
  return fnfFetchBase(url, options, 'hf-characters');
}

// ── 응답 파싱 헬퍼 (스키마 미확인 상태 — 광범위 대응) ──

// 배열이 어디에 있는지 모르니 가능한 후보 위치 다 시도
function pickArray(json) {
  if (Array.isArray(json)) return json;
  const candidates = [
    json?.data,
    json?.items,
    json?.results,
    json?.characters,
    json?.souls,
    json?.soul_ids,
    json?.custom_references,
    json?.list,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return null;
}

// 항목 정규화 — 어떤 필드명이든 추출 시도 (raw도 함께 보존)
function normalize(item) {
  if (!item || typeof item !== 'object') return { raw: item };
  return {
    id:
      item.id ||
      item.character_id ||
      item.soul_id ||
      item.reference_id ||
      item.uuid ||
      null,
    name: item.name || item.title || item.label || null,
    photoCount:
      item.photo_count ||
      item.image_count ||
      item.images_count ||
      (Array.isArray(item.images) ? item.images.length : null) ||
      (Array.isArray(item.input_images) ? item.input_images.length : null),
    model: item.model || item.engine || item.type || null,
    status: item.status || null,
    thumbnailUrl:
      item.thumbnail_url ||
      item.thumbnail ||
      item.preview_url ||
      item.cover_url ||
      (Array.isArray(item.images) ? item.images[0]?.url : null),
    createdAt: item.created_at || item.createdAt || null,
    raw: item,
  };
}

// ── Handler ──

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const url = `${FNF_BASE}/agents/custom-references`;
    const r = await fnfFetch(url, { method: 'GET' });
    const text = await r.text();
    let raw = null;
    try {
      raw = JSON.parse(text);
    } catch {
      // JSON 아님
    }

    if (!r.ok) {
      return res.status(r.status).json({
        error: `Higgsfield ${r.status}`,
        bodyText: text.substring(0, 500),
        bodyJson: raw,
      });
    }

    const arr = pickArray(raw);
    const normalized = arr ? arr.map(normalize) : null;

    // 사용자가 학습한 'Mine' 캐릭터 + Milli_* 들 추출
    const mine =
      normalized?.find(
        (c) =>
          c.name === 'Mine' ||
          (typeof c.name === 'string' && c.name.toLowerCase() === 'mine')
      ) || null;
    const millis =
      normalized?.filter(
        (c) =>
          typeof c.name === 'string' && c.name.toLowerCase().startsWith('milli')
      ) || [];

    return res.status(200).json({
      success: true,
      count: normalized?.length ?? 0,
      mine,
      millis,
      characters: normalized,
      raw, // 스키마 확인 후 다음 푸시에서 제거 예정
    });
  } catch (e) {
    console.error('[hf-characters]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

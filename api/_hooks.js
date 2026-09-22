// 훅 라이브러리 — docs/content-team-design.md §4-2.
//
// 내부 위너와 외부 트렌드에서 뽑아낸 "훅 카드"를 쌓는다. 이게 생성 파이프라인의 입력이다.
// 트렌드를 "봤다"로 끝내지 않고 **재사용 가능한 부품**으로 남기는 게 목적.
//
// ⛔ 저작권 선: 원본 영상·오디오·대사·얼굴을 1:1 복제하지 않는다.
//    카드는 관찰한 원문(sourceHook)과 **우리 제품용 오리지널 훅(adapted)** 을 분리해 보관한다.
//    생성에 쓰는 건 adapted 뿐이고, sourceHook 은 근거·추적용이다.

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const HOOKS_KEY = 'content:hooks:v1';

// 레버 = 이 훅이 왜 먹히는가. 생성 시 "직전과 다른 레버" 로테이션에 쓴다.
export const LEVERS = {
  CURIOSITY: '궁금증 갭',
  PROOF: '대세감·사회적증거',
  CONTRAST: '반전·대비',
  RELATE: '공감·상황',
  SAVE: '저장 유발',
  SHARE: '공유 유발',
};

export const SOURCES = { internal: '내부 위너', meta_library: '메타 광고 라이브러리', youtube: '유튜브 숏츠', tiktok: '틱톡' };

/**
 * 중복 판정 키 — 같은 출처를 두 번 쌓지 않는다.
 * ⚠️ 쿼리스트링을 통째로 버리면 안 된다. 유튜브는 영상 ID가 `?v=` 안에 있어서
 *    `?...` 제거 시 모든 영상이 `youtube.com/watch` 하나로 뭉개진다.
 *    → refId(플랫폼 고유 ID)를 최우선으로 쓰고, 없을 때만 URL 을 쓴다.
 */
export function hookKey(card) {
  if (card.refId) return `${card.source}:${card.refId}`;
  const u = String(card.sourceUrl || '').replace(/#.*$/, '').replace(/\/+$/, '');
  return `${card.source}:${u || card.sourceHook || ''}`;
}

/**
 * 훅 카드 정규화. 저장 전에 반드시 통과시킬 것 — 축이 어긋난 카드가 섞이면
 * 매트릭스와 로테이션이 같이 망가진다.
 */
export function normalizeCard(raw = {}) {
  const now = new Date().toISOString();
  const card = {
    id: raw.id || null,
    source: raw.source,
    market: raw.market === 'kr' ? 'kr' : raw.market === 'us' ? 'us' : null,
    product: raw.product || null,
    angle: raw.angle || null,
    hookType: raw.hookType || null,
    lever: Object.prototype.hasOwnProperty.call(LEVERS, raw.lever) ? raw.lever : null,

    sourceHook: raw.sourceHook || null,          // 관찰한 원문 — 근거·추적용. 그대로 쓰지 말 것.
    adapted: {                                    // 우리 제품용 오리지널 훅. 생성에 쓰는 건 이것뿐.
      kr: raw.adapted?.kr || null,
      us: raw.adapted?.us || null,
    },
    beats: Array.isArray(raw.beats) ? raw.beats.slice(0, 4) : [],
    proof: raw.proof || null,                     // 대세감 장치
    why: raw.why || null,                         // 왜 먹히는지 한 줄

    sourceUrl: raw.sourceUrl || null,
    sourceMeta: raw.sourceMeta || null,           // 조회수·집행기간 등
    perf: raw.perf || null,                       // 내부 카드만: 훅률/유지율/본→클릭
    refId: raw.refId || null,

    usedIn: Array.isArray(raw.usedIn) ? raw.usedIn : [],
    cooldownUntil: raw.cooldownUntil || null,
    createdAt: raw.createdAt || now,
    updatedAt: now,
  };
  card.id = card.id || hookKey(card);
  return card;
}

export async function listHooks() {
  try {
    const all = (await redis.hgetall(HOOKS_KEY)) || {};
    return Object.values(all).filter(Boolean);
  } catch { return []; }
}

/** 새 카드만 저장(기존 키는 건너뜀). 반환: {added, skipped} */
export async function saveHooks(cards, { overwrite = false } = {}) {
  const existing = overwrite ? {} : ((await redis.hgetall(HOOKS_KEY)) || {});
  const toWrite = {};
  let skipped = 0;
  for (const raw of cards) {
    const card = normalizeCard(raw);
    if (!card.source || (!card.adapted.kr && !card.adapted.us)) { skipped++; continue; }
    if (!overwrite && existing[card.id]) { skipped++; continue; }
    toWrite[card.id] = card;
  }
  if (Object.keys(toWrite).length) await redis.hset(HOOKS_KEY, toWrite);
  return { added: Object.keys(toWrite).length, skipped };
}

/** 쿨다운 안 걸린 카드만. 생성 파이프라인이 고를 후보 풀. */
export function available(cards, at = new Date()) {
  return cards.filter(c => !c.cooldownUntil || new Date(c.cooldownUntil) <= at);
}

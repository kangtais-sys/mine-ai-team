// MILLI 페르소나 불변 외형 — Identity Lock
//
// 매력점 한 줄. Soul ID 가 머리/스킨/체형/얼굴 들고 있고
// 외형 토큰 잔뜩 넣으면 face attractor 옆으로 끌리므로 lock 은 매력점만.
//
// 사용처 (두 경로 공유 — 이 파일이 single source of truth):
//   • persona-soul.js   : 4각도 캐논 생성 시 ANGLE_VARIATIONS 앞에 prepend
//   • persona-image.js  : Nano Banana Pro (생성/inpaint) prompt 앞에 자동 prepend
//
// ⚠️ 이 한 줄 토큰 바꾸면 모든 캐논/콘텐츠 페이스가 흔들림 — 변경 시 매력점 위치 재검증 필수
// ⚠️ 현재는 MINE(millimilli) 단일 페르소나 가정. 다중 페르소나 도입 시 personaId 별 lock 으로 확장.

export const IDENTITY_LOCK_PROMPT =
  'tiny natural beauty mark just under the left eyebrow arch, between the brow and the upper eyelid, single subtle K-beauty charm point (visible on the viewer left side of her face).';

// 중복 감지 키 — withIdentityLock() 가 이미 박혀있는 prompt 알아보기 위한 시그니처.
// IDENTITY_LOCK_PROMPT 와 같은 표현 사용. 한 단어만 바꿔도 잡히도록 충분히 고유한 chunk.
const LOCK_SIGNATURE = 'beauty mark just under the left eyebrow';

/** prompt 앞에 IDENTITY_LOCK 자동 prepend.
 *  이미 같은 매력점 묘사가 들어있으면(중복) 그대로 반환. */
export function withIdentityLock(prompt) {
  if (!prompt) return IDENTITY_LOCK_PROMPT;
  if (typeof prompt === 'string' && prompt.includes(LOCK_SIGNATURE)) return prompt;
  return `${IDENTITY_LOCK_PROMPT} ${prompt}`;
}

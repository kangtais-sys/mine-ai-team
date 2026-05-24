// MILLI 페르소나 불변 외형 — Identity Lock
//
// [현 정책 — 2026-05-24 점 빼기로 확정]
// IDENTITY_LOCK_PROMPT 비어있음. 매력점을 prompt 로 박으면 nano_banana 가
// 매번 픽셀 위치를 새로 결정해서 콘텐츠 간 점 위치가 흔들림 (실측 확인).
// → 점 없이 통일된 얼굴로 모든 콘텐츠 생성. 캐논도 점 없는 버전으로 교체.
//
// 향후 매력점 다시 도입하려면:
//   1) 캐논 1장에 점 박고 그 픽셀 좌표 기억
//   2) 콘텐츠 생성마다 "preserve existing beauty mark exactly as in reference" 식으로 변경
//   3) 후처리 sharp/canvas 로 고정 좌표에 점 합성 (가장 일관성 ↑)
//
// 사용처 (두 경로 공유 — 이 파일이 single source of truth):
//   • persona-soul.js   : 4각도 캐논 생성 시 ANGLE_VARIATIONS 앞에 prepend
//   • persona-image.js  : Nano Banana Pro (생성/inpaint) prompt 앞에 자동 prepend
//
// ⚠️ 현재는 MINE(millimilli) 단일 페르소나 가정. 다중 페르소나 도입 시 personaId 별 lock 으로 확장.

export const IDENTITY_LOCK_PROMPT = '';

// 중복 감지 키 — 매력점 묘사가 호출자 prompt 에 들어있는지 판단.
// IDENTITY_LOCK 자체를 다시 켤 때 substring 시그니처가 바뀌면 같이 갱신.
const LOCK_SIGNATURE = 'beauty mark just under the left eyebrow';

/** prompt 앞에 IDENTITY_LOCK 자동 prepend.
 *  - LOCK 비어있으면 prompt 그대로 (현 정책).
 *  - 이미 같은 묘사 들어있으면 중복 감지해서 그대로 반환. */
export function withIdentityLock(prompt) {
  if (!IDENTITY_LOCK_PROMPT) return prompt || '';
  if (!prompt) return IDENTITY_LOCK_PROMPT;
  if (typeof prompt === 'string' && prompt.includes(LOCK_SIGNATURE)) return prompt;
  return `${IDENTITY_LOCK_PROMPT} ${prompt}`;
}

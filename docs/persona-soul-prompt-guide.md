# Persona Soul 실사화 프롬프트 가이드 (V3)

**작성일**: 2026-05-23
**테스트 character**: `67c4bcbf-8637-4fbf-8b43-3ae1a9ab48cd` (MINE Soul)
**엔진**: Higgsfield Soul v2 (`/agents/jobs`, `text2image_soul_v2`)

---

## 1. 세 버전 비교 (실측)

| 버전 | 커밋 | 톤 | 결과 | 결정 |
|---|---|---|---|---|
| V1 (원본) | (이전) | 너무 사실적인 기본 카메라 실사 | 가짜 글자 "CWYTEIDIΛUSM" + 번들거리는 이마 | ❌ |
| V2 (matte editorial) | `f348708` | 살짝 정제된 실사 느낌 | 깔끔, K-beauty 자연스러움 | ✅ **채택** |
| V3 (PDF 인사이트) | `474a9d1` | 뷰티 인플루언서 느낌으로 가꿔진 실사 | 과한 정제, 너무 매끈 | ❌ 롤백 |

→ 현재 main(`16c3c57`)은 V2 (`f348708`의 ANGLES)로 복귀.

---

## 2. 분포 트리거 — 피해야 할 키워드

| 키워드/조합 | 트리거되는 분포 | 부작용 |
|---|---|---|
| `professional beauty photography` + `8K` | 매거진 cover 분포 | **가짜 글자/타이포 ↑↑** |
| `no plastic, no airbrush` (단독) | 거꾸로 oily skin 분포 강화 | 번들거리는 이마 |
| `natural dewy glow` + K-beauty | 뷰티 인플루언서 분포 | 너무 가꿔진 느낌 |
| `Canon EF 85mm f/2.0` + 카테고리 라벨화 | 광고/매거진 톤 강화 | 실사보다 화보 느낌 |
| 카테고리 라벨(`Person:`/`Camera:`/`Lighting:`...) 다층 분리 | 광고 catalog 분포 | 너무 정제됨 |

---

## 3. 적정 톤 — V2 프롬프트 구조 (채택본)

### 공통 베이스 (모든 각도)
- `Korean woman in her late twenties`
- `Style: cinematic editorial portrait` ← 분포 핵심 (매거진 X, 영화 같은 인물 사진)
- `Lighting: soft diffused studio light` (각도별로 미세 변형)
- `Background: clean minimal pale neutral wall`
- `Skin: natural matte finish, soft visible fine pores, realistic skin tone, no oily shine, no sweat`
- `Makeup: natural minimal K-beauty look` (← `dewy glow` 안 붙임)
- `Quality: ultra-high detail, natural skin texture, realistic color, sharp focus, balanced contrast`

### 각도별 차이
| 각도 | 핵심 변형 |
|---|---|
| `front` | `eye-level, perfectly centered, looking directly, calm neutral, lips closed` |
| `three-quarter` | `head turned slightly, both eyes visible, closed-mouth smile, warm expression` |
| `smile` | `looking at camera, bright warm genuine open smile with teeth softly showing` |
| `closeup` | `tight close-up from forehead to chin, focused on facial detail and eye expression` |

### NEGATIVE_PROMPT (필수)
```
text, letters, words, typography, title, caption, watermark, logo, brand name, signature, magazine cover, frame, border,
plastic skin, doll skin, airbrushed, overly smooth skin, porcelain skin,
oily skin, sweaty skin, wet skin, greasy shine, glossy forehead,
different face, distorted face, extra fingers, extra limbs, deformed, asymmetric features,
blurry, low resolution, jpeg artifact, noise, grain
```

핵심 분류:
1. **글자 차단**: text/letters/typography/magazine cover/logo/watermark
2. **보정 과잉 차단**: plastic skin/airbrushed/porcelain skin
3. **oily 차단**: oily skin/sweaty skin/glossy forehead/greasy shine
4. **정체성 변형 차단**: distorted face/asymmetric features
5. **저품질 차단**: blurry/jpeg artifact/noise

---

## 4. Higgsfield Soul payload (검증 완료 — 변경 금지)

```javascript
{
  job_set_type: 'text2image_soul_v2',  // 1순위 (4 candidates fallback)
  params: {
    is_custom: false,
    model: 'soul_v2',
    model_version: 'fast',
    prompt: '<위 V2 프롬프트>',
    negative_prompt: '<NEGATIVE_PROMPT>',
    custom_reference_id: '<Soul UUID>',
    custom_reference_strength: 1,
    aspect_ratio: '3:4',
    quality: '1.5k',              // ⚠️ '1080p' 아님 — 422 enum error
    width: 1536,
    height: 2048,
    batch_size: 1,
    enhance_prompt: false,        // true 시 prompt 가 서버에서 재해석 → 분포 흔들림
    use_green: true,
    use_refiner: false,
    lora: null,
    chain_enhancer: null,
    medias: [],
    seed: <random 32-bit>,
    // style_id: 의도적 누락 — moodboard 간섭 방지
  }
}
```

---

## 5. Channel & 인증 (Cloudflare 우회)

- **POST**: `https://fnf.higgsfield.ai/agents/jobs` (Cloudflare-free)
- **Polling**: `https://fnf.higgsfield.ai/agents/jobs/{id}` (1순위), fallback `/jobs/{id}/status`, `/jobs/v2/{id}`
- ⚠️ `/jobs/v2/*`는 Cloudflare 보호 → 우회 필요. `/agents/jobs` 채널 사용.
- **Headers**: `Authorization: Bearer <token>` + `Content-Type: application/json` 만. Origin/Referer/sec-* 같은 BROWSER_HEADERS 추가 시 Cloudflare 의심 → 403.
- **Token rotation**: `/refresh` 호출 시 fnf 서버가 refresh_token 도 회전. 새 token Redis 저장 필수 (`higgsfield:refresh_token`, 30일 TTL).
- **Fetch timeout**: AbortController 25s. 없으면 polling hang.

---

## 6. 다음 변경 시 체크리스트

프롬프트 수정 전:
- [ ] V2(`f348708`)와 어떻게 다른지 한 줄로 정리
- [ ] 위 "분포 트리거" 표에 새 키워드 없는지 확인
- [ ] 1-angle 디버그 호출(`onlyAngle: 'front'`)로 먼저 검증 — DB 저장 X
- [ ] 통과 시에만 4-angle 풀콜

호출 예시:
```bash
# 1-angle 디버그
curl -X POST "https://mine-ai-team.vercel.app/api/creator/persona-soul?action=create" \
  -H "Content-Type: application/json" \
  -d '{"soulId":"67c4bcbf-8637-4fbf-8b43-3ae1a9ab48cd","identityId":"mine-primary","onlyAngle":"front"}'

# 4-angle 풀콜 (DB 저장됨)
curl -X POST "https://mine-ai-team.vercel.app/api/creator/persona-soul?action=create" \
  -H "Content-Type: application/json" \
  -d '{"soulId":"67c4bcbf-8637-4fbf-8b43-3ae1a9ab48cd","identityId":"mine-primary","name":"MINE 페르소나 V3"}'
```

---

## 7. 핵심 교훈 (한 줄)

> **"cinematic editorial portrait + matte finish + 강력한 negative_prompt"** 가 K뷰티 자연스러움과 실사 톤의 적정점.
> 그 이상 정제하면 "인플루언서 화보"로 분포가 옮겨감. 그 이하면 "기본 카메라 셀카".

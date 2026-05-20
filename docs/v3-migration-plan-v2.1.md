# AI 크리에이터 V3 마이그레이션 플랜 (v2.1 — FINAL)

> 작성일: 2026-05-20 (v2.1 개정)
> 작성자: Claude (Opus 4.7)
> 변경 사유: UX 흐름 재설계 + 멀티 레퍼런스 + 시네마틱 시퀀스 + 자동화 5종 통합
> 이전: v1 (촬영 기반) → v2 (라이브러리화) → **v2.1 (UX + 자동화 풀구성)**
> 상태: **확정. Phase 1.5 즉시 착수 가능**

---

## 0. 의사결정 요약 (변경 불가)

| 항목 | 결정 |
|---|---|
| 얼굴 자산 | MINE 본인 (LoRA 폐기) |
| 자산 전략 | **기존 자산 라이브러리화** (인스타 수만 장) |
| 다국어 우선순위 | **영어 → 중국어 → 일본어** |
| K-뷰티 LUT 톤 | 따뜻한 살구 + 페일 |
| 월 예산 | $1000+ |
| 컨텐츠 생성 방식 | **멀티 레퍼런스 슬롯 + 시네마틱 시퀀스 (두 모드 공존)** |
| 자동화 범위 | **1+2+3+4+6 전부 (풀구성)** |
| Style Profile 업데이트 | 월 1회 명시적 |
| 시나리오 매칭 | 장면마다 추천 3장 → 클릭 |

---

## 1. V3 핵심 명제 (v2.1 확정)

> **"AI로 사람 만들지 말고, MINE이 이미 만든 것을 AI가 학습 + 양산하게 하라."**

3가지 축으로 작동:

```
[1] Identity Library — MINE의 자산을 Vision으로 인덱싱
        ↓
[2] Style Profile — MINE의 톱 영상에서 자동 추출된 스타일 DNA
        ↓
[3] 자동화 5종 — 시나리오/동선/양산/Reference Tone/Style 적용
```

---

## 2. V3 전체 플로우 (시각화)

### STAGE 1: Identity 채우기 (최초 1회, 10~20분)

```
┌────────────────────────────────────────────────────────┐
│  🎬 Identity (탭 1)                                     │
│  ────────────────────────────────────────────────       │
│                                                         │
│  현재: 사진 0장, 영상 0개                                │
│                                                         │
│  [+ 자산 추가하기]                                       │
└────────────────────────────────────────────────────────┘
        ↓
[자산 추가 모달 — 단순화]
  📱 파일 업로드 (다중 가능)
     • Cmd+클릭으로 다중 선택
     • 드래그&드롭 지원
     • 사진/영상 모두 가능
     • iPhone에서 AirDrop으로 Mac에 보낸 후 업로드
     • 또는 폰 브라우저에서 직접 업로드
        ↓
[백그라운드 진행]
  1. Supabase Storage 업로드
  2. Vision 자동 태깅
  3. 썸네일 생성
  → 좋아요 톱 자동 마킹은 V3에서 제거. MINE이 직접 ⭐ 큐레이션

[인스타 연동 / Meta zip / instaloader 등 외부 통합 일절 없음]
```

### STAGE 1.5: 베이스 + Style Profile 설정 (최초 1회, 5분)

```
┌────────────────────────────────────────────────────────┐
│  🎬 Identity Library                                    │
│  ─────────────────────────────────────────────         │
│                                                         │
│  [라이브러리 그리드 — 태그/타입/날짜 필터]                │
│                                                         │
│  ──────────────────────────────────                     │
│  🌟 베이스 얼굴 (HeyGen 사용)                           │
│  [📷] [변경하기]                                         │
│                                                         │
│  🎯 후킹 학습 (좋아요 톱 24개 학습 완료)                │
│                                                         │
│  🎨 MINE Style Profile                                  │
│  ✅ 학습 완료 (2026-05-20)                              │
│  [상세 보기]                                             │
│  • 평균 영상 길이: 19초                                  │
│  • 자주 쓰는 공간: 화장대 32%, 거실 24%, 카페 18%        │
│  • 자막 톤: 반말 + 이모지 1.8개 평균                    │
│  • 후킹 패턴: 질문형 60%, 단언형 40%                    │
│  • 카메라 무브: 핸드헬드 68%, 정적 24%                  │
│  • 컬러 톤: 살구+페일 검증됨                            │
│  • BGM: 어쿠스틱 팝 + 칠한 비트                         │
│                                                         │
│  📅 다음 업데이트: 2026-06-20 (월 1회)                  │
│  [지금 업데이트]                                         │
│                                                         │
│  🎤 목소리: ✅ 한국어 ☐ 영어 ☐ 중국어 ☐ 일본어         │
│                                                         │
│  ──────────────────────────────────                     │
│  [💄 룩/동선 라이브러리]  [🎬 컨텐츠 만들기 →]          │
└────────────────────────────────────────────────────────┘
```

### STAGE 2: 컨텐츠 생성 (반복, 5분~15분)

**진입 방식 4가지** — 매번 어떻게 시작할지 선택:

```
┌────────────────────────────────────────────────────────┐
│  🎬 컨텐츠 만들기                                        │
│  ────────────────────────────────────────────────       │
│                                                         │
│  어떻게 시작하시겠어요?                                  │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │ 💬 시나리오 매칭   │  │ 💾 동선 패턴 사용  │            │
│  │ "한 줄로 설명"     │  │ "저장된 패턴 선택" │            │
│  │ → AI 자동 분해     │  │ → 슬롯 자동 채움  │            │
│  └──────────────────┘  └──────────────────┘            │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │ 🎬 Reference 영상 │  │ 🎨 처음부터       │            │
│  │ "이런 톤으로 만들기"│  │ "슬롯 직접 채움"  │            │
│  └──────────────────┘  └──────────────────┘            │
│                                                         │
└────────────────────────────────────────────────────────┘
```

각 진입 방식 상세는 섹션 4 참조.

### STAGE 3: 스토리보드 편집 (편집 가능)

```
┌────────────────────────────────────────────────────────┐
│  📋 스토리보드                                           │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 장면 1 — hook_3sec (3초) [Veo 3.1]               │   │
│  │ 자막 (한): "이거 모르면 30대 피부 큰일납니다"      │   │
│  │ 자막 (영): "Why your 30s skin needs this" [수정] │   │
│  │ 자막 (중): "30岁皮肤真正需要的" [수정]            │   │
│  │ [편집] [재생성] [🗑]                              │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 장면 2 — talking_head (5초) [HeyGen × 3언어]      │   │
│  │ 장면 모드: [정적]                                  │   │
│  │ 슬롯: 베이스 + 배경                                │   │
│  │ [편집] [재생성] [🗑]                              │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 장면 3 — 시네마틱 (5초) [Veo 3.1 First/Last]      │   │
│  │ 시작 프레임: [📷 화장대]                           │   │
│  │ 끝 프레임: [📷 화장대 + 제품 (AI 생성)]            │   │
│  │ 카메라: 푸시인                                     │   │
│  │ [편집] [재생성] [🗑]                              │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  [+ 장면 추가]  💰 예상 $11.20  ⏱ ~12분                │
│  [🎬 영상 생성 시작 →]                                   │
└────────────────────────────────────────────────────────┘
```

### STAGE 4: 영상 생성 (백그라운드)

장면 단위 병렬 처리. 완성된 장면은 즉시 미리보기 + 부분 재생성 가능.

### STAGE 5: 발행 (다국어 일괄)

캡션/해시태그 자동 생성, 채널별 발행, 중국 플랫폼은 다운로드.

---

## 3. 두 가지 장면 모드 (핵심 기능)

### 3-A. 정적 모드 (Static)

```
멀티 레퍼런스 슬롯 7개에 사진 끼움
        ↓
Nano Banana / FLUX Kontext Multi가 합성 이미지 생성
        ↓
짧은 모션 부여 (Seedance 2 또는 Kling 5초)
        ↓
결과: 인스타 캐러셀 같은 컷 영상

장점: 빠름, 저렴 ($0.30~1.0/장면)
적합: B-roll, 제품컷, 후킹 컷
```

**슬롯 종류**:
- 🌟 베이스 (필수): 내 얼굴
- 👗 의상 (선택)
- 💇 헤어 (선택)
- 🏞 배경 (선택)
- 💄 메이크업 (선택)
- 🎬 톤/조명 (선택)
- 📐 각도/포즈 (선택)
- 🧴 제품 (선택, 복수 가능)

**규칙**:
- 슬롯 비우면 = 베이스 사진의 해당 요소 유지
- 베이스 외 모든 슬롯 선택사항
- 슬롯 우측 [× 제거] 항상 있음

### 3-B. 시네마틱 모드 (Cinematic)

```
시작 프레임 + 끝 프레임 입력
        ↓
Veo 3.1 First/Last Frame이 사이 5~8초 자동 보간
        ↓
다음 장면 = 이전 장면의 끝 프레임에서 자동 시작
        ↓
결과: 시간축 흐름이 있는 시네마틱 시퀀스

장점: 자연스러운 동선, 시네마틱 룩
적합: 후킹, 트랜지션, 동선 시퀀스
비용: $1.60~4.0/장면
```

**끝 프레임 옵션**:
- 라이브러리에서 선택 (다른 공간/자세 사진)
- 직접 업로드
- **AI 자동 생성** (Nano Banana, 같은 공간 내 자세 변화)

**카메라 무브 프리셋 7종**:
- 핸드헬드 / 트래킹 / 푸시인 / 풀백 / 팬 / 틸트 / 지미집 / 정적

**한계 (명시)**:
- ✅ 같은 공간 내 자세 변화 → AI 끝프레임 가능
- ❌ 다른 공간 점프 → 그 공간 사진 필수

### 3-C. 모드 믹스

한 영상 안에서 장면별 모드 자유 선택:

```
장면 1: 시네마틱 (후킹, 침대 누움→일어남)
장면 2: 정적 talking_head (HeyGen)
장면 3: 시네마틱 (이동, 침실→화장대)
장면 4: 정적 product_closeup (Veo 3.1)
장면 5: 시네마틱 (제품 픽업)
장면 6: 정적 마무리 (Seedance B-roll)
```

---

## 4. 자동화 5종 (V3 핵심 USP)

| # | 자동화 | 역할 |
|---|---|---|
| 1 | **시나리오 → 자산 매칭** | 한 줄 시나리오 → 장면 분해 + 라이브러리 자산 자동 매칭 |
| 2 | **동선 패턴 저장** | 자주 쓰는 공간 동선을 패턴으로 저장/재사용 |
| 3 | **비슷한 영상 양산** | 완성본에서 변형 5개 자동 생성 (A/B 테스트용) |
| 4 | **Reference 영상 톤 학습** | 영상/사진/텍스트 업로드 → 톤 분석 → 새 주제에 적용 |
| 5 | **Style Profile** | ⭐ 자산 종합 분석 → 모든 자동 생성에 자동 반영 (월 1회) |

### 4-1. 시나리오 매칭

```
[입력]
"침실에서 일어나서 화장대로 가서 신제품 발라보는 일상 브이로그"
        ↓
[Claude 분해]
장면 1: 침실 (누움 → 일어남) — 시네마틱
장면 2: 침실 → 복도 이동 — 시네마틱
장면 3: 복도 → 화장대 도착 — 시네마틱
장면 4: 화장대 제품 픽업 — 정적
장면 5: 제품 발라봄 — 시네마틱
        ↓
[각 장면마다 라이브러리 매칭]
장면 1: 침실 태그 12장 → 톱 3장 추천
장면 2: 복도 태그 5장 → 톱 3장 추천
...
        ↓
[사용자: 각 장면 3장 중 1장 클릭]
        ↓
스토리보드 자동 완성
```

### 4-2. 동선 패턴 저장 (Movement Patterns)

```
저장된 패턴 예시:
🌅 "모닝 루틴" (8회): 침실 → 복도 → 화장대 → 거실
🌸 "메이크업 비포애프터": 화장대 노메이크업 → 화장대 풀메이크업
🛍 "언박싱 → 사용기": 현관 → 거실 → 화장대
📦 "신제품 광고": 거실 talking → 화장대 클로즈업 → 거실 마무리

[패턴 선택]
        ↓
공간별 슬롯 자동 채움 (라이브러리에서 매칭)
        ↓
사용자: 제품/의상만 추가
```

### 4-3. 비슷한 영상 양산

```
[완성된 영상 1개]
        ↓
[+ 비슷한 변형 5개 만들기] 클릭
        ↓
AI 자동 변형:
변형 1: 의상만 다른 버전
변형 2: 후킹 멘트만 다른 버전 (후킹 후보 3개 중 다른 거)
변형 3: 배경만 다른 버전
변형 4: 자막 위치만 다른 버전
변형 5: 첫 3초만 다른 버전 (A/B 테스트용)
        ↓
[일괄 발행]
Instagram: 변형 1
TikTok: 변형 2
YouTube Shorts: 변형 3
        ↓
24시간 후: "베스트 변형은 #2였습니다"
```

### 4-4. Reference 영상 톤 학습

```
[컨텐츠 만들기] 진입 → [🎬 Reference 영상으로 톤 가져오기]
        ↓
입력 (셋 다 가능, 복수 OK):
  📹 영상 1~3개 (본인 영상 또는 외부 영감)
  🖼 사진 무드보드 (1~10장, 컬러/구도/조명 reference)
  📝 텍스트 설명 (선택)
     예: "자막 빠르게 깜빡임, 후킹 단언형, 칠한 BGM"
        ↓
Claude Vision + Claude 분석:
  영상에서 추출:
  - 평균 컷 길이 / 컷 전환 속도
  - 카메라 무브 패턴
  - 자막 위치/스타일/깜빡임 패턴
  - 컬러 톤 / 조명
  - BGM 분위기 / 비트
  - 후킹 구조 (첫 3초)
  
  사진에서 추출:
  - 컬러 팔레트
  - 구도/프레이밍
  - 무드 키워드
  
  텍스트에서 추출:
  - 명시적 의도 (사용자가 강조하고 싶은 톤)
        ↓
"Reference 톤 분석 완료" 카드 표시
사용자가 추출 결과 확인/수정 가능
        ↓
새 주제 입력 + 슬롯 채우기
        ↓
스토리보드 자동 생성 시:
- Style Profile (장기 평균) + Reference Tone (단발성 영감) 결합
- Reference Tone이 우선순위 더 높게 적용
- 같은 reference로 여러 주제 컨텐츠 만들 수 있음
        ↓
새 영상 완성
```

**Reference Tone vs Style Profile 차이**:

| 항목 | Style Profile | Reference Tone |
|---|---|---|
| 출처 | MINE의 ⭐ 자산 종합 평균 | 이번 영상용 업로드 reference |
| 적용 범위 | 모든 자동 생성에 자동 반영 | 이번 컨텐츠에만 단발 적용 |
| 업데이트 | 월 1회 명시적 | 매 컨텐츠마다 새로 |
| 우선순위 | 기본값 | Reference 있으면 우선 |
| 용도 | "MINE다움" 유지 | "이번엔 특별히 이런 톤" |

→ 둘이 **상호 보완**. Style Profile은 평소 톤, Reference Tone은 영감 모드.

**⭐ 즐겨찾기 유지**: 라이브러리 정리 + 빠른 reference 선택용. Reference 영상 업로드 시 ⭐ 자산에서 빠르게 끌어올 수 있음.

### 4-5. MINE Style Profile

```
자동 추출되는 항목:
- 평균 영상 길이
- 자주 쓰는 공간 (퍼센티지)
- 자막 톤 (반말/존댓말, 이모지 빈도)
- 후킹 패턴 (질문형/단언형 비율)
- 카메라 무브 선호도
- 컬러 톤
- BGM 장르

[적용되는 곳]
- 모든 자동 생성에 자동 반영
- 시나리오 매칭 시 → MINE 스타일 영상 길이/톤 자동 적용
- 비슷한 영상 양산 시 → 변형 범위가 Style Profile 안에서만
- 후킹 생성 시 → MINE 패턴대로

[업데이트 — 월 1회 명시적]
사용자가 [업데이트] 버튼 클릭 시:
- 지난 1개월간 새로 올라온 자산 + 좋아요 데이터 재분석
- Profile 변경사항 diff로 보여줌
- 사용자 승인 시 적용
```

---

## 5. V2 파일 분류 (v2.1 최종)

### ✅ 유지

`lib/supabase.js`, `api/creator/voice-clone.js`, `api/creator/upload-photo.js`, `api/creator/draft.js`, `api/creator/list.js`, `creator_drafts` 테이블, `creator_persona_voices` 테이블, `src/components/creator/content/StoryboardEditor.jsx` (보강), `SceneCard.jsx` (보강)

### 🟡 보강

| 파일 | 보강 내용 |
|---|---|
| `CreatorShell.jsx` | 4탭 유지, 1탭 "Identity" |
| `PersonaSection.jsx` | Identity Library + Style Profile 통합 |
| `api/creator/persona-imagegen.js` | FLUX 1.1 → FLUX Kontext Multi + Nano Banana |
| `api/creator/scene-video.js` | scene-router로 위임 |
| `api/creator/generate.js` | Style Profile 자동 적용, scene_type/scene_mode 라벨링 |
| `VideoGenerator.jsx` | 장면 단위 부분 재생성, 모드별 진행률 |
| `PublishPanel.jsx` | 다국어 일괄, A/B 변형 지원 |
| `ContentSetup.jsx` | 4가지 진입 방식 도입 |
| `StoryboardEditor.jsx` | 인라인 자막 편집, 다국어 동시 수정, 장면 모드 토글 |
| `SceneCard.jsx` | 정적/시네마틱 모드별 UI 분기 |

### ❌ 폐기

- `api/creator/persona-lora.js`
- `creator_persona_lora` 테이블
- `compose.js`, `voice.js`, `subtitle.js`
- `docs/identity-shoot-guide.md`

### ➕ 신설

#### API (15종)

| 파일 | 역할 |
|---|---|
| `api/creator/identity.js` | Identity 메타 CRUD |
| `api/creator/identity-import.js` | 다중 파일 업로드 (Supabase Storage) |
| `api/creator/identity-tag.js` | Claude Vision 자동 태깅 |
| `api/creator/identity-search.js` | 태그 기반 검색 |
| `api/creator/style-profile.js` | Style Profile 추출/조회 |
| `api/creator/style-profile-update.js` | 월 1회 명시적 업데이트 |
| `api/creator/scenario-parse.js` | 시나리오 → 장면 분해 + 자산 매칭 |
| `api/creator/movement-patterns.js` | 동선 패턴 CRUD |
| `api/creator/scene-router.js` | scene_type + scene_mode → 모델 라우팅 |
| `api/creator/heygen-lipsync.js` | HeyGen Avatar IV 다국어 |
| `api/creator/veo-firstlast.js` | Veo 3.1 First/Last Frame |
| `api/creator/generate-end-frame.js` | Nano Banana 끝 프레임 생성 |
| `api/creator/scene-extend.js` | 장면 자동 연결 |
| `api/creator/translate-script.js` | 영/중/일 자막 번역 |
| `api/creator/hook-learner.js` | 좋아요 톱 학습 → 후킹 |
| `api/creator/post-process.js` | Modal 후처리 트리거 |
| `api/creator/regenerate-scene.js` | 장면 단위 재생성 |
| `api/creator/variant-spawn.js` | 비슷한 영상 5종 자동 양산 |
| `api/creator/reference-tone.js` | **Reference 영상/사진/텍스트 톤 분석** (Claude Vision + Claude) |

#### DB 테이블

| 테이블 | 역할 |
|---|---|
| `creator_identity` (v1) | 본인 식별자 메타 (이미 생성) |
| `creator_video_renders` (v1) | 장면×언어×모델 추적 (이미 생성) |
| `creator_assets` (v2) | 라이브러리 자산 (Phase 1.5에서 생성) |
| `creator_style_profile` ★ | Style Profile (월 1회 갱신) |
| `creator_movement_patterns` ★ | 저장된 동선 패턴 |
| `creator_video_variants` ★ | 변형 영상 추적 (A/B용) |
| `creator_reference_tones` ★ | **Reference Tone 분석 캐싱** |

#### UI 컴포넌트

| 파일 | 역할 |
|---|---|
| `src/components/creator/identity/AssetUploader.jsx` | **다중 파일 업로드만** (드래그&드롭, Cmd+클릭 다중 선택) |
| `src/components/creator/identity/IdentityLibrary.jsx` | Pinterest 그리드 + 필터 |
| `src/components/creator/identity/StyleProfileCard.jsx` | Style Profile 표시/업데이트 |
| `src/components/creator/identity/AssetDetail.jsx` | 자산 클릭 시 상세 + **⭐ 즐겨찾기 토글** + 변형 진입 |
| `src/components/creator/content/EntryModeSelector.jsx` | 4가지 진입 방식 |
| `src/components/creator/content/ScenarioInput.jsx` | 시나리오 매칭 입력 |
| `src/components/creator/content/MovementPatternPicker.jsx` | 동선 패턴 선택/저장 |
| `src/components/creator/content/ReferenceTonePicker.jsx` | **Reference 영상/사진/텍스트 업로드 + 톤 분석 결과 표시** |
| `src/components/creator/content/MultiReferenceComposer.jsx` | 슬롯 7종 컴포저 |
| `src/components/creator/content/SceneModeToggle.jsx` | 정적/시네마틱 토글 |
| `src/components/creator/content/CinematicSceneEditor.jsx` | 시작/끝 프레임 + 카메라 무브 |
| `src/components/creator/content/FrameGenerator.jsx` | 끝 프레임 AI 자동 생성 |
| `src/components/creator/content/CameraMovementPicker.jsx` | 카메라 무브 프리셋 |
| `src/components/creator/content/RecommendedAssetPicker.jsx` | 매칭된 자산 3장 중 선택 |
| `src/components/creator/video/VariantSpawner.jsx` | 비슷한 영상 5종 양산 UI |
| `src/components/creator/video/SceneRegenerator.jsx` | 장면 단위 재생성 UI |

#### Modal

| 파일 | 역할 |
|---|---|
| `modal/postprocess_shorts.py` (Phase 1 완료) | FFmpeg LUT/그레인/자막 |

---

## 6. 모델 라우팅 테이블 (v2.1)

| scene_type | scene_mode | 모델 | 비용 |
|---|---|---|---|
| talking_head | static | HeyGen Avatar IV | $4/min |
| product_closeup | static | Veo 3.1 Standard | $0.40/sec |
| hook_3sec | static or cinematic | Veo 3.1 | $0.40/sec |
| motion_action | cinematic | Kling 3.0 Pro (First/Last) | $0.20/sec |
| lifestyle_broll | static | Seedance 2 | $0.30/clip |
| transition | cinematic | Veo 3.1 First/Last | $0.40/sec |
| text_overlay_only | — | 없음 | $0 |

**자동 라우팅 규칙**:
- scene_mode = 'cinematic' + scene_type = 'motion_action' → Kling 3.0 Pro
- scene_mode = 'cinematic' + 그 외 → Veo 3.1 First/Last
- scene_mode = 'static' + talking_head → HeyGen
- scene_mode = 'static' + product/hook → Veo 3.1
- scene_mode = 'static' + broll/transition → Seedance 2

---

## 7. DB 스키마 (Phase 1.5 SQL)

```sql
-- ===== V3 Phase 1.5: Library + Style Profile + Patterns =====

-- 1. creator_assets (라이브러리)
CREATE TABLE IF NOT EXISTS creator_assets (
  id BIGSERIAL PRIMARY KEY,
  identity_id TEXT DEFAULT 'mine-primary',
  asset_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual_upload',
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  auto_tags JSONB DEFAULT '{}'::jsonb,
  manual_tags TEXT[] DEFAULT '{}',
  is_favorite BOOLEAN DEFAULT false,  -- ⭐ MINE 직접 큐레이션 (자동화 4번 풀)
  favorited_at TIMESTAMPTZ,
  notes TEXT,                          -- MINE 메모 (선택)
  is_heygen_primary BOOLEAN DEFAULT false,
  use_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  tagged_at TIMESTAMPTZ,
  FOREIGN KEY (identity_id) REFERENCES creator_identity(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assets_type ON creator_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_tags ON creator_assets USING GIN (auto_tags);
CREATE INDEX IF NOT EXISTS idx_assets_manual ON creator_assets USING GIN (manual_tags);
CREATE INDEX IF NOT EXISTS idx_assets_favorite ON creator_assets(is_favorite) WHERE is_favorite = true;

ALTER TABLE creator_assets DISABLE ROW LEVEL SECURITY;

-- 2. creator_style_profile (스타일 DNA)
CREATE TABLE IF NOT EXISTS creator_style_profile (
  identity_id TEXT PRIMARY KEY DEFAULT 'mine-primary',
  profile_data JSONB NOT NULL,
  /* 예시:
  {
    "avg_video_length_sec": 19,
    "spaces": {"vanity": 0.32, "living_room": 0.24, "cafe": 0.18, ...},
    "caption_tone": "casual",
    "emoji_avg": 1.8,
    "hook_patterns": {"question": 0.60, "declarative": 0.40},
    "camera_moves": {"handheld": 0.68, "static": 0.24, ...},
    "color_tone": "k_beauty_warm_apricot_pale",
    "bgm_genres": ["acoustic_pop", "chill_beat"],
    "common_hooks": ["이거 모르면", "사실은", "솔직히 말씀드리면"],
    "sample_size": 50
  }
  */
  last_updated TIMESTAMPTZ DEFAULT now(),
  next_update_due TIMESTAMPTZ,
  version INT DEFAULT 1,
  FOREIGN KEY (identity_id) REFERENCES creator_identity(id) ON DELETE CASCADE
);

ALTER TABLE creator_style_profile DISABLE ROW LEVEL SECURITY;

-- 3. creator_movement_patterns (저장된 동선)
CREATE TABLE IF NOT EXISTS creator_movement_patterns (
  id BIGSERIAL PRIMARY KEY,
  identity_id TEXT DEFAULT 'mine-primary',
  name TEXT NOT NULL,
  icon TEXT,
  spaces TEXT[] NOT NULL,
  /* 예시: ['bedroom', 'hallway', 'vanity', 'living_room'] */
  default_scenes JSONB NOT NULL,
  /* 예시: 각 공간별 기본 scene_type, scene_mode, 길이 */
  use_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (identity_id) REFERENCES creator_identity(id) ON DELETE CASCADE
);

ALTER TABLE creator_movement_patterns DISABLE ROW LEVEL SECURITY;

-- 4. creator_video_variants (A/B 변형 추적)
CREATE TABLE IF NOT EXISTS creator_video_variants (
  id BIGSERIAL PRIMARY KEY,
  parent_draft_id TEXT REFERENCES creator_drafts(id) ON DELETE CASCADE,
  variant_index INT NOT NULL,
  variant_type TEXT NOT NULL,
  /* outfit_swap, hook_swap, background_swap, subtitle_position, hook_3sec */
  changes JSONB NOT NULL,
  draft_id TEXT REFERENCES creator_drafts(id),
  engagement_24h JSONB,
  /* {platform: instagram, likes: 1200, shares: 45, ...} */
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE creator_video_variants DISABLE ROW LEVEL SECURITY;

-- 5. creator_reference_tones (Reference Tone 캐싱)
CREATE TABLE IF NOT EXISTS creator_reference_tones (
  id BIGSERIAL PRIMARY KEY,
  identity_id TEXT DEFAULT 'mine-primary',
  draft_id TEXT REFERENCES creator_drafts(id) ON DELETE SET NULL,
  
  -- 입력 자산
  video_urls TEXT[] DEFAULT '{}',     -- 업로드된 reference 영상 1~3개
  photo_urls TEXT[] DEFAULT '{}',     -- 무드보드 사진 1~10장
  text_description TEXT,              -- 사용자 텍스트 설명
  
  -- 분석 결과 (Claude Vision + Claude)
  extracted_tone JSONB NOT NULL,
  /* 예시:
  {
    "video_analysis": {
      "avg_cut_length_sec": 2.3,
      "camera_moves": {"handheld": 0.80, "static": 0.20},
      "subtitle_style": "center_large_emoji",
      "color_palette": ["#F5E6D3", "#E8B89C"],
      "bgm_mood": "chill_upbeat",
      "hook_structure": "declarative_3sec"
    },
    "photo_analysis": {
      "dominant_colors": ["#F5E6D3", "#E8B89C"],
      "composition": "closeup_warm",
      "mood_keywords": ["cozy", "warm", "intimate"]
    },
    "text_intent": "자막 빠르게 깜빡임, 후킹 단언형, 칠한 BGM",
    "merged_directive": "..."
  }
  */
  
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (identity_id) REFERENCES creator_identity(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ref_tones_draft ON creator_reference_tones(draft_id);

ALTER TABLE creator_reference_tones DISABLE ROW LEVEL SECURITY;

-- 6. creator_drafts에 scene_mode 필드 (JSONB 확장이라 ALTER 불필요)
-- data.scenes[].scene_mode: 'static' | 'cinematic'
-- data.scenes[].start_frame_url: 시네마틱 모드
-- data.scenes[].end_frame_url: 시네마틱 모드
-- data.scenes[].camera_movement: 카메라 무브
-- data.scenes[].locked_translations: ['en', 'zh'] (사용자 직접 수정한 언어는 자동 재번역 안 함)

-- 6. creator_video_renders에 parent_render_id (재생성 이력)
ALTER TABLE creator_video_renders 
  ADD COLUMN IF NOT EXISTS parent_render_id BIGINT REFERENCES creator_video_renders(id),
  ADD COLUMN IF NOT EXISTS scene_mode TEXT DEFAULT 'static';

CREATE INDEX IF NOT EXISTS idx_renders_parent ON creator_video_renders(parent_render_id);
```

---

## 8. Phase 1.5 즉시 실행 작업

### 8-A. Supabase Storage 버킷

Dashboard → Storage → New bucket:
- 이름: `creator-library`
- Public: ✅
- Size limit: 50MB

### 8-B. Supabase SQL 실행

섹션 7의 SQL 전체 → Supabase SQL Editor → Run

### 8-C. 클로드코드 Phase 1.5 진입 지시문

```
mine-ai-team 프로젝트 V3 Phase 1.5 작업 시작.

[중요] V3 마이그레이션 플랜이 v2.1로 개정됨.
신규 인계 문서: /Users/yuminhye/mine-ai-team/docs/v3-migration-plan-v2.1.md
v1, v2 폐기 (참고만): /Users/yuminhye/mine-ai-team/docs/v3-migration-plan.md, v3-migration-plan-v2.md

[v2.1 핵심 추가]
- 두 가지 장면 모드: 정적(슬롯) + 시네마틱(시작/끝 프레임)
- 자동화 5종: 시나리오매칭, 동선패턴, 영상양산, Reference Tone, Style Profile
- Style Profile 월 1회 명시적 업데이트
- 시나리오 매칭 시 장면마다 3장 추천 → 클릭

[원칙]
- 기존 V2 파일 갈아엎지 마라. Phase 단위 진행.
- 신규 파일은 v2.1 명세 100% 그대로.
- 기존 파일 보강 시 read → str_replace로.
- API 키 채팅 금지, 터미널만.
- git status 깨끗한지 확인하고 시작.

[Phase 1.5 실행 작업 — 순서대로]

1. git status 확인 후 깨끗한지 보고.

2. v2.1 섹션 7의 Supabase SQL 출력 (사용자가 Dashboard에 붙여넣을 것).

3. Supabase Storage 버킷 생성 가이드 정리.

4. 신규 API 작성 — Phase 1.5 범위 (라이브러리 + Style Profile 인프라):
   - api/creator/identity.js
   - api/creator/identity-import.js
   - api/creator/identity-tag.js  
   - api/creator/identity-search.js
   - api/creator/style-profile.js (조회만, 추출 로직은 Phase 2)

5. 신규 UI 작성 — Phase 1.5 범위:
   - src/components/creator/identity/AssetUploader.jsx
   - src/components/creator/identity/IdentityLibrary.jsx
   - src/components/creator/identity/StyleProfileCard.jsx (placeholder, 데이터는 Phase 2)
   - src/components/creator/identity/AssetDetail.jsx

6. 작성한 파일 의존 관계 다이어그램 출력.

[작업 완료 후]
- 체크리스트 보고하고 대기.
- 사용자 액션 안내:
  * Supabase SQL 실행
  * Storage 버킷 생성
  * **파일 업로드 — 폰/Mac에 저장된 자산을 IdentityLibrary에서 직접 업로드**
    (인스타 연동 / Meta zip / instaloader 등 외부 통합 일절 사용 안 함)
  * 자산 업로드 후 마음에 드는 것들에 ⭐ 즐겨찾기 표시 (자동화 4번 작동을 위해)
- Phase 2 (시나리오 매칭, 동선 패턴, Style Profile 추출, 시네마틱 모드 API)는 별도 명령 시 진입.

[Phase 2~5 미리보기 — 작업하지 말고 인지만]

Phase 2: 자동화 API (시나리오 매칭, 동선 패턴, Style Profile 추출, hook-learner)
Phase 3: 영상 생성 API (HeyGen, Veo 3.1 First/Last, scene-router, post-process)
Phase 4: UI 보강 (4가지 진입 방식, 멀티 레퍼런스 컴포저, 시네마틱 에디터)
Phase 5: 검증 + V2 폐기
```

---

## 9. Phase 별 작업 (v2.1 전체)

### ✅ Phase 1 (완료)
- Supabase 2개 테이블
- Vercel 환경변수 3개
- 외부 계정 충전
- Modal 후처리 스켈레톤

### 🔄 Phase 1.5 — Identity + Library + Style 인프라 (1.5일)
- 3개 DB 테이블 추가 (assets, style_profile, movement_patterns, video_variants)
- 5개 API (identity, import, tag, search, style-profile 조회)
- 4개 UI (AssetUploader, IdentityLibrary, StyleProfileCard, AssetDetail)
- 인스타 자산 다운로드 + 업로드 (MINE 본인 작업, 병행)

### Phase 2 — 자동화 API (2일)
- `style-profile-update.js` (Claude 분석 + 월 1회 갱신)
- `scenario-parse.js` (한 줄 → 장면 분해 + 자산 매칭)
- `movement-patterns.js` (동선 CRUD)
- `hook-learner.js` (톱 영상 → 후킹 생성)
- `variant-spawn.js` (비슷한 영상 5종)
- `reference-tone.js` (**Reference 영상/사진/텍스트 톤 분석**)

### Phase 3 — 영상 생성 API (2일)
- `scene-router.js` (모드 + 타입 라우팅)
- `heygen-lipsync.js` (다국어 병렬)
- `veo-firstlast.js` (시네마틱 First/Last)
- `generate-end-frame.js` (Nano Banana 끝프레임)
- `scene-extend.js` (자동 연결)
- `translate-script.js` (다국어 자막)
- `post-process.js` (Modal 트리거)
- `regenerate-scene.js` (장면 부분 재생성)

### Phase 4 — UI 보강 (3일)
- `EntryModeSelector.jsx` (4가지 진입)
- `ScenarioInput.jsx` + `RecommendedAssetPicker.jsx`
- `MovementPatternPicker.jsx`
- `ReferenceTonePicker.jsx`
- `MultiReferenceComposer.jsx` (슬롯 7종)
- `SceneModeToggle.jsx`
- `CinematicSceneEditor.jsx` + `FrameGenerator.jsx` + `CameraMovementPicker.jsx`
- `StoryboardEditor.jsx` 보강 (인라인 자막, 모드 토글)
- `SceneCard.jsx` 보강 (모드별 UI)
- `VideoGenerator.jsx` 보강
- `VariantSpawner.jsx`, `SceneRegenerator.jsx`
- `PublishPanel.jsx` 다국어 일괄

### Phase 5 — 검증 + 폐기 (1.5일)
- E2E 테스트 (정적/시네마틱/시나리오/동선/양산/Reference Tone 각 케이스)
- LUT 강도 튜닝
- Style Profile 정확도 검증
- V2 파일 일괄 삭제 + DROP TABLE

**총 예상 기간**: Phase 1.5 ~ Phase 5 = **약 10일**
(MINE 본인 자산 다운로드는 Phase 1.5와 병행)

---

## 10. 월 비용 시뮬레이션 (v2.1)

### 기본 운영 (월 30개 컨텐츠 × 평균 6장면 × 3언어)

```
모델 호출:
  HeyGen Avatar IV (talking_head)   $121
  Veo 3.1 (hook + product)          $96
  Kling 3.0 Pro (motion cinematic)  $20
  Seedance 2 (broll)                $18
  소계                              $255

자동화 추가:
  Vision 태깅 (Claude Haiku)         $5
  Style Profile 분석 (월 1회)        $2
  시나리오 매칭 (Claude Sonnet)      $10
  비슷한 영상 양산 (월 10회 × 5변형)  $80
  Reference 톤 분석 (월 8회)         $20

인프라:
  HeyGen API base                   $50
  Modal.com 후처리                  $50
  ElevenLabs Pro                    $99
  Supabase Pro                      $25
  fal.ai 기본 사용                   $100

실험/안전 마진                      $200
─────────────────────────────────
총합 ≈ $939/월 (예산 $1000+ 내 안전)
```

---

## 11. 리스크 대응 (v2.1)

| 리스크 | 대응 |
|---|---|
| Vision 태깅 정확도 낮음 | 샘플링 → 프롬프트 튜닝 (Phase 1.5-E) |
| Style Profile 추출 부정확 | 월 1회 명시적 업데이트로 사용자 검증 |
| 시나리오 매칭 시 라이브러리에 자산 없음 | 빈 추천 + "업로드 하기" 유도 |
| 시네마틱 모드 끝 프레임 AI 생성 실패 | 라이브러리 직접 선택으로 fallback |
| Veo 3.1 한국 IP 제한 | fal.ai 경유 |
| 비슷한 영상 양산이 너무 비슷 | Style Profile 범위 안에서 의도적 다양화 |
| Reference Tone 분석이 너무 광범위함 | 추출 결과 카드에서 사용자 수정/추가 가능 |
| Supabase Storage 1GB 초과 | Pro $25/월 자동 업그레이드 |
| Modal.com 콜드 스타트 30초 | 비동기 처리, "후처리 중" UX |

---

## 12. v2 → v2.1 변경 요약

| 영역 | v2 | v2.1 |
|---|---|---|
| 장면 모드 | 정적만 | **정적 + 시네마틱 (두 모드)** |
| 진입 방식 | 1가지 (슬롯 채움) | **4가지 (시나리오/동선/Reference Tone/직접)** |
| 자동화 | 후킹 생성만 | **5종 (매칭/동선/양산/Reference Tone/Style)** |
| Style Profile | 없음 | **있음 (월 1회 명시적 업데이트)** |
| 신규 API | 7종 | **15종** |
| 신규 UI | 4종 | **16종** |
| 신규 DB | 1개 | **4개** (assets, style, patterns, variants) |
| 부분 재생성 | 없음 | **장면 단위 재생성** |
| 다국어 자막 수정 | 자동 재번역 | **잠금 옵션 (수동 수정 보호)** |
| 일정 | 7일 | **10일** |
| 월 비용 | $759 | $939 |

### v2.1.1 → v2.1.2 패치 (자동화 4번 재정의)

| 영역 | v2.1.1 | v2.1.2 최종 |
|---|---|---|
| 자동화 4번 이름 | "이전 인기 재해석" | **"Reference 영상 톤 학습"** |
| 트리거 | ⭐ 즐겨찾기 자산 풀에서 선택 | **영상/사진/텍스트 업로드** |
| 적용 방식 | 기존 영상 구조 + 신제품 교체 | **톤 추출 → 새 주제에 적용** |
| Style Profile과 관계 | 거의 동일 (중복) | **상호 보완 (평소 vs 영감)** |
| API | `remix-top.js` | `reference-tone.js` |
| UI | `RemixTopPicker.jsx` | `ReferenceTonePicker.jsx` |
| 신규 DB 테이블 | (없음) | **`creator_reference_tones` 추가** |
| 입력 가능 | ⭐ 자산만 | **영상 1~3개 + 사진 1~10장 + 텍스트** |
| ⭐ 즐겨찾기 | 자동화 4번 트리거 | **라이브러리 정리용으로만 유지** |
| 사용 범위 | 본인 영상만 | **본인 영상 + 외부 영감 + 무드보드 + 텍스트** |

---

## 13. V3 차별점 (시장 분석)

| 도구 | talking_head | 멀티레퍼런스 | 시네마틱 시퀀스 | Style 학습 | 다국어 자동 | 후킹 자동 |
|---|---|---|---|---|---|---|
| HeyGen | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Veo 3.1 | ❌ | ⚠️ | ✅ | ❌ | ❌ | ❌ |
| Kling 3.0 | ❌ | ⚠️ | ✅ | ❌ | ❌ | ❌ |
| Sora 2 | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ (9월 종료) |
| Synthesia | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **MINE V3** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

→ **6개 영역 전부 지원하는 도구는 시장에 없음**. V3가 인플루언서 시장의 종합 솔루션이 됨.

---

## 14. 향후 V3 2차/3차에서 다룰 것

- 트렌드 자동 감지 → 컨텐츠 제안 (오전 9시 알림)
- 샤오홍슈/더우인 자동 발행
- 0.8L 플랫폼 연동 (다른 인플루언서 SaaS화)
- 영상 reference에서 모션 추출 → Kling 자동 적용
- 음성 언어별 분리 학습 (영어 voice ID 별도)
- 자동 A/B 베스트 선택 + 자동 부스팅

---

## Phase 1.5 트러블슈팅 기록 (2026-05-20 완료)

- creator_identity 컬럼 구조: 별도 컬럼 X, data JSONB로 통합
- 시드 시 RLS 막힘 → creator_identity, creator_video_renders DISABLE RLS
- Vercel 4.5MB 제한 → Storage 직접 업로드 전환 (브라우저→Supabase)
  - 신규: src/lib/supabaseClient.js
  - 신규 env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
  - 신규 컬럼: creator_assets.storage_path
- Storage 정책: creator-library anon INSERT/UPDATE 정책 추가
- creator_assets RLS 재활성화 이슈 → DISABLE 재실행으로 최종 해결
- 자동 태깅: Claude Vision이 scene_type(hook_3sec 등)까지 추론 확인

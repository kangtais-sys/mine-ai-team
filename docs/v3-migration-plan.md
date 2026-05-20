# AI 크리에이터 V3 마이그레이션 플랜 (FINAL)

> 작성일: 2026-05-20
> 작성자: Claude (Opus 4.7) — MINE 대표 의사결정 100% 반영
> 대상: 다음 Claude Code 세션 + MINE 본인 검토
> 이전 문서: `docs/handoff-2026-05-20-creator-v2.md`
> 상태: **확정. Phase 1 즉시 착수 가능**

---

## 0. 의사결정 요약 (변경 불가 전제)

| 항목 | 결정 |
|---|---|
| 얼굴 자산 | **MINE 본인 얼굴 기반** (LoRA 가상 페르소나 폐기) |
| 월 예산 | **$1000+** (Veo/Kling Pro 적극 활용) |
| 다국어 우선순위 | **영어 → 중국어 → 일본어** |
| K-뷰티 LUT 톤 | **따뜻한 살구 + 페일** (기본 K-뷰티) |
| 본인 촬영 일정 | **일주일 내** (Phase 1과 병행) |
| 퀄리티 기준 | 저장/공유/좋아요/댓글 유발 / AI 티 안 나는 실사 숏츠 |

---

## 1. V2 → V3 핵심 명제

> **"AI로 사람을 만들지 말고, AI로 사람을 확장하라."**

V2는 가상 페르소나(LoRA)로 영상을 생성. V3는 MINE 본인 사진/영상을 베이스로 두고, AI는 다음만 담당:

- 의상/배경/조명 변형 (FLUX Kontext)
- **다국어 립싱크 (HeyGen Avatar IV) — 영/중/일 순서**
- 시네마틱 B-roll (Veo 3.1, Seedance 2)
- 인물 모션 변형 (Kling 3.0 Pro reference-to-video)
- **K-뷰티 LUT 후처리 (따뜻한 살구 + 페일)**

---

## 2. V2 파일 분류

### ✅ 유지

`lib/supabase.js`, `api/creator/voice-clone.js`, `api/creator/upload-photo.js`, `api/creator/generate.js`, `api/creator/draft.js`, `api/creator/list.js`, `src/components/creator/content/*`, `creator_drafts` 테이블, `creator_persona_voices` 테이블

### 🟡 보강

| 파일 | 보강 내용 |
|---|---|
| `CreatorShell.jsx` | 4탭 유지, 1탭 라벨 "페르소나" → "Identity" |
| `PersonaSection.jsx` | 가상 페르소나 → 본인 얼굴 자산 라이브러리 |
| `PersonaEditor.jsx` | LoRA 섹션 제거 + reference 사진 라이브러리화 |
| `api/creator/persona-imagegen.js` | FLUX 1.1 → **FLUX Kontext** (본인 사진 편집형) |
| `api/creator/scene-video.js` | Kling 2.1 단일 → **scene-router로 위임** |
| `api/creator/generate.js` | 스토리보드 출력에 `scene_type`, `model_preference`, `language_targets` 필드 추가 |
| `VideoGenerator.jsx` | 단일 모델 폴링 → 모델별 폴링 + 다국어 진행률 |
| `PublishPanel.jsx` | 단일 영상 → 영/중/일 일괄 발행 |

### ❌ 폐기

- `api/creator/persona-lora.js` (P1 픽스 작업 무효)
- `creator_persona_lora` 테이블 (drop)
- `compose.js`, `voice.js`, `subtitle.js` (P3 이전 대상)
- `PersonaImageGen.jsx`의 LoRA 호출 로직

### ➕ 신설

| 파일 | 역할 |
|---|---|
| `api/creator/identity.js` | 본인 얼굴 자산 (사진/영상/voice ID) CRUD |
| `api/creator/scene-router.js` | scene_type → 모델 자동 선택 |
| `api/creator/heygen-lipsync.js` | HeyGen Avatar IV + 다국어 립싱크 |
| `api/creator/post-process.js` | LUT/그레인/9:16 (Modal.com 트리거) |
| `api/creator/translate-script.js` | 스토리보드 → 영/중/일 번역 |
| `creator_identity` 테이블 | 본인 얼굴 자산 메타데이터 |
| `creator_video_renders` 테이블 | 장면 × 언어 × 모델 렌더링 추적 |
| `src/components/creator/identity/IdentityLibrary.jsx` | 본인 사진/영상 라이브러리 UI |
| `src/components/creator/video/ModelRoutingDebug.jsx` | 장면별 모델 배정 디버그 뷰 |
| `modal/postprocess_shorts.py` | Modal.com FFmpeg 후처리 함수 |

---

## 3. 모델 라우팅 테이블

| scene_type | 모델 | 비용 | 사유 |
|---|---|---|---|
| `talking_head` | **HeyGen Avatar IV** | $4/min (1080p) | 사진 1장으로 영/중/일 립싱크 동시 |
| `product_closeup` | **Veo 3.1 Standard** | $0.40/sec | 시네마틱 4K, 제품 광택/질감 최고 |
| `hook_3sec` | **Veo 3.1** | $0.40/sec | 3초 후킹에 예산 집중 |
| `motion_action` | **Kling 3.0 Pro** | $0.20/sec | reference-to-video 모션 정확도 |
| `lifestyle_broll` | **Seedance 2** | $0.30/clip | 가성비 + 멀티샷 일관성 |
| `transition` | **Seedance 2 Fast** | $0.15/clip | 짧은 컷 가성비 |
| `text_overlay_only` | — | $0 | 후처리만 |

### 예산 시뮬레이션 (월 30개 숏츠 × 6장면 × 3개 언어 = 540 렌더)

```
talking_head:      60장면 × 10s × $0.067/s × 3언어 = $121
product_closeup:   30장면 × 5s  × $0.40/s         = $60  (영상은 1회, 자막만 다국어)
hook_3sec:         30장면 × 3s  × $0.40/s         = $36
motion_action:     20장면 × 5s  × $0.20/s         = $20
lifestyle_broll:   60장면      × $0.30/clip       = $18
transition:        30장면      × $0.15/clip       = $5
─────────────────────────────────────────────────
모델 호출 합계 ≈ $260/월
HeyGen API base   ≈ $50
Modal.com 후처리  ≈ $50
ElevenLabs Pro    ≈ $99
실험/안전 마진    ≈ $300
─────────────────────────────────────────────────
총합 ≈ $759/월 (예산 $1000+ 내 안전)
```

**다국어는 talking_head만 3배수**. B-roll/제품컷은 영상 1회 생성 + 자막만 언어별 → 비용 폭증 방지.

---

## 4. 후처리 파이프라인 (Modal.com 채택)

```
1. 모델 출력 영상 수신 (URL)
2. 9:16 크롭 (Veo 16:9 → 인물 중심 크롭)
3. K-뷰티 LUT 적용: 따뜻한 살구 + 페일
   - 톤매핑: Highlight +8, Shadow -5
   - 컬러: R +12, G +5, B -3 (살구 톤)
   - Saturation -10 (페일 효과)
   - Curves: Toe lift +0.05 (페일 느낌)
4. 필름 그레인 추가 (intensity 10)
5. 약한 모션 블러 (실제 카메라 흉내)
6. BGM 믹스 (PublishPanel 선택 트랙)
7. 자막 burn-in (영/중/일 각각)
8. Supabase Storage 저장 → final_video_url
```

---

## 5. 다국어 파이프라인 (영 → 중 → 일)

```
스토리보드 (한국어)
  ↓
translate-script.js (Claude)
  ├→ 영어 자막
  ├→ 중국어 자막 (간체)
  └→ 일본어 자막
  ↓
voice-clone.js (ElevenLabs v3 다국어)
  ├→ 영어 음성 (MINE voice ID + EN)
  ├→ 중국어 음성 (MINE voice ID + ZH)
  └→ 일본어 음성 (MINE voice ID + JA)
  ↓
heygen-lipsync.js (Avatar IV)
  └→ MINE 사진 + 각 언어 음성 = 3개 talking_head 영상
  ↓
post-process.js (Modal)
  └→ K-뷰티 LUT + 자막 burn-in × 3
  ↓
PublishPanel
  ├→ 영어 → TikTok Global, Instagram Global
  ├→ 중국어 → 샤오홍슈, 더우인 (수동 다운로드)
  └→ 일본어 → Instagram JP, TikTok JP
```

### ElevenLabs 다국어 주의

- V3 1차: 한국어 voice ID 하나로 영/중/일 다국어 생성 (억양 자연도 80~85%)
- V3 2차: 시장 반응 보고 언어별 보이스 분리 (영어 클로닝 별도 학습)

---

## 6. DB 스키마 변경

### 신규 (실행 SQL은 7번 섹션)

```sql
-- 본인 얼굴 자산
CREATE TABLE creator_identity (
  id TEXT PRIMARY KEY DEFAULT 'mine-primary',
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 장면별 렌더링 추적
CREATE TABLE creator_video_renders (
  id BIGSERIAL PRIMARY KEY,
  draft_id TEXT,
  scene_index INT NOT NULL,
  scene_type TEXT NOT NULL,
  model_used TEXT NOT NULL,
  language TEXT NOT NULL,
  status TEXT NOT NULL,
  raw_video_url TEXT,
  final_video_url TEXT,
  cost_usd NUMERIC(10,4),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
```

### 폐기

```sql
DROP TABLE IF EXISTS creator_persona_lora;
```

---

## 7. Phase 1 실행 패키지 (즉시 착수)

### 7-1. Supabase SQL (한 번에 실행)

```sql
-- ===== V3 마이그레이션 Phase 1 =====
-- 실행 위치: Supabase Dashboard → SQL Editor
-- 프로젝트: mine-ai-team (tvowqyqtcgvjvhwzrait)

-- 1. 신규 테이블 생성
CREATE TABLE IF NOT EXISTS creator_identity (
  id TEXT PRIMARY KEY DEFAULT 'mine-primary',
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS creator_video_renders (
  id BIGSERIAL PRIMARY KEY,
  draft_id TEXT,
  scene_index INT NOT NULL,
  scene_type TEXT NOT NULL,
  model_used TEXT NOT NULL,
  language TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  raw_video_url TEXT,
  final_video_url TEXT,
  cost_usd NUMERIC(10,4) DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_renders_draft ON creator_video_renders(draft_id);
CREATE INDEX IF NOT EXISTS idx_renders_status ON creator_video_renders(status);

-- 2. RLS 비활성화 (V2와 동일 정책)
ALTER TABLE creator_identity DISABLE ROW LEVEL SECURITY;
ALTER TABLE creator_video_renders DISABLE ROW LEVEL SECURITY;

-- 3. 초기 데이터 (Phase 2에서 본인 사진 업로드 후 채워질 자리)
INSERT INTO creator_identity (id, data) VALUES (
  'mine-primary',
  jsonb_build_object(
    'photos', '[]'::jsonb,
    'videos', '[]'::jsonb,
    'voice_ids', jsonb_build_object('ko', null, 'en', null, 'zh', null, 'ja', null),
    'heygen_photo_id', null,
    'default_outfit', null,
    'default_background', null,
    'lut_preset', 'k-beauty-warm-apricot-pale'
  )
) ON CONFLICT (id) DO NOTHING;

-- 4. V2 LoRA 테이블 폐기 (마지막에)
-- ⚠️ 주의: 데이터 확인 후 실행. 기존 LoRA 학습 결과는 V3에서 사용 안 함.
-- DROP TABLE IF EXISTS creator_persona_lora;
-- 위 줄은 Phase 5에서 실행. Phase 1에서는 주석 처리 유지.
```

### 7-2. Vercel 환경변수 추가 (터미널에서만)

⚠️ **절대 채팅창에 키 값을 붙여넣지 마라. 터미널에서만.**

```bash
# 1. HeyGen API 키 (https://app.heygen.com/settings → API)
echo "YOUR_HEYGEN_KEY" | npx vercel env add HEYGEN_API_KEY production --force

# 2. Modal.com API 토큰 (https://modal.com/settings/tokens)
echo "YOUR_MODAL_TOKEN_ID" | npx vercel env add MODAL_TOKEN_ID production --force
echo "YOUR_MODAL_TOKEN_SECRET" | npx vercel env add MODAL_TOKEN_SECRET production --force

# 3. fal.ai는 이미 설정됨 (FAL_API_KEY) — Veo 3.1, Kling 3.0 Pro, Seedance 2 모두 fal.ai 경유

# 4. 재배포
npx vercel --prod
```

### 7-3. 외부 계정 준비 체크리스트

- [ ] **HeyGen Pay-as-you-go $100 충전** (https://app.heygen.com/settings/billing)
  - Avatar IV 1080p 기준 25분 사용 가능
- [ ] **Modal.com 가입 + GPU 크레딧 $30 충전** (https://modal.com)
- [ ] **fal.ai 잔액 확인** (Veo 3.1, Kling 3.0 Pro, Seedance 2 사용 가능 여부)
  - https://fal.ai/dashboard/billing
  - 최소 $100 권장 (테스트 + 첫 주 운영)

### 7-4. 본인 촬영 가이드 (일주일 내)

**사진 30장 구성** — Supabase Storage `creator-identity/photos/` 업로드
- 정면 클로즈업 5장 (자연광, 다양한 표정: 무표정/미소/놀람/집중/웃음)
- 측면 좌/우 각 5장 (반측면 포함)
- 전신 5장 (다양한 포즈)
- 무지 배경 5장 (HeyGen Avatar IV 베이스용 — 가장 중요)
- 메이크업 룩 변형 5장 (글로우/매트/페일)

**영상 3개 구성** — Kling 3.0 Pro reference용
1. 30초 정면 자연스러운 토킹 영상 (입 움직임, 표정 변화)
2. 30초 측면+이동 영상 (걷기, 손동작)
3. 30초 클로즈업 (눈 깜빡임, 미세 표정)

**촬영 환경**
- 자연광 또는 부드러운 디퓨저 조명
- 단색 배경 (베이지/그레이/화이트)
- 1080p 이상, 가로 16:9 + 세로 9:16 둘 다
- 메이크업: K-뷰티 살구 톤 (LUT와 어울리도록)

### 7-5. Phase 1 완료 조건

- [ ] Supabase 신규 테이블 2개 생성 확인
- [ ] `creator_identity` 테이블에 `mine-primary` 행 1개 존재
- [ ] Vercel 환경변수 3개 추가 (HEYGEN_API_KEY, MODAL_TOKEN_ID, MODAL_TOKEN_SECRET)
- [ ] HeyGen 계정 $100 + Modal $30 + fal.ai $100 충전 완료
- [ ] 본인 사진 30장 + 영상 3개 Supabase Storage 업로드 (촬영 후)

---

## 8. Phase 2~5 요약

### Phase 2: API 신설 (1주, Phase 1 완료 후)

- [ ] `api/creator/identity.js` — GET/POST/PATCH
- [ ] `api/creator/scene-router.js` — scene_type → 모델 매핑
- [ ] `api/creator/heygen-lipsync.js` — Avatar IV 호출 + 폴링 (3언어 병렬)
- [ ] `api/creator/translate-script.js` — Claude 영/중/일 번역
- [ ] `api/creator/post-process.js` — Modal.com 트리거
- [ ] `modal/postprocess_shorts.py` — K-뷰티 LUT (살구+페일) FFmpeg
- [ ] `api/creator/scene-video.js` 리팩토링 (scene-router 위임)

### Phase 3: UI 보강 (1주)

- [ ] `IdentityLibrary.jsx` 신설
- [ ] `PersonaSection.jsx` Identity 탭 통합
- [ ] `VideoGenerator.jsx` 모델별 + 언어별 진행률 표시
- [ ] `PublishPanel.jsx` 영/중/일 일괄 발행
- [ ] `ContentSetup.jsx` scene_type 라벨 표시
- [ ] `generate.js` 프롬프트 강화 (3초 후킹 + scene_type 자동 라벨링)

### Phase 4: 검증 (3일)

- [ ] **테스트 1**: 한국어 단일 숏츠 (talking_head 1 + product 1 + broll 2)
- [ ] **테스트 2**: 영어 추가 다국어
- [ ] **테스트 3**: 영/중/일 풀스택 + 모든 모델 라우팅
- [ ] LUT 강도 튜닝 (살구+페일 비율)
- [ ] 자막 폰트/위치 결정 (각 언어별)
- [ ] 비용 추적 정확성

### Phase 5: 폐기 (반나절)

- [ ] `persona-lora.js` 삭제
- [ ] `DROP TABLE creator_persona_lora` 실행
- [ ] `compose.js`, `voice.js`, `subtitle.js` 삭제
- [ ] 사용 안 하는 환경변수 정리

---

## 9. 리스크 대응

| 리스크 | 대응 |
|---|---|
| HeyGen Avatar IV가 본인 얼굴 디테일 못 살림 | Phase 4에서 30초 샘플 검증 → 안 되면 Hedra 대체 |
| Veo 3.1 한국 IP 제한 | fal.ai 경유 (이미 계정 있음) |
| ElevenLabs 다국어 억양 어색 | 1차는 단일 보이스, 2차에서 언어별 분리 |
| Modal.com 콜드 스타트 ~30초 | 후처리 비동기, UX는 "후처리 중" 표시 |
| 본인 사진 자산 부족 | 일주일 내 촬영 (확정) |
| 중국어 시장 플랫폼 (샤오홍슈/더우인) API 부재 | 영상 다운로드 → 수동 업로드 (V3 1차 범위) |

---

## 10. V2 P0~P3 작업의 처리

| V2 작업 | V3 처리 |
|---|---|
| P0 전체 플로우 미검증 | Phase 4에서 해결 |
| P0 이미지 생성 속도 | HeyGen 대체로 무효화 |
| P1 LoRA 훈련 미검증 | **즉시 중단**, V3 폐기 |
| P1 LoRA 완료 UI | **즉시 중단**, 폐기 |
| P1 헤어/의상 reference 연동 | Identity 라이브러리로 흡수 |
| P2 채널/대시보드 Redis | V3 범위 밖, 별도 작업 |
| P2 발행 탭 n8n 연동 | Phase 3 PublishPanel 보강 시 함께 |
| P3 compose.js 정리 | Phase 5 폐기 |

---

## 11. 다음 Claude Code 세션 진입 지시

아래 지시문을 클로드코드에 그대로 붙여넣기:

```
mine-ai-team 프로젝트 V3 마이그레이션 작업을 시작한다.

[필수 인계 문서]
/Users/yuminhye/mine-ai-team/docs/v3-migration-plan.md (그대로 읽어라)

[원칙]
- 절대 기존 V2 파일을 한 번에 갈아엎지 마라. Phase 단위 진행.
- 신규 파일은 V3 명세를 100% 그대로 따른다.
- 기존 파일 보강 시 원본을 read로 그대로 읽고 명시된 부분만 str_replace로 수정.
- API 키/토큰은 채팅창에서 절대 다루지 않는다. 터미널에서만.
- 작업 전 반드시 git status 확인하고 main 브랜치인지 체크.

[Phase 1 즉시 실행 작업]
1. v3-migration-plan.md 섹션 7-1의 Supabase SQL을 그대로 출력해라.
   사용자가 Supabase Dashboard에 직접 붙여넣을 것이다.
2. 섹션 7-2의 Vercel 환경변수 추가 명령어를 터미널에서 실행할 수 있도록 정리해라.
3. 본인 촬영 가이드(섹션 7-4)를 별도 파일로 분리:
   /Users/yuminhye/mine-ai-team/docs/identity-shoot-guide.md
4. Modal.com 후처리 함수 스켈레톤 작성:
   /Users/yuminhye/mine-ai-team/modal/postprocess_shorts.py
   (실제 FFmpeg 명령은 K-뷰티 살구+페일 LUT 적용 그대로)

[작업 완료 후]
체크리스트 형태로 보고하고 대기. Phase 2는 사용자가 "Phase 2 시작" 명령 시 진입.
```

---

## 12. 향후 결정 보류 사항 (V3 2차에서 다룸)

- 언어별 보이스 분리 학습 (1차 데이터 보고 결정)
- 샤오홍슈/더우인 자동 발행 (현재 API 부재)
- A/B 테스트 자동화 (3초 후킹 변형 자동 생성)
- 0.8L 플랫폼 연동 (다른 인플루언서들도 같은 파이프라인 사용 가능하게)

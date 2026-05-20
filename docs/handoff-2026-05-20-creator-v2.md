# AI 크리에이터 V2 인계 문서

> 작성일: 2026-05-20  
> 대상: 다음 개발자/Claude 세션  
> 프로젝트: mine-ai-team (https://mine-ai-team.vercel.app)  
> GitHub: kangtais-sys/mine-ai-team

---

## 1. 프로젝트 개요

**MILLI AI** — 유민혜(MINE) 대표가 사용하는 AI 팀 내부 운영 도구.  
밀리밀리(뷰티 브랜드) + 0.8L(인플루언서 마케팅) 운영을 위한 9개 AI 에이전트 대시보드.

### 핵심 인프라
- **배포**: Vercel (Pro) → https://mine-ai-team.vercel.app
- **GitHub**: kangtais-sys/mine-ai-team (`main` 브랜치 → 자동 배포)
- **DB**: Supabase (`mine-ai-team` 프로젝트, `08liter-global` 조직)
  - URL: `https://tvowqyqtcgvjvhwzrait.supabase.co`
  - Region: ap-northeast-1 (Tokyo)
- **AI**: fal.ai (FLUX 이미지, Kling 영상, LoRA 훈련)
- **TTS**: ElevenLabs (목소리 클로닝)
- **자동응대**: Zernio (Instagram 댓글/DM, Meta 직접 연동 없음)
- **캐시/임시데이터**: Upstash Redis (⚠️ 무료 50만 건 초과 → creator 기능은 Supabase로 마이그레이션 완료, 채널/대시보드 등 구형 기능은 아직 Redis 사용 중)

---

## 2. AI 크리에이터 V2 — 설계 목표

### 전체 플로우
```
페르소나 설정 → 이미지 생성(FLUX) → 콘텐츠 스토리보드(Claude) → 영상(Kling) → 발행
```

### 탭 구조 (CreatorShell.jsx)
| 탭 | 컴포넌트 | 역할 |
|---|---|---|
| 페르소나 | PersonaSection.jsx | 페르소나 목록(최대 3개), 프로필/이미지/목소리 서브탭 |
| 콘텐츠 | ContentSetup.jsx | 주제 입력 → Claude 스토리보드 생성 |
| 영상생성 | VideoGenerator.jsx | 장면별 Kling 영상 생성 (폴링) |
| 발행 | PublishPanel.jsx | 캡션/해시태그/플랫폼 설정 → n8n 발행 |

---

## 3. 현재 구현 상태

### ✅ 완료된 것

#### 백엔드 API (api/creator/)
| 파일 | 기능 | DB |
|---|---|---|
| `personas.js` | 페르소나 목록 CRUD (최대 3개) | Supabase |
| `persona.js` | 페르소나 상세 데이터 저장/로드 | Supabase |
| `persona-images.js` | 각도별 이미지 갤러리 | Supabase |
| `persona-imagegen.js` | FLUX 1.1 Pro Ultra 이미지 생성 | fal.ai |
| `persona-lora.js` | FLUX Portrait LoRA 훈련 시작/상태 | Supabase + fal.ai |
| `voice-clone.js` | ElevenLabs 목소리 클로닝 | Supabase |
| `generate.js` | Claude 스토리보드/콘텐츠 생성 | Supabase |
| `draft.js` | 드래프트 조회/수정/삭제 | Supabase |
| `list.js` | 드래프트 목록 | Supabase |
| `scene-video.js` | Kling 2.1 Pro 영상 생성/폴링 | fal.ai |
| `upload-photo.js` | 사진 → fal.ai CDN 업로드 → URL 반환 | fal.ai |
| `publish.js` | n8n 파이프라인 발행 트리거 | - |

#### Supabase 테이블 (RLS 비활성화)
```sql
creator_personas          -- 페르소나 데이터 (id TEXT PK, data JSONB)
creator_persona_images    -- 이미지 갤러리 (persona_id, url, angle, is_primary)
creator_persona_lora      -- LoRA 훈련 상태 (persona_id PK, data JSONB)
creator_persona_voices    -- 목소리 데이터 (persona_id PK, data JSONB)
creator_drafts            -- 콘텐츠 드래프트 (id TEXT PK, persona_id, data JSONB)
```

#### 프론트엔드
- `CreatorShell.jsx` — 4탭 셸, 페르소나→드래프트→영상→발행 상태 전달
- `PersonaSection.jsx` — 좌측 목록 + 우측 서브탭
- `PersonaEditor.jsx` — 텍스트 프로필 + 얼굴/헤어/의상 사진 업로드 (3개 섹션 분리)
- `PersonaImageGen.jsx` — 각도 선택 → FLUX 이미지 생성 → 갤러리
- `VoiceSetup.jsx` — 오디오 업로드 → ElevenLabs 클로닝
- `ContentSetup.jsx` — 스토리보드 포맷 콘텐츠 생성
- `StoryboardEditor.jsx` + `SceneCard.jsx` — 장면별 편집
- `VideoGenerator.jsx` — 장면별 Kling 영상 생성 + 폴링
- `PublishPanel.jsx` — 발행 설정 + BGM 생성

---

## 4. ❌ 미완성 / 검증 안 된 것 (우선순위 순)

### [P0] 전체 플로우 미검증
**현상**: 페르소나 설정 → 이미지 생성 → 스토리보드 → 영상 → 발행까지 end-to-end 한 번도 완주하지 못했음.  
**이유**: 각 단계에서 오류가 생겨 수정하느라 전체 흐름 테스트 미완.  
**할 일**: 페르소나 하나 만들고 처음부터 끝까지 직접 실행해보며 막히는 곳 픽스.

### [P0] 이미지 생성 속도 문제
**현상**: FLUX 이미지 생성 10-20초, Kling 영상 생성 장면당 3-5분.  
**현실**: fal.ai cold start + 모델 자체 생성 시간. 단축 방법 없음.  
**대안**:
- 이미지: fal.ai 대신 Replicate의 SDXL-Lightning (1-2초) 테스트 고려
- 영상: Kling 5초 클립 고정 (10초 클립보다 2배 빠름)
- UX: 생성 중 예상 시간 명확하게 표시 ("Kling 영상은 약 3-5분 소요")

### [P1] LoRA 훈련 실제 동작 미검증
**현상**: "얼굴 AI 학습 시작" 버튼 클릭 시 오류 발생 (기존 세션에서 Request Entity Too Large).  
**수정 완료**: 이미지를 512px/70% quality로 압축 후 개별 업로드하도록 변경 (commit: `1e353ca`).  
**미검증**: 실제로 fal.ai `flux-lora-portrait-trainer`가 이 base64 방식을 받는지 확인 필요.  
**fal.ai LoRA API 스펙**: `images_data_url`은 ZIP 파일 URL을 기대함. 개별 base64는 안 될 수 있음.

```js
// persona-lora.js POST 부분
body: JSON.stringify({
  images_data_url: imageUrls[0],  // ← 이게 문제. ZIP URL이어야 함
  trigger_word: triggerWord,
  ...
})
```

**정상 동작하려면**: 이미지들을 ZIP으로 묶어 fal.ai storage에 업로드 → ZIP URL 전달 필요.  
참고: https://fal.ai/models/fal-ai/flux-lora-portrait-trainer

### [P1] LoRA 학습 완료 후 UI 표시 없음
**현상**: 학습 완료돼도 사용자가 확인할 방법 없음. 완료 알림, 뱃지 등 미구현.  
**할 일**: PersonaEditor에 완료 시 초록 뱃지 + "이미지 탭에서 바로 사용 가능" 안내 추가.

### [P1] 헤어/의상 참고 사진 → 이미지 생성 연동 안 됨
**현상**: 헤어/의상 참고 사진 업로드해서 저장은 되는데, 이미지 생성 시 실제로 반영 안 됨.  
**저장 위치**: `persona.data.hairRefUrls[]`, `persona.data.outfitRefUrls[]`  
**할 일**: `persona-imagegen.js`에서 이 URL들을 FLUX `image_prompt_url` (style reference)로 전달.

```js
// persona-imagegen.js에 추가 필요
if (persona.hairRefUrls?.[0]) {
  body.reference_image_url = persona.hairRefUrls[0]; // FLUX style reference
}
```

### [P2] 채널/대시보드 기능 — Redis 여전히 사용
**현상**: Upstash Redis 50만 건 초과로 채널 자동응대, 대시보드 위젯 등이 간헐적으로 오류.  
**범위**: `api/channel/`, `api/cron/`, `api/dashboard/` 등 구형 기능들.  
**할 일**: 이 파일들도 Supabase로 마이그레이션하거나, Upstash 플랜 업그레이드.

### [P2] 발행 탭 — n8n 연동 미완
**현상**: 발행 버튼 누르면 `N8N_PUBLISH_WEBHOOK` 환경변수가 없어서 그냥 success 반환.  
**할 일**: n8n 웹훅 URL 설정 + 실제 YouTube/TikTok 업로드 테스트.

### [P3] compose.js, voice.js, subtitle.js — Redis 사용 중
오래된 영상 합성 파이프라인(Higgsfield 기반). 현재 CreatorShell V2와 연동 안 됨. 정리 필요.

---

## 5. 환경변수 (Vercel Production)

| 키 | 용도 | 상태 |
|---|---|---|
| `FAL_API_KEY` | FLUX 이미지, Kling 영상, LoRA 훈련, 사진 업로드 | ✅ 설정됨 |
| `ANTHROPIC_API_KEY` | Claude 스토리보드 생성 | ✅ 설정됨 |
| `ELEVENLABS_API_KEY` | 목소리 클로닝 | ✅ 설정됨 |
| `SUPABASE_URL` | Supabase 접속 | ✅ 설정됨 |
| `SUPABASE_ANON_KEY` | Supabase 접속 | ✅ 설정됨 |
| `GOOGLE_API_KEY` | Gemini 트렌드 검색 (generate.js) | ✅ 설정됨 |
| `ZERNIO_API_KEY` | Instagram 자동응대 | ✅ 설정됨 |
| `KV_REST_API_URL` | Upstash Redis (구형 기능) | ✅ 설정됨 |
| `KV_REST_API_TOKEN` | Upstash Redis (구형 기능) | ✅ 설정됨 |
| `UDIO_API_KEY` | BGM 생성 (선택) | ❌ 미설정 (없어도 동작) |
| `N8N_PUBLISH_WEBHOOK` | 발행 파이프라인 | ❌ 미설정 |

---

## 6. 핵심 파일 경로

```
mine-ai-team/
├── api/creator/
│   ├── personas.js         ← 페르소나 목록 CRUD
│   ├── persona.js          ← 페르소나 상세 저장/로드
│   ├── persona-imagegen.js ← FLUX 이미지 생성
│   ├── persona-images.js   ← 이미지 갤러리 저장
│   ├── persona-lora.js     ← LoRA 훈련 (⚠️ ZIP URL 필요)
│   ├── voice-clone.js      ← ElevenLabs 클로닝
│   ├── generate.js         ← Claude 스토리보드 생성
│   ├── scene-video.js      ← Kling 영상 생성/폴링
│   ├── upload-photo.js     ← 사진 → fal.ai CDN
│   └── publish.js          ← 발행 트리거
├── lib/
│   └── supabase.js         ← Supabase 클라이언트 헬퍼
├── src/components/creator/
│   ├── CreatorShell.jsx    ← 4탭 메인 셸
│   ├── persona/
│   │   ├── PersonaSection.jsx   ← 목록 + 서브탭
│   │   ├── PersonaEditor.jsx    ← 프로필 편집 + 사진 업로드
│   │   ├── PersonaImageGen.jsx  ← 이미지 생성 + 갤러리
│   │   └── VoiceSetup.jsx       ← 목소리 클로닝
│   ├── content/
│   │   ├── ContentSetup.jsx     ← 콘텐츠 생성 설정
│   │   ├── StoryboardEditor.jsx ← 스토리보드 편집
│   │   └── SceneCard.jsx        ← 개별 장면 카드
│   ├── video/
│   │   └── VideoGenerator.jsx   ← Kling 영상 생성
│   └── finish/
│       └── PublishPanel.jsx     ← 발행 패널
└── docs/
    └── handoff-2026-05-20-creator-v2.md ← 이 파일
```

---

## 7. 당장 해야 할 것 (다음 세션 진입 시)

### Step 1 — 전체 플로우 검증
1. 페르소나 새로 만들기
2. 텍스트 채우고 저장 → 오류 없는지 확인
3. 이미지 탭 → 정면 이미지 생성 → 성공하면 영상 생성에 쓰임
4. 콘텐츠 탭 → 스토리보드 생성
5. 영상생성 탭 → 장면 1개만 생성해보기
6. 막히는 곳 마다 브라우저 console 오류 캡처

### Step 2 — LoRA 훈련 수정
`api/creator/persona-lora.js`의 POST 핸들러에서 `imageUrls[]`를 ZIP으로 묶어 fal.ai storage에 업로드 후 ZIP URL 전달하도록 수정.

```js
// 수정 필요 부분 (persona-lora.js:POST)
// 현재: images_data_url: imageUrls[0]  ← 잘못됨
// 수정: ZIP 파일 생성 후 upload → URL 전달
```

fal.ai storage 업로드: `POST https://upload.fal.ai/files` (Authorization: Key {FAL_API_KEY})

### Step 3 — 헤어/의상 참고 이미지 연동
`persona-imagegen.js`에서 persona 데이터 불러와서 `hairRefUrls[0]`를 FLUX reference image로 추가.

### Step 4 — 속도 UX 개선
- 이미지 생성 시작 시 "약 10-20초 소요" 메시지 표시 (이미 있음, 확인만)
- Kling 영상 생성 시 "장면당 약 3-5분" 명확하게 표시

---

## 8. 알려진 제약사항 (변경 불가)

- **Instagram 직접 API 없음** — 모든 자동응대는 Zernio 경유 (CLAUDE.md 규칙)
- **Upstash Redis 50만 건/월** — 구형 기능들이 소진 중. creator 기능은 Supabase로 이전 완료
- **Vercel 요청 바디 4.5MB 제한** — 이미지 base64 직접 전송 불가. 항상 개별 업로드 후 URL 사용
- **Kling 영상 생성 시간** — 모델 특성상 5초 클립 기준 3-5분 소요. 단축 불가
- **fal.ai 무료 플랜 없음** — 크레딧 소진 시 즉시 중단됨. 잔액 확인: https://fal.ai/dashboard/billing

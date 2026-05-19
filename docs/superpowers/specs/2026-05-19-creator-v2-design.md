# AI 크리에이터 V2 — 설계 문서

**작성일**: 2026-05-19  
**프로젝트**: mine-ai-team (https://mine-ai-team.vercel.app)  
**작성자**: Claude (브레인스토밍 결과 문서화)

---

## 1. 개요

기존 `CreatorView.jsx` (1833줄 단일 파일) 를 완전 재설계.  
페르소나 설정 → 초현실 이미지 생성 → 스토리보드 편집 → 장면별 영상 생성 → 음성·자막·BGM 합성 → 발행까지 하나의 일관된 파이프라인으로 구성.

### 핵심 목표
- 페르소나 3명 독립 저장 (각자 얼굴·목소리·스타일 보유)
- 모공 수준 초현실 이미지 생성 (FLUX Portrait Trainer + FLUX 1.1 Pro Ultra)
- 카메라 각도·모델 동작·조명까지 디테일한 장면 프롬프트로 Kling AI 영상 생성
- 목소리 클로닝 (ElevenLabs IVC, 한국어 샘플 1분)
- 한국어 / 영어 선택 지원
- 장면 단위 재생성으로 영상 수정

---

## 2. 기술 스택

| 단계 | 서비스 | 비고 |
|------|--------|------|
| 페르소나 이미지 훈련 | fal.ai FLUX Portrait Trainer | 페르소나당 1회 LoRA 훈련 |
| 초현실 이미지 생성 | fal.ai FLUX 1.1 Pro Ultra | $0.06/장, 모공 수준 실사 |
| 장면 영상 생성 | fal.ai Kling 3.0 Pro (image-to-video) | $0.168–0.196/초, 최대 15초/클립 |
| 목소리 클로닝 | ElevenLabs IVC | 1분 한국어 샘플 필요 |
| TTS | ElevenLabs v2 Multilingual | 클로닝된 보이스 ID 사용 |
| 자막 타이밍 | Anthropic Claude Haiku | 기존 유지 |
| 스크립트·트렌드 | Gemini 2.0 Flash + Claude Sonnet | 기존 유지 |
| BGM | Udio API | pay-per-use, SNS 라이선스 포함 |
| 영상 합성 | FFmpeg (fluent-ffmpeg) | 기존 유지 |
| 이미지 저장 | @vercel/blob | 기존 유지 |
| 페르소나 데이터 | Upstash Redis | per-ID key 구조로 수정 |
| 발행 | n8n + Zernio | 기존 유지 |

### 영상 1개당 예상 비용

| 항목 | 비용 |
|------|------|
| 각도별 이미지 5장 (FLUX Ultra) | $0.30 |
| Kling 클립 5개 × 10초 | $8.50 |
| ElevenLabs TTS | $0.05 |
| Udio BGM 1트랙 | $0.05 |
| **합계** | **약 $9/영상** |

페르소나 LoRA 훈련: 페르소나당 최초 1회 별도 비용 (fal.ai 요금 기준)

---

## 3. 컴포넌트 구조

### 프론트엔드

```
src/components/creator/
├── CreatorShell.jsx              ← 전체 껍데기, 단계 네비게이션
├── persona/
│   ├── PersonaList.jsx           ← 페르소나 3명 카드 목록 + 선택/삭제
│   ├── PersonaEditor.jsx         ← 페르소나 생성/편집 폼 (텍스트 정보)
│   ├── PersonaImageGen.jsx       ← 얼굴 사진 업로드 → LoRA 훈련 → 각도별 이미지 생성
│   └── VoiceSetup.jsx            ← 음성 샘플 업로드 → ElevenLabs IVC 클로닝
├── content/
│   ├── ContentSetup.jsx          ← 페르소나 선택 + 보조 이미지 업로드 + 언어/주제
│   ├── StoryboardEditor.jsx      ← 카드형 스토리보드 (장면 목록, 추가/삭제/재정렬)
│   └── SceneCard.jsx             ← 개별 장면 카드 (타임코드, 비주얼 프롬프트, 대사, 참고 이미지)
├── video/
│   ├── VideoGenerator.jsx        ← 전체 장면 영상 생성 진행 표시
│   └── SceneRegenerator.jsx      ← 특정 장면 재생성 (편집 프롬프트 + 이미지 업로드)
└── finish/
    ├── VoiceSubtitleBGM.jsx      ← TTS + 자막 + BGM 합성 및 미리보기
    └── PublishPanel.jsx           ← 저장 / 즉시 발행 / 예약 발행
```

### 백엔드 API

```
api/creator/
├── persona.js              ← 수정: 다중 페르소나 지원 (per-ID key)
├── persona-images.js       ← 수정: per-ID 이미지 저장
├── persona-lora.js         ← NEW: FLUX Portrait Trainer LoRA 훈련 요청
├── persona-imagegen.js     ← NEW: FLUX 1.1 Ultra 각도별 이미지 생성
├── voice-clone.js          ← NEW: ElevenLabs IVC 샘플 업로드 → voice_id 반환
├── generate.js             ← 수정: 스토리보드 카드 형식 출력, 한/영 지원
├── scene-video.js          ← NEW: Kling 3.0 Pro image-to-video (장면별)
├── bgm.js                  ← NEW: Udio API BGM 생성
├── compose.js              ← 유지: FFmpeg 합성 (클립 이어붙이기 + 자막 + BGM)
├── voice.js                ← 수정: 클로닝 voice_id 사용
├── subtitle.js             ← 유지
└── publish.js              ← 유지
```

---

## 4. 데이터 구조

### Redis 키 구조 (다중 페르소나)

```
creator:persona:{personaId}              ← 페르소나 텍스트 정보
creator:persona:{personaId}:images       ← 각도별 생성 이미지 목록
creator:persona:{personaId}:lora         ← FLUX LoRA ID (훈련 완료 후)
creator:persona:{personaId}:voice        ← ElevenLabs voice_id
creator:personas:index                   ← 페르소나 ID 목록 (최대 3개)
```

### 페르소나 데이터 스키마

```json
{
  "id": "uuid",
  "name": "밀리 (Milli)",
  "gender": "여성",
  "age": "29세",
  "characteristics": "화장품 연구원, 팩트 기반 커뮤니케이션...",
  "personality": ["호기심 왕성", "팩트충", "따뜻한 언니"],
  "catchphrases": ["이거 진짜 아무도 안 알려줘요", "500달톤이 뭔지 아세요?"],
  "loraId": "fal-lora-xxxx",
  "voiceId": "elevenlabs-voice-xxxx",
  "defaultLanguage": "ko",
  "createdAt": "2026-05-19T00:00:00Z"
}
```

### 스토리보드 카드 스키마

```json
{
  "sceneId": "uuid",
  "order": 1,
  "startSec": 0,
  "endSec": 5,
  "visualPrompt": "연구실 배경, 카메라를 향해 천천히 걷는 중, 왼쪽에서 따뜻한 조명, 3/4 앵글, 흰 가운 착용",
  "dialogue": "이거 진짜 아무도 안 알려줘요",
  "referenceImageUrl": null,
  "videoUrl": null,
  "status": "pending"
}
```

---

## 5. 단계별 UX 플로우

### Step 1 — 페르소나 설정

1. 페르소나 목록 화면 (최대 3개 카드 표시)
2. "새 페르소나 만들기" → 텍스트 폼 (이름, 성별, 나이, 특징, 성격, 캐치프레이즈)
3. 레퍼런스 이미지 업로드 (얼굴 정면 필수, 측면·헤어·피부·의상 선택)
4. "이미지 생성" 버튼 → FLUX Portrait Trainer LoRA 훈련 (백그라운드, 수분~수십분)
   - 훈련 완료 후 FLUX 1.1 Ultra로 5가지 각도 이미지 자동 생성
   - (정면 / 3/4 측면 / 클로즈업 피부 / 전신 / 측면)
5. 이미지 마음에 들면 저장 / 안 들면 재생성
6. 음성 탭 → 한국어 샘플 오디오 업로드 (1~2분) → ElevenLabs IVC 클로닝
7. 페르소나 저장

### Step 2 — 콘텐츠 세팅

1. 저장된 페르소나 선택
2. 이번 콘텐츠용 보조 이미지 업로드
   - 의상 이미지 (선택)
   - 소품 이미지 (선택)
   - 배경 이미지 (선택)
   - 제품 이미지 (선택)
3. 언어 선택: 🇰🇷 한국어 / 🇺🇸 영어
4. 주제 입력 (자유 텍스트)
5. "스토리보드 생성" 버튼

### Step 3 — 스토리보드 편집 (카드형)

- Gemini 2.0 Flash (트렌드) + Claude Sonnet (스크립트)로 자동 생성
- 각 카드 표시 내용:
  - 타임코드 (예: 00:00 – 00:05)
  - 비주얼 프롬프트 (카메라 각도, 모델 동작, 조명) — **직접 편집 가능**
  - 대사/멘트 — **직접 편집 가능**
  - 참고 이미지 업로드 (선택)
- 카드 추가 / 삭제 / 드래그 재정렬
- 캡션 및 해시태그 자동 생성 (하단 표시, 편집 가능)
- "영상 생성 시작" 버튼

### Step 4 — 영상 생성

- 장면 카드별 Kling 3.0 Pro 영상 생성 순차 실행
- 각 카드에 진행 상태 표시 (대기 중 / 생성 중 / 완료 / 오류)
- 완료된 클립 미리보기 가능
- 특정 장면 마음에 안 들면:
  - 카드 클릭 → 편집 프롬프트 수정 + 이미지 교체 업로드
  - "이 장면 재생성" 버튼
- 전체 완료 후 "합성 시작" 버튼

### Step 5 — 음성·자막·BGM 합성

- 자동 실행:
  1. ElevenLabs TTS (페르소나 클로닝 목소리로 전체 대사 생성)
  2. Claude Haiku → 자막 타이밍 분할
  3. Udio API → BGM 생성 (테마: 밝은 뷰티 배경음, 볼륨 20%)
  4. FFmpeg → 전체 클립 + 음성 + 자막 + BGM 합성
- 최종 미리보기
- 추가 수정 지시 가능 (특정 장면 재생성으로 돌아가기)

### Step 6 — 저장 & 발행

- Google Drive 저장
- 즉시 발행 또는 예약 발행 (날짜/시간 선택)
- 발행 채널: YouTube / TikTok (Zernio)
- 캡션·해시태그 최종 확인 후 발행

---

## 6. 핵심 설계 결정 사항

### 다중 페르소나 격리
- Redis key에 `personaId` 포함 → 페르소나 간 데이터 완전 분리
- 페르소나 목록 인덱스 key로 3개 제한 관리

### FLUX LoRA 훈련 흐름
- 훈련은 백그라운드 실행 (fal.ai 비동기)
- 훈련 상태를 Redis에 저장 (`status: training / ready / failed`)
- 완료 시 프론트에 폴링으로 알림

### Kling 영상 생성 흐름
- 장면별 독립 생성 (병렬 가능, 단 비용/속도 tradeoff)
- 각 클립은 Vercel Blob에 임시 저장
- 모든 클립 완료 후 FFmpeg 합성

### 장면 재생성
- 특정 sceneId의 videoUrl만 교체
- 나머지 장면 재생성 없음 → 합성만 다시 실행

### 언어 처리
- 언어 선택(ko/en)을 draft에 저장
- generate.js, voice.js, subtitle.js 모두 언어 파라미터 수신
- ElevenLabs: 한국어 샘플 클로닝 보이스는 한국어 TTS에 최적화

### Redis 장애 방어
- 모든 Redis 읽기에 try-catch + 기본값 fallback (기 적용)

---

## 7. 구현 범위 외 (V2에서 제외)

- Mubert API (대신 Udio API 사용)
- Higgsfield (제거, Kling으로 통합)
- 기존 CreatorView 유지/마이그레이션 (별도 라우트 없이 직접 교체)
- 모바일 반응형 최적화 (데스크탑 우선)

---

## 8. 구현 순서 (우선순위)

1. **백엔드 API** — persona 다중 지원, LoRA 훈련, Kling scene-video, BGM
2. **페르소나 설정 UI** — PersonaList + PersonaEditor + PersonaImageGen + VoiceSetup
3. **콘텐츠 세팅 + 스토리보드 UI** — ContentSetup + StoryboardEditor + SceneCard
4. **영상 생성 UI** — VideoGenerator + SceneRegenerator
5. **합성 + 발행 UI** — VoiceSubtitleBGM + PublishPanel
6. **CreatorShell 통합** — 전체 단계 네비게이션 연결

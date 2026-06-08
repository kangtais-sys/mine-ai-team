# 크리에이터 주간 보드 — Claude Code 작업 명세 (Cowork → Claude Code 핸드오프)

> 작성: Cowork · 2026-06-08
> 목적: Cowork가 만든 "주간 콘텐츠 캘린더 보드"의 **남은 앱/배포 작업**을 Claude Code가 이어서 처리.
> 원칙: 추측 금지 — 각 항목 **최신 버전 문서 확인 후** 구현. 라이브 매출 앱이므로 발행계 변경은 테스트 1건으로 검증 후 적용.

## 0. 현재 상태 (이미 된 것)
- `src/components/creator/CalendarBoard.jsx` — 보드 UI (요일×4채널, 셀 클릭→캡션/태그/시각 수정·저장·승인·예약·발행·재생성).
- `api/creator/calendar.js` — GET(주간 조회) / POST(generate·save·approve·schedule·publish·delete·revise). Supabase `creator_drafts`(data JSON, `version:'milli-v1'`). 시장별 타임존(KR=Asia/Seoul, US=America/New_York, DST 반영)으로 `scheduledAt`을 UTC ISO 저장.
- `src/App.jsx` — `#creator` 라우트가 `CalendarBoard` 렌더(기존 CreatorShell 대체).
- **배포됨**: main 병합되어 라이브 동작 확인. 실 API로 셀 생성/캡션 저장 검증 완료.

## 1. [머지] 타임존 표시 버그 수정 — `feature/creator-calendar` 커밋 `68e3815`
- 증상: 화요일(6/9) 카드가 수요일 칸에 표시(하루 밀림). 원인: 보드 `iso()`가 `toISOString`(UTC) 사용 → KST(+9)에서 컬럼 키가 하루 어긋남.
- 수정: `iso()`를 **로컬 날짜**(getFullYear/Month/Date) 기준으로 변경. 이미 커밋되어 있음.
- **할 일**: `feature/creator-calendar`를 `main`에 병합 → 재배포 → 화요일 칸 정상화 확인.
- 수용 기준: 보드에서 KR/US 인스타 화요일 시드 카드가 **화(6/9) 칸**에 표시.

## 2. [env 정리] Zernio 프로필 ID 끝 개행(`\n`)
- 증상: `process.env.ZERNIO_MILLIMILLI_PROFILE_ID` 값 끝에 `\n` 포함 → 발행 시 Zernio 호출 실패 가능.
- 할 일 A (값): Vercel 프로젝트 env에서 `ZERNIO_MILLIMILLI_PROFILE_ID`, `ZERNIO_MILLIMILLI_US_PROFILE_ID`, `ZERNIO_API_KEY` 값 끝 개행/공백 제거 후 재저장.
- 할 일 B (방어코드): env를 읽는 모든 곳에 `.trim()` 적용 — 최소 `api/creator/calendar.js`, `api/creator/accounts.js`, `api/creator/publish.js`, `api/cron/publish-*.js`.
- 수용 기준: `/api/creator/calendar` generate 결과의 `profileId`에 `\n` 없음.

## 3. [영상 호스팅] mp4가 Vercel 요청 한도(~4.5MB) 초과 문제
- 증상: 기존 `api/creator/upload-photo.js`는 base64 in JSON → 5~6MB 영상은 한도 초과로 실패.
- 권장 해법: **Vercel Blob 클라이언트 직업로드**(`@vercel/blob/client`의 `upload()` + 서버 `handleUpload` 토큰 라우트) — 브라우저에서 Blob으로 직접 업로드해 serverless 본문 한도 우회. (repo에 `@vercel/blob` 이미 사용 중: `api/creator/compose.js` 참고. **현재 설치 버전의 client upload API를 문서로 확인 후** 구현.)
- 구현 스케치:
  - 신규 `api/creator/blob-upload.js`: `handleUpload`로 클라이언트 업로드 토큰 발급(`access:'public'`, 허용 content-type `video/mp4,image/*`). `BLOB_READ_WRITE_TOKEN` env 필요(Vercel Blob 연결 시 자동).
  - 보드 드로어(`CalendarBoard.jsx`)의 셀 상세에 "영상 파일 업로드" input 추가 → `upload(file.name, file, { access:'public', handleUploadUrl:'/api/creator/blob-upload' })` → 받은 `url`을 `POST /api/creator/calendar { action:'save', id, ... }`에 `mediaUrl`로 저장(‘save’ 액션이 mediaUrl도 받도록 1줄 확장).
  - 셀/드로어 미리보기: `mediaUrl`이 영상이면 `<video>` 썸네일/재생.
- 대안(차선): mp4를 4.5MB 미만으로 압축 후 기존 base64 경로 사용(품질 손해, 임시).
- 수용 기준: 보드 셀에서 실제 화요일 영상이 **재생**되고, 그 URL이 발행에도 쓰임.

## 4. [발행·예약 실행] 정시 자동 발행
- 현황: `calendar.js`의 `publish`는 Zernio 즉시발행(검증된 경로). `schedule`은 상태만 `scheduled`로 저장(아직 실제 정시 발행 트리거 없음). Zernio의 `scheduledAt` 포맷은 **문서로 미확정**.
- 권장(견고): **자체 cron으로 정시 즉시발행** — Zernio 예약에 의존하지 않음.
  - 신규 `api/cron/creator-publish-due.js`: `creator_drafts`에서 `data.version='milli-v1' AND data.status='scheduled' AND data.scheduledAt <= now()(UTC)` 조회 → 각 건 `calendar.js`의 publish와 동일한 Zernio 즉시발행 → 성공 시 `status:'published'`.
  - `vercel.json` crons에 `*/10 * * * *` 등록(인증: 기존 `CRON_SECRET` 패턴 따름).
- 선택(확인): Zernio 네이티브 예약(`scheduledAt`)을 **안전 슬롯 1건 테스트**로 검증 → 동작하면 그 경로로 단순화.
- 수용 기준: `scheduled` 상태 드래프트가 지정 현지시각(±cron주기)에 자동 발행되고 `published`로 전이.

## 5. [선택] "이 슬롯 생성하기" 버튼을 실제 생성과 연결
- 현황: 보드의 generate는 빈 드래프트 행만 생성(미디어 없음).
- 의도: Cowork가 생성 파이프라인(힉스필드→캡컷→export)을 돌려 mediaUrl을 채워 넣음. 코드 측은 `status:'generating'` + `lastRevisionNote`/슬롯 메타를 신뢰성 있게 노출만 하면 됨(현재 `revise`가 이미 그 패턴).
- 할 일: 추가 작업 불필요할 수 있음. generate 시 빈 카드가 보드에 뜨는지만 확인.

## 데이터 모델 참고 (`creator_drafts.data`, `version:'milli-v1'`)
```
{ id, version:'milli-v1', channel:'kr_ig|kr_tt|us_ig|us_tt', region:'kr|us',
  platform:'instagram|tiktok', date:'YYYY-MM-DD', slotType:'mon..sun',
  status:'draft|generating|review|approved|scheduled|published|failed',
  format:'reel|shorts|cardnews', caption, hashtags, mediaUrl, mediaUrls[],
  tz, scheduledLocal:'YYYY-MM-DDTHH:MM', scheduledAt:'<UTC ISO>',
  profileId, revisions[], lastRevisionNote }
```

## 우선순위 권장
1) §1 머지(즉시, 표시 정상화) → 2) §2 env(\n) 방어코드 → 3) §3 영상 호스팅 → 4) §4 정시 발행 cron → 5) §5 확인.

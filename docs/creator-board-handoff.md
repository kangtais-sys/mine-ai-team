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

## 6. [신규] 캡처 인제스트 엔드포인트 (Cowork 자동 캡처용)
- 목적: Cowork가 브라우저에서 html2canvas로 뜬 캡처(예: 아마존/올리브영 실후기 스크린샷)를 **브라우저 밖으로 자동 반출**하지 못함(다운로드 동기화·CORS 막힘). 서버 인제스트가 있으면 capture→POST→CDN URL로 완전 자동화.
- 신규 `api/creator/ingest-capture.js`:
  - `POST { dataUrl 또는 base64, mimeType, label }` → fal/Blob 업로드 → `{ url }` 반환.
  - **CORS 허용 필수**: `Access-Control-Allow-Origin: *`(또는 amazon.com/올리브영 등 캡처 소스 origin 허용) + `OPTIONS` 프리플라이트 처리. 이게 핵심 — 캡처가 일어나는 외부 페이지(amazon.com)에서 직접 POST 가능해야 함.
  - 본문 한도(~4.5MB) 고려: 캡처 JPEG는 보통 <100KB라 base64로 충분.
- 사용 흐름(Cowork): 외부 페이지에서 `html2canvas(el)` → `canvas.toDataURL('image/jpeg',0.8)` → `fetch('https://mine-ai-team.vercel.app/api/creator/ingest-capture',{method:'POST',body...})` → 받은 url을 후기 슬라이드/보드 mediaUrl로 사용.
- 수용 기준: amazon.com 탭에서 POST → 200 + 공개 url 반환, 그 url이 이미지로 열림.

## 7. [신규·핵심] Designed 카드뉴스 렌더러 (이미지+카피 → 브랜드 카드 베이킹)
- 배경: Cowork(sandbox)는 브라우저에서 만든/캡처한 이미지를 카드 렌더러로 못 옮김(다운로드 동기화·CORS 둘 다 막힘). 그리고 sandbox PIL은 폰트 글리프·합성 품질 한계. → **이미지 합성을 앱으로 이관**하면 고퀄·자동화 동시 해결.
- 목적: `{ 이미지 URL[], 카피[], 슬라이드 타입[], market }` 입력 → **1080×1350 캐러셀 슬라이드 PNG들**을 브랜드 톤으로 렌더 → CDN 업로드 → 해당 draft의 `mediaUrls`에 저장 → 보드/발행에서 사용.
- 권장 기술(Vercel 서버리스): **Satori(HTML/JSX→SVG) + resvg(SVG→PNG)** 또는 `@vercel/og`. (playwright도 dep에 있으나 serverless에선 chromium 무거움 — Satori 우선.) 웹폰트 임베드로 글리프/이모지 문제 없음.
- 신규 `api/creator/render-card.js`:
  - `POST { slides:[{type, image, headline, body, labels, source}], market:'kr'|'us', draftId }`
  - 슬라이드 타입: `cover`(대형 훅+제품/히어로), `info`(팁 본문, 긴 신뢰성 카피), `review`(캡처/재현 후기 + 출처), `cta`(태그·저장·댓글·팔로우).
  - 각 슬라이드를 Satori로 렌더 → PNG → fal/Blob 업로드 → url 수집 → `creator_drafts.data.mediaUrls`에 저장 + `format:'cardnews'`.
- **브랜드 템플릿은 추측 금지 — `Downloads/MILLIMILLI_브랜드디자인무드.md`(유저 제공) 그대로 적용**: 흑백 모노크롬, `milli²` 워드마크, 초대형 볼드 산세리프(숫자 강조), 모노스페이스 스펙 라벨(`[30+] proteins` 식), 블랙 필 라벨, 밑줄/슬래시 스펙, 출처 작게. KR=한글 볼드+국내 근거(올리브영 1위·984ppm), US=영문+아마존 근거(4.8/27).
- 폰트: Poppins/Archivo 등 볼드 그로테스크(영문) + 한글 볼드(Pretendard/NanumGothicBold) + 모노(JetBrains/IBM Plex Mono) 임베드.
- Cowork 연계: 나는 힉스필드 이미지(또는 §6 인제스트로 받은 캡처) URL + 슬라이드별 카피를 `render-card`에 넘김 → 앱이 베이킹. (이미지 다리 불필요)
- 수용 기준: URL+카피 POST → 1080×1350 브랜드 카드 5~7장이 mediaUrls로 저장되고 보드 셀에서 캐러셀로 표시.

## 우선순위 권장
**트랙 1 — 보드/발행 안정화(짧음):** 1) §1 머지(표시 정상화) → 2) §2 env(\n) 방어코드 → 3) §3 영상 호스팅 → 4) §4 정시 발행 cron → 5) §5 확인.

**트랙 2 — 콘텐츠 자동화 핵심(이게 designed 카드 품질을 좌우):** 6) §6 캡처 인제스트 엔드포인트 → 7) §7 Designed 카드뉴스 렌더러. ← Cowork가 매일 이미지+카피만 넘기면 앱이 고퀄 브랜드 카드를 베이킹. **트랙 2가 본질(브라우저→sandbox 이미지 다리 영구 제거).**

> Claude Code에 전달 문구 예시: "docs/creator-board-handoff.md 읽고 §6(인제스트)·§7(카드 렌더러)부터 만들어줘. 브랜드 톤은 Downloads/MILLIMILLI_브랜드디자인무드.md 그대로. Satori+resvg로 1080×1350, 발행계는 테스트 1건 검증 후."

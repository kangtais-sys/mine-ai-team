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

## 8. [신규] 레퍼런스-가이드 이미지 자체생성 (앱-사이드 힉스필드)
- 목적: 카드 메인 이미지를 **주제에 맞는 오리지널 이미지**로 생성(예: '파데 들뜸 vs 매끈한 베이스' 클로즈업). 단 텍스트 프롬프트만으로는 쌩뚱맞을 수 있어 → **핀터레스트 유사 레퍼런스 캡처를 함께 넣어** 무드를 고정.
- 흐름: Cowork가 핀터레스트에서 유사 레퍼런스 1~3장 캡처 → §6 ingest-capture로 호스팅(레퍼런스 URL 확보) → 앱 생성 엔드포인트에 `{ prompt, referenceUrls[] }` 전달 → 앱이 힉스필드 API(Soul/Character/img-ref)로 **레퍼런스 무드 반영 오리지널 생성** → 앱 소유 URL 반환 → render-card 슬라이드 image로 사용.
- 신규/확장 `api/creator/generate-image.js`(기존 파일 확장 가능):
  - `POST { prompt, referenceUrls?:[], aspect?:'4:5'|'9:16' }` → 힉스필드 생성 폴링 → Blob/CDN 저장 → `{ url }`.
  - 인증: Bearer CREATOR_INGEST_SECRET (다른 코웍 엔드포인트와 동일).
  - ⚠️ 힉스필드 웹 UI 긁기 금지 — 반드시 **공식 API**로 서버생성(CORS·서명URL 문제 없음, 매일 무인).
- 컴플라이언스: 생성 이미지엔 AI 연출 표기, 기능성 임상 데이터 범위 내 표현.
- 수용 기준: prompt+referenceUrls POST → 4:5 오리지널 이미지 URL 반환, render-card 표지/슬라이드에 박혀 나옴.

## 9. [신규] 일요일 콘텐츠 = 후기 기반 후킹 릴스(영상, 카드뉴스 아님)
- 정의: 일요일 슬롯 = **실제 후기 기반 후킹 이미지/릴스**. 카드뉴스(정지 다장) ❌. IG/틱톡 무드의 3초 후킹 단일 영상.
- 포맷: **9:16 릴스 사이즈**. 제품 회전(턴테이블) 또는 텍스트 애니메이션 등 모션. 후기 문구/평점을 후킹 비주얼로.
- 생산: Cowork의 **캡컷 스왑 엔진(검증됨)** 으로 mp4 생성 → §3 Blob 직업로드 or §1 ingest로 `mediaUrl`(영상) 등록 → 보드에 영상 드래프트(format 'reel').
- 코드 측 할 일:
  - 보드 `CalendarBoard.jsx`의 `WEEKDAYS` 에서 `sun` 의 concept을 '휴무' → **'후기 릴스'**(hint: '후기 기반 후킹 9:16 영상')로 변경.
  - 일요일도 발행 cron(§4) 스케줄 대상에 포함(현지 09:00).
  - 영상 드래프트는 이미 §3로 셀 썸네일/재생 지원됨 — 일요일 셀에서도 동일 동작 확인.
- 요약: 월=후기카드뉴스후킹 / 화=0605스왑 / 수=프로모션 / 목=0603비포애프터 / 금=정보성 트렌드(시술·성분·팁, 비후기) / 토=제품합성 / **일=후기 후킹 릴스(영상)**.

## 10. [미결·의사결정 필요] 화/일 영상의 무인 렌더링 — 완성도 vs 무인 트레이드오프
> ⚠️ 정직성 노트: 이전 초안은 "ffmpeg로 캡컷 0605 느낌 재현"이라 적었으나 **과장**. raw ffmpeg는 캡컷 템플릿(디자인된 전환·이징·키프레임·BGM싱크·텍스트애니)의 완성도를 못 따라감. 아래 3안 중 택1을 **검증 후** 결정. 추측으로 ffmpeg=캡컷 단정 금지.

- 배경: 무인 주체는 **Cowork가 아니라 앱의 Vercel cron**. 화(0605 스왑)·일(릴스) 영상을 cron이 무인 생성하려면 GUI 의존 제거 필요.
- **[입증 완료 2026-06-09] 스케줄 런에서 computer-use(캡컷 GUI 구동) 불가:** 1회성 스케줄 테스트(`unattended-computeruse-verify`) 결과 — 권한 없이 screenshot 거부 → `request_access` 팝업이 **사용자 클릭을 요구**, 클릭 없으면 180초 타임아웃, 허용앱 끝까지 `[]`. 즉 **데스크탑 제어 권한은 스케줄 런에 자동 적용 안 됨**(커넥터/브라우저 권한과 달리). 추가로 해당 시점 맥에 **CapCut 앱 미감지**(open_application 불가). → **"밤새 Cowork가 캡컷 구동" 경로는 폐기.** 영상 무인은 반드시 서버사이드(B안) 또는 아침 반무인(A안).
- **A안 — 캡컷 유지(완성도 ◎, 무인 ✕):** 스왑+export가 캡컷 GUI 필요 → 야간 무인 불가. 대안: **아침 승인창(유저 기상)에 반무인** 처리. 폴리시 그대로. (template_engine.py 유지.)
- **B안 — Remotion 재구축(완성도 ○~◎, 무인 ◎):** 0605 템플릿을 Remotion(React 프로그래매틱 영상, 헤드리스 렌더)로 포팅 → cron이 서버에서 무인 렌더. ffmpeg보다 디자인 충실. **단, 템플릿 코드 재작성 필요 + 캡컷 1:1 동일은 실제 렌더 비교 전 보장 불가.** → 실제 0605 1컷을 Remotion으로 시범 렌더해 **캡컷 export와 나란히 비교 검증**부터.
- **C안 — raw ffmpeg(완성도 ✕, 무인 ◎):** 가장 단순하나 완성도 미달 예상. 비추천.
- **검증 필요(모름):** 캡컷이 공식 headless CLI/렌더 API를 제공하는지 불명 → 제공 시 A를 무인화 가능. **문서 확인 후** 판단(추측 금지).
- before/after 일관성(같은 얼굴) 문제는 별개로 해결: §8 인물 1장 생성 → 그 1장에 영상에서 dull→glow 트랜지션(어느 안이든 적용) = 같은 얼굴 자동 확보. 매일 성별·인종 로테이션으로 다양성.
- 권장: 단기 A(반무인), 본게임은 B 타당성 검증 후 결정. C로 퉁치지 말 것.

## 11. [무인 핵심] 일일 생성 오케스트레이터 cron (카드형 요일 — 지금 무인화 가능)
- 카드형 슬롯(월 후기훅·수 프로모션·목 비포애프터카드·금 정보성·토 제품합성)은 computer-use 0%, 순수 API(§8 generate-image-ref + §7 render-card v2)라 **앱 cron으로 완전 무인** 가능. (영상은 §10 별도.)
- 신규 `api/cron/creator-generate-daily.js` (CRON_SECRET):
  - 매일 새벽(예: KST 05:00 = `0 20 * * *` UTC, vercel.json) 실행.
  - 그날 요일 → 슬롯 정의(요일별 slotType·시장 KR/US) 조회 → 각 채널별로: §8로 토픽 이미지(ABC 믹스 규칙·매일 다양성 로테이션) → render-card v2로 슬라이드 베이킹(표준순서 ①제목 ②후기페이지 센스워딩 ③정보본문 ④CTA, body **강조** 마크업) → `creator_drafts`에 `status:'review'` draft 시드 + `scheduledLocal=09:00`.
  - 결과를 Chief AI 일간체크/보드에 노출 → 09:00 유저 승인 게이트 → §4 발행 cron이 정시 Zernio 발행.
- 슬롯별 카피/토픽 생성: Anthropic SDK로 "팔리는 후킹" 카피 생성(브랜드무드 MD 규칙 주입). 시장 출처값(KR 29가지·984ppm / US 30+·4.8★(27)) 혼용 금지.
- 수용 기준: cron 1회 수동 트리거 → 그날 4채널 카드 draft가 보드 review 상태로 시드됨(이미지·캡션·해시태그·예약시각 포함).

## 12. [협업 모델·확정] Cowork=생성 / 로컬코드=업로드 / 유저=승인
> 봇 차단 때문에 후기·핀터레스트 캡처는 서버가 아니라 **실제 로그인 브라우저(Cowork)** 가 해야 함. 그래서 자동화는 아래 3분할.

- **Cowork(매주 스케줄)**: 후기 캡처 + 핀터레스트/§8 이미지 + 카드 렌더(PNG) + **manifest.json** 출력.
  - manifest 예: `{ channel:'kr_ig'|'us_ig', date:'YYYY-MM-DD', format:'cardnews', images:['/abs/monday_kr_FINAL_01.png',...7장], caption:'...', hashtags:'#...', scheduledLocal:'09:00' }`
- **로컬 업로더(신규, 유저 맥에서 실행 — 앱 도달 가능 + .env.local 시크릿 보유)** `scripts/upload-carousel.mjs`:
  - manifest 읽기 → 각 PNG를 `POST /api/creator/ingest-capture`(base64/dataUrl→Blob) 로 호스팅 → 받은 URL들을 `mediaUrls[]` 로 → `POST /api/creator/ingest` 로 드래프트 시드(status:'review', channel, date, caption, hashtags, scheduledLocal). Bearer `CREATOR_INGEST_SECRET`.
  - ⚠️ Cowork sandbox는 라이브 앱 도달 불가(000) → 업로더는 **반드시 유저 맥/Claude Code 측에서** 실행.
- **유저**: 보드에서 승인 → 발행.

### 발행 라우팅 (유저 확정 2026-06-09)
| 채널 | 발행 |
|---|---|
| KR 인스타(kr_ig) | **자동** (Zernio 즉시발행, 검증경로) |
| KR 틱톡(kr_tt) | **자동** (Zernio) |
| US 인스타(us_ig) | **자동** (Zernio — ⚠️ US egress 필요, 미해결 시 보류) |
| US 틱톡(us_tt) | **수동** → `to-drive.js` 로 "밀리밀리 US 수동발행" 드라이브 업로드 후 유저가 미국 VPN으로 직접 게시 |

### to-drive.js 수정 필요
- 현재 `uploadDraftToDrive`는 **단일 `draft.mediaUrl`(영상)** 만 처리 → **카루셀(`mediaUrls[]` 7장)은 첫 장만 올라감**. → `mediaUrls[]` 있으면 전부 루프 업로드(파일명 `[US-TT] {date} {n}/7 ...`).
- 라우팅 갱신: 기존 코드 주석은 "US 인스타·틱톡 둘 다 수동" 가정 → **us_ig는 자동발행, us_tt만 to-drive** 로 변경.

### 정확한 엔드포인트 계약 (코드 직접 확인 — 추측 아님)
**A) `POST /api/creator/ingest-capture`** (이미지 호스팅, CORS *, `Authorization: Bearer CREATOR_INGEST_SECRET`)
- body: `{ dataUrl }` = `"data:image/png;base64,<...>"` (또는 `{ base64, mimeType }`). 허용 jpeg/png/webp, **≤4MB**(매직바이트 검증). `label`(선택, 파일명용).
- 응답: `{ url, bytes }`.  ← 이 `url` 을 모아서 B의 `mediaUrls[]` 로.

**B) `POST /api/creator/ingest`** (보드 드래프트 시드, `Authorization: Bearer CREATOR_INGEST_SECRET`)
- body: `{ channel, date, mediaUrls?[], mediaUrl?, caption?, hashtags?, format?, slotType?, status? }`. **channel·date 필수.** channel ∈ `kr_ig|kr_tt|us_ig|us_tt`. 카루셀이면 `format:'cardnews'`, `status:'review'`.
- 동작: 같은 `channel+date` 드래프트 있으면 갱신, 없으면 생성(version `milli-v1`, profileId 자동). 응답 `{ ok, action, id, draft }`.

### 업로더 알고리즘 (scripts/upload-carousel.mjs)
```
manifest 읽기 →
 for each images[i]: 파일 read → base64 → A 호출 → url 수집
 B 호출 { channel, date, mediaUrls:[urls], caption, hashtags, format:'cardnews', slotType, status:'review' }
 → 보드에 review 드래프트 뜸. (BASE_URL = https://mine-ai-team.vercel.app, Bearer = CREATOR_INGEST_SECRET)
```
- ⚠️ `.env.local`에 **`CREATOR_INGEST_SECRET` 없음** → Vercel에서 가져와 추가해야 업로더/ingest 동작.

### manifest.json 포맷 (Cowork가 출력 — Cowork 몫)
```json
{ "channel": "kr_ig", "date": "2026-06-09", "format": "cardnews",
  "slotType": "monday_value_carousel",
  "images": ["/Users/.../Downloads/monday_kr_FINAL_01.png", "...07.png"],
  "caption": "…", "hashtags": "#…", "scheduledLocal": "09:00" }
```
(채널별 1개씩: kr_ig, us_ig … us_tt는 영상일 때만/카루셀은 IG 위주.)

## 13. [영상 합치기 자동화] scripts/assemble-tuesday-video.mjs (Cowork 작성, Claude Code가 맥에서 실행)
- 목적: 화요일 영상 = **분사 before/after 영상 + 주차 사진컷(스틸) + 자막(선택) + 로열티프리 BGM(선택)** → 9:16 mp4. (주차 진행을 영상으로 만들면 가짜 같다는 피드백 → 스틸 사진컷으로 삽입.)
- 실행 위치: **유민혜 맥/Claude Code** (Higgsfield cloudfront 접근 가능). ⚠️ Cowork sandbox는 cloudfront 차단(000)이라 실행 불가 — 그래서 이 스크립트는 거기서 돌려야 함.
- 의존: `ffmpeg`(무료, `brew install ffmpeg`), node 18+. **유료 프로그램 없음.**
- 입력: CONFIG에 그 주의 Higgsfield 생성물 rawUrl(또는 로컬경로) — 분사영상 1 + 주차스틸 4. 삽입지점/노출시간/BGM/자막 옵션.
- 동작: 분사영상 중간(기본 50%)에서 잘라 1·2·3·4 WEEK 스틸을 각 ~0.9초 사진컷으로 끼우고 뒤(after)로 이어붙임 → 자막 burn-in(선택) → BGM 믹스(선택). 자막·펜체크는 스틸에 이미 박혀있음.
- ⚠️ 음악: **로열티프리/라이선스 음원만** burn-in. 저작권곡 금지. 트렌딩 사운드는 틱톡 앱에서 입히는 게 안전·도달률 유리.
- 상태: Cowork가 sandbox에서 실행·검증 불가(미테스트) → **Claude Code가 맥에서 실행하며 ffprobe/ffmpeg 경로·폰트·삽입지점 미세조정 후 확정.**

## 우선순위 권장
**트랙 1 — 보드/발행 안정화(짧음):** 1) §1 머지(표시 정상화) → 2) §2 env(\n) 방어코드 → 3) §3 영상 호스팅 → 4) §4 정시 발행 cron → 5) §5 확인.

**트랙 2 — 콘텐츠 자동화 핵심(이게 designed 카드 품질을 좌우):** 6) §6 캡처 인제스트(완료) → 7) §7 Designed 카드뉴스 렌더러(완료) → 8) §8 레퍼런스-가이드 이미지 자체생성(신규). ← Cowork가 매일 핀터 레퍼런스+카피 넘기면 앱이 오리지널 이미지 생성 + 고퀄 브랜드 카드 베이킹. **트랙 2가 본질.**

### [중요] render-card cover 템플릿 미니멀 리디자인 (유저 피드백)
현 cover가 너무 복잡·광고스러움(검정 필 3개 + 긴 2줄 서브 + 큰 테두리 이미지박스). **첫 시안처럼 미니멀·에디토리얼·헤드라인 지배형으로 재설계:**
- 상단 좌: **실제 milli² 로고 이미지**(텍스트 워드마크 흉내 ❌). 호스팅됨 → `https://zre3xstenznneqve.public.blob.vercel-storage.com/capture/milli_logo-S5AYbqtEpiw6igBWtUm0MPNMpgXZEf.png` (가능하면 브랜드 투명 로고로 교체). 높이 ~40px.
- 상단 우: 평점 = **모노 텍스트** `4.8★  AMAZON US` (검정 필 ❌, **후기 갯수 "(27)" 빼기** — 유저 요청). 얇은 1px 구분선.
- 헤드라인: **초대형(화면 지배)**, 여백 넉넉. 서브 **≤5단어** 한 줄("It's the step before it.").
- 라벨: **가는 아웃라인 박스 1개** (`500 DALTON / 30+ PROTEIN`) — 검정 필 ❌.
- 이미지: **작은 제품 액센트**(우하단, 테두리 큰 박스 ❌) — 헤드라인이 주인공.
- 하단: `swipe →` (작게).
- 기준 = 첫 PIL 시안(`monday_us_card_01`): 미니멀·여백·헤드라인 1개 지배. (info/review 슬라이드는 현행 유지, review만 objectFit:contain)

### [중요] 카드 템플릿 v2 디자인 리파인 (유저 피드백)
1. **모서리 직각** — 모든 이미지박스·프레임 `borderRadius:0` (둥근 사각형 ❌). 에디토리얼 직각.
2. **본문 볼드/라이트 믹스** — info/cta body를 **리치텍스트**로 렌더: `**강조**` 마크업은 볼드(900), 나머지는 라이트(400). 핵심 단어만 강조되게. (Cowork가 body에 `**...**` 표기해서 넘김)
3. **손그림 동그라미 포인트** — 아마존 milli² 홈의 시그니처(핵심 숫자/단어를 손그림 원으로 둘러쌈). 슬라이드당 0~1개, 핵심 수치(예: `500 Dalton`, `4.8★`)에 거친 SVG 타원(hand-drawn ellipse, 약간 비뚤·두께 변화) 오버레이 옵션. 과하지 않게 간헐적으로.
4. **마지막(CTA) 슬라이드 블랙 반전** — cta 타입 배경 `#0A0A0A` + 화이트 텍스트(로고/필도 반전). 캐러셀 끝 임팩트.
5. **캐러셀 표준 순서(고정)**: ① 제목(훅) → ② **후기 페이지**(센스있는 워딩, 소셜프루프 훅 — "후기 이거야" ❌, 예: "We could list the science. They already proved it. ↓" + 후기 캡처) → ③ 정보성 본문(단계/내용 N장) → ④ 마지막 CTA(CTR 부스터, 블랙 반전). **후기는 끝이 아니라 2번**(제목 직후)에 배치. (Cowork가 카피·순서 구성)

> 추가 버그픽스(소):
> - 보드 드로어 카드뉴스 캐러셀이 세로 플렉스에서 높이 collapse → 컨테이너 div에 `flexShrink:0` 추가.
> - render-card **cover 레이아웃 중앙 여백** — 텍스트가 짧으면 이미지(하단 marginTop:auto)와의 사이가 크게 빔. 이미지 박스를 더 크게/위로 당겨 중앙 공백 제거(예: 이미지 height 키우거나 flex로 채우기).
> - render-card **review 슬라이드 이미지 `objectFit:'cover'`→`'contain'`** (세로형 후기 캡처가 좌우 잘림 방지 — 흰 여백으로 전체 보이게).

> Claude Code에 전달 문구 예시: "docs/creator-board-handoff.md 읽고 §6(인제스트)·§7(카드 렌더러)부터 만들어줘. 브랜드 톤은 Downloads/MILLIMILLI_브랜드디자인무드.md 그대로. Satori+resvg로 1080×1350, 발행계는 테스트 1건 검증 후."

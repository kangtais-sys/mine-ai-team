# MILLI 콘텐츠 엔진 — 시스템 구조 통합 맵 (코드 실태 대조본)

> 작성: 2026-06-12. 흩어진 시스템 문서(content-engine-system / sns-strategy-summary / shorts-format-library / creator-board-handoff / claims / product-assets / brand-look) + 실제 `vercel.json` cron 26개 + `api/cron/*` 코드를 **대조**해 정리. 추측 아님 — 문서가 말하는 설계 vs 실제 박힌 코드를 매칭.

---

## 0. 한 줄 정의
**MINE 없이 매일 millimilli(KR/US) IG·TikTok 보드를 D-3까지 "콘텐츠 SET" 단위로 자동 채운다. MINE은 보드에서 검토·승인만.**
- **1순위 KPI = 댓글 100 / 저장 / 공유** (조회수·직접판매 아님). 매일 판매 톤 금지.
- 정보성·가치가 주(主), **제품 은근히 1곳**. 모든 콘텐츠 = **궁금증 갭 + 대세감** 둘 다 필수.

---

## 1. 전체 파이프라인 (5단)
```
[1 입력·트렌드] → [2 전략·블루프린트] → [3 비주얼 생성] → [4 QA 게이트] → [5 보드 review 시드] → (MINE 승인) → [발행]
```
| 단 | 하는 일 | 자동화 | 실행 주체(코드) |
|---|---|---|---|
| 1 트렌드 스캔 | 유튜브 Data API(완전자동) / 메타 광고라이브러리(반자동·브라우저) / 틱톡(보조) | 🟡 일부 | `sisuru-trend`, 수동 스캔 |
| 2 SET 설계 | 출력타입·키워드 로테이션·위너 추출·7요소 블루프린트 | 🟢 코드화 | `creator-generate-daily`, `shorts-daily`(폴백 FORMATS) |
| 3 비주얼 생성 | Higgsfield: 시작이미지→kling 9:16 영상→오버레이(동그라미+자막) | 🟢 코드화 | `shorts-daily`(영상) / `creator-generate-daily`(카드) |
| 4 QA 게이트 | 9:16·병정확·궁금증+대세감·키워드로테·컴플라이언스 | 🟡 부분 | 코드 내장 일부 + MINE 눈검증 |
| 5 보드 시드 | `creator_drafts` 에 `status:review` 로만(자동발행 X) | 🟢 코드화 | 위 cron들 |
| 발행 | KR=Zernio 즉시 / US=API 승인 후 | 🟢/🔴 | `publish-*`, `crosspost`, `creator-publish-due` |

## 2. 산출 단위 = "SET" (⛔ 단품 금지) — 7요소
`①트렌드출처(실링크) ②시리즈축 ③훅(3초·궁금증갭) ④비주얼(자산) ⑤캡션(일기톤+KPI장치) ⑥KPI장치 ⑦컴플라이언스`
- **트렌드 출처가 출력타입을 결정**(섞지 말 것): 메타=정적/UGC 일기톤 · 유튜브=영상(문제→해결·before/after).
- 시리즈 3축 로테이션: **발견60 / 신뢰25 / 캐릭터15**.
- 첫 3초 훅 4종: ①얼굴 ②결과 ③대비 ④문장 — 설명 아니라 **멈춤 유도**.

## 3. 요일 × 채널 슬롯맵
- **출력타입 교대:** 월·수·토 = 정적(메타 기반) / 화·목·금·일 = 영상(유튜브 기반).
- **채널 4개:** `kr_ig · kr_tt · us_ig · us_tt`.
- **인물 규칙(계정별 갈림):**
  - 브랜드(millimilli) = **전 세계 다양한 사람**(대세감·UGC), 얼굴 고정 X, 일관성은 *브랜드 결*에서.
  - 페르소나(유민혜·lala_lounge) = **고정 캐릭터**(얼굴 3~5장·말투 고정).
  - 공통: **photoreal 필수**(모공·질감, plastic·AI티 금지).

## 4. ★ 자동화 런타임 — 실제 cron 대조 (vercel.json 26개)
> 무인 핵심 = Vercel cron(항상 켜짐). 앱 미오픈과 무관.

**콘텐츠 생성·발행**
| cron | 주기 | 역할 | 9개 에이전트 |
|---|---|---|---|
| `creator-generate-daily` | 매일 20:00 | 정적 슬롯(review_hook/trend_info) 자동 채움 → review | ①크리에이터 |
| `shorts-daily` | */15분 | **shorts 9:16 풀 파이프라인**(시작이미지→kling→오버레이→review). 2패스 비동기 | ①크리에이터 |
| `wed-promo` | 화 23:00 | 수요일 프로모 SET | ⑦커머스MD |
| `promo-calendar` | 월 02:00 | 프로모 캘린더 | ⑦커머스MD |
| `publish-morning`/`evening` | 02:00 / 10:00 | 승인분 발행 | ①크리에이터 |
| `crosspost` | 01·06·11시 | 채널 교차발행 | ①크리에이터 |
| `creator-publish-due` | */10분 | 예약분 발행 | ①크리에이터 |
| `creator-schedule` | */5분 | 스케줄 처리 | ①크리에이터 |
| `drive-upload` / `upload-pipeline` | */15 / */5분 | Drive→YouTube/TikTok 업로드 | ①크리에이터 |

**커뮤니티·CS·데이터·리포트·운영**
| cron | 주기 | 역할 | 에이전트 |
|---|---|---|---|
| `inbox` | */5분 | 인스타 DM/댓글 자동응대(Zernio 100%) | ②커뮤니티 |
| `youtube-comments` | */30분 | 유튜브 댓글 관리 | ②커뮤니티 |
| `sisuru-trend` | 매일 14:00 | 트렌드 스캔 | ⑤랭킹&리뷰 |
| `review-monitor` | 매일 03:00 | 리뷰 모니터링 | ⑤랭킹&리뷰 |
| `ranking` | */2시간 | 카테고리 랭킹 | ⑤랭킹&리뷰 |
| `instagram-followers` | 매일 00:00 | 팔로워 스크랩 | ⑨Chief |
| `ad-optimize` | 매일 04:00 | ROAS·Meta 광고 최적화 | ⑥마케터 |
| `daily-report`/`chief-report`/`channel-report` | 23:00 | 일간 리포트 | ⑨Chief |
| `gov-announcements` | 월 01:00 | 정부지원·수출바우처 | ④경영지원 |
| `amazon`/`cafe24`(sales) | */2h / 매일 | 매출 수집 | ⑧수출 |
| `refresh-token` | 매일 15:00 | OAuth 토큰 갱신 | 인프라 |
| `persona-learn` | 월 00:00 | 페르소나 학습 | ①크리에이터 |

## 5. 입력 자산 (한 번만 잠금 — 매일 아님)
- **제품 에셋맵**(product-assets.md, media_id): 단백질미스트 히어로 `4a56fcd8`·`5ae8b48a` 등 10종.
- **브랜드 룩**(brand-look.md): 레퍼 얼굴 20장, "젊고 신선·모던 K뷰티", 와이드/올드 금지, **단일 레퍼 거의 복제**.
- **합법 클레임**(claims-substantiation.md): 제품별 임상 근거·금지표현.
- **페르소나 매뉴얼**(persona-soul-prompt-guide.md). MINE Soul `67c4bcbf-...`.
- **키워드 풀**(로테이션): 콜라겐·미스트·글로잉·글래스스킨·탄력·팔자·눈가·k뷰티·올리브영·미백·진정.
- **숏츠 포맷 라이브러리**(shorts-format-library.md): #1 split, #2 팔자미스트 — `shorts-daily.js` FORMATS에 코드화됨.

## 6. 발행층
- KR = **Zernio API 즉시**. 프로필: millimilli.kr `69fbfc19...` · millimilli.us `69fbfd06...` · lala_lounge `69fca4b1...`.
- 자동응대 = **100% Zernio**(`webhooks/zernio.js`, `cron/inbox.js`만 수정 — `instagram.js` 미사용).
- 한글/시그니처 동그라미 = **오버레이 렌더러**(`creator/overlay-short.js`)로 footage 위에 합성(Higgsfield baked 불가 대응).

## 7. 절대 규칙 / QA 게이트 (하나라도 ✗ = 반려)
☐ SET 형태(단품 즉시 반려) ☐ 실제 트렌드 1건 추적(출처 링크·출력타입 일치) ☐ 키워드 로테이션(직전과 다름) ☐ **궁금증 갭 + 대세감 둘 다** ☐ 제품 은근(광고티 X) ☐ 자막 최소·워터마크 X·고해상(추천 적합성) ☐ photoreal(plastic·AI티 X) ☐ 클레임 범위·AI연출 명시·KR/US 수치 분리 ☐ KPI 장치(댓글 가르기+저장+공유)

## 8. 솔직한 현재 상태 (됨 / 반자동 / 막힘 / 미결)
- 🟢 **됨:** 보드·9개 에이전트 cron·shorts 9:16 풀 파이프라인(생성→오버레이→review 시드)·KR Zernio 발행·자동응대·리포트.
- 🟡 **반자동:** 메타 광고라이브러리·틱톡 트렌드 스캔(공식 API 막힘 → 브라우저 주기 스캔). 유튜브만 완전자동. QA 픽셀검증은 MINE 눈.
- 🔴 **막힘:** ①TikTok API 승인 대기(→US 발행) ②카페24 OAuth 심사중 ③GA4 analytics scope 403(GOOGLE_REFRESH_TOKEN 재발급 필요) ④샌드박스 Higgsfield CDN egress 차단(생성 픽셀 직접검증 불가 → MINE job_display) ⑤n8n YouTube title undefined.
- 🟡 **미결(결정/실행):** §5 릴스 완성본 = **A안(힉스필드 단독 9:16) 확정**(2026-06-12). → A안 기준 SET 1개를 `shorts-daily` FORMATS 로테이션에 맞춰 검증·승인하면 무인 루프 완성.

## 9. 다음 한 수 (우선순위)
1. **A안 기준 SET 1개 실제 생성·MINE 승인** → `shorts-daily` 파이프라인이 이미 있으니, 폴백 FORMATS(팔자·split)에 더해 **단백질미스트 미스트편**을 검증된 기준으로 추가.
2. 막힌 것 중 **매출 직결 = TikTok API 승인 + 카페24** 우선 푸시(US 발행 게이트).
3. GA4 토큰 재발급(리포트 정확도).
```
이 문서 = 단일 진실원본(SSOT). 세부는 각 원본 문서 참조.
```

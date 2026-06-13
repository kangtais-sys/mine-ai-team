# MILLI 콘텐츠 엔진 — 세션 인수인계 (READ FIRST)

> 목적: 새 세션이 **이 파일 하나**로 전체 맥락을 이어받는다.
> 오너: 유민혜(MINE) · MILLIMILLI(밀리밀리, 500달톤 프로틴 스킨케어) 대표 · 0.8L 플랫폼 대표 · 30만 인스타 뷰티 인플루언서.
> 목표: **MINE 없이 매일 브랜드 SNS(millimilli.kr/.us IG·TikTok) 콘텐츠를 트렌드 스캔→"팔리는 후킹" SET으로 자동 생성**, 보드 D-3까지 채우고 MINE은 검토·승인만.

---

## 0. MINE 작업 원칙 (절대 — 매 응답 준수)
- **처음부터 솔직하게.** 그럴싸하게 말하고 나중에 솔직 = 금지. 항상 비교분석 + 검토한 걸 다시 검토·입증해서 말할 것.
- **추측 금지 · 일시방편 금지 · 모르면서 아는 척 금지.** 조금 알아도 완벽히 아는 게 아니면 모르는 것. 항상 최신 버전 기준.
- **간결·직설.** 불필요한 설명·장황함 금지.
- ⚠️ MINE은 이번까지 반복 실수에 인내심 한계. 같은 실수(릴스 사이즈·제품 모양 섞임·단품·트렌드 누락·올드한 룩) 반복 시 신뢰 상실. **만들기 전에 한계·포맷을 못박고, 픽셀 검증 불가한 건 솔직히 말하고 MINE이 보게 할 것.**

## 0-1. KPI·콘텐츠 규칙 (CLAUDE.md와 동일 — 발행 게이트)
- **1순위 KPI = 댓글 100 / 저장 / 공유** (조회수·직접판매 아님). 매일 판매 톤 금지.
- 정보성·가치가 주(主), **제품 은근히 1곳**. 광고처럼 보이면 실패.
- 모든 콘텐츠: **궁금증(curiosity gap) + 대세감(social proof)** 둘 다 필수. 없으면 발행 금지.
- 3초 후킹 + 유료광고 돌려도 매출 날 퀄리티.
- 인물: 브랜드 계정=전 세계 다양한 사람(대세감) / 페르소나 계정(유민혜)=고정 캐릭터. 둘 다 **photoreal**.
- 후기·증거 = 실제 스크린샷 캡처(가짜 후기 카드 금지). 비후기 illustrative = 실사 우선 + Higgsfield 생성 믹스 허용.

---

## 1. 핵심 시스템 문서 (모두 /Users/yuminhye/mine-ai-team/docs/)
- **content-engine-system.md** — 마스터 시스템(목표·SET단위·입력트렌드·전략·블루프린트7요소·프로덕션·QA게이트·자동화런타임·한계·일순서).
- **sns-strategy-summary.md** — PDF "수익화 단계별 전략" 17단계 distill(시리즈3축·릴스구조·추천적합성·제품문법·일관성/다양성·재미·캡션·지표·수익화).
- **claims-substantiation.md** — 제품별 임상 근거·합법 클레임·금지표현.
- **product-assets.md** — 제품 Higgsfield media_id 맵.
- **brand-look.md** — 브랜드 룩(레퍼 얼굴) media_id 20장.
- **persona-soul-prompt-guide.md** — 페르소나 실사화 프롬프트.
- CLAUDE.md 2곳: `/Users/yuminhye/mine-ai-team/CLAUDE.md`, `/Users/yuminhye/Downloads/CLAUDE.md` (KPI·Zernio·인프라).

## 2. 콘텐츠 1단위 = "SET" (⛔ 단품 금지)
`①트렌드출처(실링크) ②시리즈축 ③훅(3초·궁금증갭) ④비주얼(자산) ⑤캡션(일기톤+KPI장치) ⑥KPI장치 ⑦컴플라이언스`
- 트렌드 출처→출력타입: **메타 광고라이브러리=정적/UGC 일기톤** · **유튜브=영상(문제→해결·before/after)**.
- 키워드 풀(로테이션, 직전과 다르게): 콜라겐·미스트·글로잉뷰티·글래스스킨·탄력·팔자주름·눈가주름·k뷰티·코리안스킨케어·올리브영·미백·진정.
- 시리즈축: 발견60/신뢰25/캐릭터15.
- 트렌드 검색은 **영어로도** 할 것(글로벌).

---

## 3. 📸 전체 미디어 인벤토리 (Higgsfield media_id — MINE 직접 업로드 2026-06-12)
> 사용: `generate_image/video`에 `medias:[{value:<media_id>, role:image}]`. ⚠️ media_id는 만료 가능 → 만료 시 MINE 재업로드 또는 Vercel Blob 미러.
> Higgsfield MCP server uuid: `94807a4b-b3c4-416e-b47a-9ef59e40efac`. MINE Soul 캐릭터: `67c4bcbf-8637-4fbf-8b43-3ae1a9ab48cd`.

### 3-1. 제품 사진 (product-assets.md)
| 제품 | 입증 혜택 | media_id |
|---|---|---|
| **단백질(콜라겐) 미스트 [히어로]** | 팔자·눈가주름·볼꺼짐 개선(4주)·24h보습 | `4a56fcd8-478d-4860-b722-03934e6eaf3f` · `5ae8b48a-d38a-4cae-a0b2-2a1f542685ca` |
| 시카 미스트 | 진정·장벽·자극 개선 | `68a0a7c2-71b1-4ea6-84d6-99137fa17577` (누끼) |
| 비타 미스트 | 윤기·톤·색소(미백) | `a6e71e46-d815-482d-ab07-dfdf2dcb56ab` |
| 앰플 | 리프팅·모공탄력(4주) | `bb221889-17b5-4866-a0f2-0070247c6623` · `4660e076-f0d4-4a51-bada-a6ecf1505663` |
| 비비크림 | — | `7c8b4530-c662-4682-9223-e6ed661bbee1` · `916cc144-3a30-4b17-a26b-1222f10d7bbc` |
| 클렌저 | — | `c5b23ac0-5031-4a6e-9720-7c38ce841159` · `022d4bca-f931-4391-9ff2-a53d52ff1304` |
| 바디워시 | — | `d2cb2af1-f660-4d0e-ab70-a5106e39b823` · `c677d660-383b-4f85-a234-f5e369161848` |
| 선크림 | — | `19e135c7-43c7-4aba-b9e8-a616b5acf045` (누끼) · `3190b533-a96e-48fb-a1f8-4c259da94312` |
| 샴푸 | — | `d5e715dd-7be0-4387-af4f-2e3647eb22ec` |
| 트리트먼트 | — | `25f773c4-77e4-4b8c-83a6-cb6a03f7f07d` |

### 3-2. 레퍼런스 얼굴 / 브랜드 룩 (brand-look.md, 20장 — "젊고 신선·트렌디·모던 K뷰티", 올드 금지)
```
7c9d45ca-e56b-4181-ab08-b085bcfea293   7b9c113c-77b1-4a06-b5b4-2476186e336d
acdd9122-c7b7-4201-b9ae-c3aafe02dc5a   2f676ab2-9001-46d2-bf14-76cf04c1e6b5
0ab6848b-c02e-403c-b515-61e2d7a710b9   b43a37b4-d6d1-4a3c-9585-8a5a826d76e0
261cf9f9-5b4f-4940-a51b-5eb25bb53224   e029526a-a7ef-4151-b9d6-8c5364cf76de
4af2406e-235b-46cb-8a6d-3cf3550a8353   7a5e6280-fd99-40ca-91e2-9952477a98c7
0fa3baee-5607-4d18-9ca7-a1e2bd467d6f   2cf0e8b7-4968-4f90-8efe-41b045a4876d
16c99547-8b0e-4f37-974a-b83d852a5e30   5a01dd87-77ff-4600-9735-25cef373c12f
11bf5fae-0845-4f67-80e4-c78e1d2c3b36   a472b60f-241c-49c4-b1f7-e402df194d07
41f96670-2418-489d-be05-f719d5abe26d   02918903-84df-470f-b24c-f97e76f7afc1
26157f42-7f4a-4de9-9246-064f55516894   73ad242f-8700-44f4-ba03-6bce6159efb8
```
**MINE 확정 룩 규칙(이번 세션):** 대부분 **얼굴 클로즈업** 레퍼. 와이드/배경 많은 컷 금지. 생성은 **레퍼 1장씩 단일로 넣어 "거의 복제" 수준**(프레이밍·크롭·조명·색감·무드 그대로, 인물만 살짝 변형)으로 뽑을 것 → MINE이 "좋아" 승인한 방식. 여러 레퍼 블렌드 < 단일 레퍼 복제.

---

## 4. ⚠️ 이번 세션 검증된 한계·실수 (반복 금지)
1. **릴스/숏츠 = 9:16 세로 필수.** kling3_0은 **start_image 비율을 따라감** → 1:1 정사각 start면 결과도 1:1. **반드시 9:16 start 프레임 먼저 생성 후 영상화.** (이번에 1:1로 나와 MINE 반려.)
2. **생성영상에 제품(병) 넣으면 모양 섞임·왜곡.** MINE이 정확히 지적한 문제. → 제품은 **별도 정확 제품컷**(제품 레퍼 1개만, 스타일 믹스 X)으로 분리하거나, 영상엔 제품 빼고 캡션·고정댓글로.
3. **한글 텍스트 baked 검증 불가.** 샌드박스가 Higgsfield CDN(cloudfront d8j0ntlcm91z4 / d2ol7oe51mr4n9) **egress 차단(000)** → 생성 이미지 픽셀을 Claude가 못 봄. baked 한글 깨짐 여부는 **MINE이 job_display로 확인**하거나, 텍스트는 **캡컷서 얹는** 게 안전.
4. **viz 위젯 CSP가 cloudfront 이미지 차단** → 위젯으로 실사진+텍스트 합성 불가.
5. **단품·트렌드 누락·키워드 고착(팔자만)·올드한 룩** = MINE 반려 사유. QA에서 강제.
6. **사람 토킹 풀영상·정밀 before/after = 생성AI 한계(가짜티).** AI는 제품·센서리·인물 stills·짧은 클립에 강함. 풀 릴스는 캡컷 마감.

## 5. 🟡 미결정 (MINE이 정해야 — 다음 세션 첫 질문)
**릴스 "완성본" 정의 3안 중 택1** (제품 정확도 vs 한 도구 마감 trade-off):
- A) **힉스필드 단독 멀티샷 릴스**(9:16 한 영상에 얼굴→미스트→광채) — 한 도구로 끝, 단 제품 병 모양 왜곡 위험.
- B) **클린 클립 분리 + 캡컷 마감**(9:16 얼굴 클립 + 정확 제품 클립 별도 → 캡컷 합성) — 제품 100% 정확, 마감 1스텝.
- C) **제품 없는 무드 릴스**(제품은 캡션·고정댓글) — 왜곡 0, 광고티 0.
> MINE 원문: "힉스필드 자체로만 끝내도록" (= A 선호 신호) 이지만 제품왜곡 우려로 보류. **확정 필요.**

---

## 6. 이번 세션 실제 트렌드 스캔 결과 (재사용 가능, 실링크)
### 메타 (정적/UGC 일기톤)
- Meta Ad Library US, `q=glass skin serum`, 노출순 톱 = **Biodance "Jelly in a Mist?"** (2026.4.15~현재 장기집행=전환 위너).
  - 패턴: **궁금증+반전 훅**("Jelly in a Mist? / Say goodbye to mists that just evaporate!") + **대세감**("Amazon's #1 Glass Skin Mask Now in a Mist").
  - 우리 단백질 미스트와 동일 카테고리. CLAUDE.md 반전 예시("미스트 뿌리면 더 건조해져요")와 일치.
- URL: facebook.com/ads/library `active_status=active&country=US&q=glass skin serum&search_type=keyword_unordered`

### 유튜브 (영상/문제→해결)
- @songofskin/shorts 위너: **"Problem vs. Solution Skincare Edition"** 2만 · **"This pad faded my elbow pigmentation 🫣"** 2.2만 · "All pores clean within 30 secs 🫣" 1.6만.
  - 패턴: **문제→해결 / 결과 선공개+미스터리 close-up + 🫣 이모지**.
- URL: youtube.com/@songofskin/shorts, 예 youtube.com/shorts/6xuDNHrYtB4

### 영어 트렌드 시그널 (WebSearch)
- 2026 K뷰티: glass skin → **bloom skin**(윤기보다 건강·균일·장벽). 발효·펩타이드·바쿠치올.
- 광고: **UGC 영상 36.8% 점유 1위.** 텍스처·센서리 클로즈업 훅("watch what happens after one pass"), **하드 CTA 없음**, transformation으로 신뢰.

## 7. 이번 세션 생성 산출물 (job id — 만료 가능)
- 얼굴 클로즈업(4:5, 레퍼 거의 복제, MINE "좋아"): `27cbf5db`(ref 7c9d45ca) · `6cc0daa7`(ref acdd9122) · `2413253c`(ref 41f96670) · `de663b03` · `4430c214`.
- 미스트 정확 제품컷(4:5): `1bbfa3fa` (ref 4a56fcd8).
- 9:16 세로 얼굴 프레임(릴스용, 생성됨): `c6b9ef40`(ref 7c9d45ca) · `f1826a35`(ref 41f96670).
- ⛔ 폐기: 한글텍스트 baked 커버 `6cfb9b57`(검증불가) · 1:1 영상 `f2899def`(사이즈 틀림).

---

## 8. 자동화 인프라 (CLAUDE.md 상세)
- 앱: mine-ai-team.vercel.app (GitHub kangtais-sys/mine-ai-team). **무인 핵심 = Vercel cron**(항상 켜짐, D-3까지 채움).
- 발행: KR=Zernio API(즉시) / US=egress 확정 후. **인스타 자동응대=100% Zernio**(api/webhooks/zernio.js, api/cron/inbox.js만 수정 — instagram.js 미사용·수정금지).
- Zernio 프로필 ID: millimilli.kr=`69fbfc1992b3d8e85f86d277` · millimilli.us=`69fbfd0692b3d8e85f86d882` · lala_lounge_=`69fca4b192b3d8e85f8cfea6`.
- 데이터: 올리브영 시트 `1FyoWviFOuibMBBZcIuvBAcziEhcxCgoDOhVHvN6xMxU` · GA4 analytics scope 미포함(403, 토큰 재발급 필요) · TikTok API 심사중 · 카페24 심사중.
- 영상 자동화 미결: 카드형=앱 cron 가능 / 영상=A반무인 or B서버렌더(Remotion·ffmpeg) 결정 대기.

## 9. 다음 세션 일 순서
1. **§5 완성본 정의 확정**(A/B/C) — MINE에게 첫 질문.
2. 확정 포맷으로 **9:16 SET 1개 제대로 완성**(트렌드 실스캔→7요소→9:16 비주얼/영상→QA) → MINE 승인으로 기준 확정.
3. 그 SET 형식·키워드 로테이션을 **Vercel cron + Higgsfield API**에 박아 매일 자동(보드 review 시드, 자동발행 X). 영상 한계분은 캡컷/UGC 라우팅.

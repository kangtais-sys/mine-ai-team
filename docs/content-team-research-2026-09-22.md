# 콘텐츠팀 대시보드 — 사전 학습 기록 (2026-09-22)

> 목적: MINE AI를 **밀리밀리 콘텐츠 팀**으로 전환하기 전, 기존 자산·성과·한계를 실측으로 확정.
> 원칙: 추측 금지. 아래는 전부 **코드/API/실파일 직접 확인**한 값.

---

## 1. 현재 살아있는 것 (실측 확인)

| 항목 | 상태 | 근거 |
|---|---|---|
| 앱 | 🟢 라이브 | mine-ai-team.vercel.app (무인증 공개, 2026-06-20 로그인 제거) |
| 콘텐츠 보드 | 🟢 오늘도 생성 중 | `GET /api/creator/calendar?week=2026-09-22` → us_tt 카드뉴스 draft 실존 |
| Meta 광고 API | 🟢 연결됨 | `GET /api/agents/ad-winners` → 37건 반환, 썸네일 URL 포함 (응답 27초) |
| Vercel cron | 🟢 24개 가동 | carousel-daily(22:00) · shorts-daily(*/15) · ad-optimize(04:00) 등 |
| 발행 | 🟢 KR / 🔴 US 일부 | Zernio: kr_ig·kr_tt·us_ig 자동 / us_tt 계정없음 → 드라이브 수동 |
| 마지막 커밋 | 2026-07-14 | 2개월 이상 코드 정지, cron만 자동 가동 중 |

## 2. 콘텐츠 보드 데이터 모델 (`creator_drafts`, version `milli-v1`)

```
{ id, version:'milli-v1', channel:'kr_ig|kr_tt|us_ig|us_tt', region:'kr|us',
  platform:'instagram|tiktok', date:'YYYY-MM-DD', slotType, format:'cardnews|reel|shorts',
  status:'draft|generating|review|approved|scheduled|published|failed',
  caption, hashtags, mediaUrl, mediaUrls[], refUrl, scheduledLocal, scheduledAt, publishResult }
```

**구조적 결손 3가지 (이번 기획이 메워야 할 것):**
1. **유튜브 숏츠 채널 없음** — 채널이 IG·TikTok 4개뿐. YouTube는 n8n(드라이브→유튜브) 별도 경로.
2. **광고 소재 트랙 없음** — 보드는 100% 오피셜 SNS 게시물. Meta 소재는 보드 밖(Cowork가 브라우저로 직접 제작).
3. **성과 필드 없음** — published 이후 조회/댓글/저장/ROAS가 draft에 안 붙음. 제작과 성과가 끊겨 있음.

## 3. Meta 광고 실성과 (last_30d, 2026-09-22 실측)

| 계정 | 소재 | 광고비 | 매출 | ROAS |
|---|---|---|---|---|
| 인하우스 | 자사몰_9월슈퍼위크_Test_0920 | 512,564 | 2,629,200 | **5.13** |
| 인하우스 | 자사몰_9월슈퍼위크_Test_0920 | 87,110 | 275,100 | **3.16** |
| 인하우스 | [AUTO] MM-KR-AMP-BA-WIDE-260819-02 | 73,728 | 100,000 | 1.36 |
| 인하우스 | [주름test] 자사몰 전환광고_외국인 | 54,409 | 73,500 | 1.35 |
| 인하우스 | [AUTO] MM-KR-AMP-GLA-MACRO-260819-03 | 18,083 | 18,500 | 1.02 |
| 인하우스 | [AUTO] MM-KR-AMP-GLA-MIRROR-260819-04 | 135,923 | 108,690 | 0.80 |
| 인하우스 | 자사몰_9월슈퍼위크_Test_0920 | 244,910 | 22,000 | 0.09 |

**정직한 결론 3개:**
- **ROAS 300%(3.0x)를 넘긴 소재는 지금 딱 2개.** 둘 다 사람이 만든 9월 슈퍼위크 소재.
- **[AUTO] 자동 생성 소재(8/19, 앰플 5종)는 전부 1.36 이하.** 자동 = 아직 목표 미달이 실측치.
- **ROAS 0 계정은 소재 문제가 아니라 계측 문제.** 올리브영(트래픽 캠페인)·밀리밀리_한국(스마트스토어)은 Meta 픽셀 전환 귀속이 안 됨 → **같은 잣대(ROAS 300%)로 평가 불가.** 이 계정들은 CTR·CPC 등 대리지표로 봐야 함.

**기존 소재 네이밍 규칙 (이미 쓰고 있음 — 분류 체계의 뼈대로 그대로 씀):**
```
MM - KR - OY  - MST - 01 - MAC
MM - KR - AMP - BA  - WIDE - 260819 - 02
브랜드-시장-채널/목적-제품-앵글-포맷-날짜-순번
  제품: MST(미스트) AMP(앰플) SET(세트)
  앵글: BA(비포애프터) GLA(글래스스킨) CLI(클리니컬)
  포맷: MAC(매크로) MIRROR CLOSE WIDE DRY TOP BLK INS PAN
```

## 3-2. 🇺🇸 미국 광고 — 지금 돌고 있음 (Meta 광고 라이브러리 실측 2026-09-22)

> 앱에는 **미국 광고 계정이 하나도 안 물려 있어서** `ad-winners`가 전혀 못 봄. 광고 라이브러리(공개)로 직접 확인.

- **광고주**: `millimilli.us` 페이지 · **~15건, 거의 전부 활성** · **전원 2026-09-17 게재 시작** (US 런칭 6일차)
- **랜딩: 아마존** (`amazon.com`) — 자사몰 아님. 일부는 노출 <100 (예산 분산 테스트 중)
- **포맷: 대부분 영상.** 앰플 2건만 정적 이미지
- **제품**: 500 Dalton Protein Mist `$14.99` / Glass Ampoule `$15.99`
- **오퍼**: Sep 7–30 first 100 orders — 미스트 구매 시 Collapy 3D Mask($19) 무료 / 앰플 Subscribe&Save 10%↓
- **클레임(US 전용 수치)**: 24h 수분 **+316.48%** · 팔자 **−21.10%** (22명, 43–64세, 4주, 2회/일, The K Dermascience, p<0.05) · 앰플 탄력 +4.18%, 모공주변 +4.8% (20명)
- **소셜 프루프**: 4.2★ 206→218 reviews · 1,000+ bought last month · Top 100 in Face Mists · #1 Olive Young Korea
- **컴플라이언스**: 전 소재에 `Created with AI` + `Individual results may vary` 명시됨 (지켜지고 있음)
- **비활성 1건**: `Beauty/skincare diaries` 인플루언서 브랜디드 콘텐츠 (2026-05-19, 23시간) — whitelisting 시도 흔적

**US 훅 패턴 (실제로 돌고 있는 것 — 여기서 학습해야 함):**
| 레버 | 실제 카피 |
|---|---|
| **필러 회피 서사 (지배적)** | "Years of fillers — and this is what finally softened my smile lines." · "Skipped the filler for my smile lines and tried THIS instead 👀" · "Went for smile-line fillers. Left with regret" · "no needles, no clinic" |
| 권위 대리인 | "A nurse who already priced facelift consults found this instead." |
| 상황극 | "Mid-flight, the flight attendant asked what I was spraying." |
| 게이트키핑 | "The Korean actress smile-line secret I was gatekeeping." |
| 반전·측정 | "Smile lines softened 21.10% in 4 weeks — **measured, not promised**." |
| 밈 톤 | "Ain't no way this Glass Ampoule has 100 ingredients 💀" |

### ⚠️ 이 발견이 설계를 바꾸는 지점 2가지
1. **US는 ROAS 300% 측정이 구조적으로 불가능.** 랜딩이 아마존이라 Meta 픽셀이 구매를 못 받음. Amazon Attribution을 붙이지 않는 한 Meta는 **클릭까지만** 안다. → US 합격선은 별도 지표(CTR·CPC·아마존 BSR·리뷰수 증가)로 가야 함.
2. **KR과 US는 소재 문법이 완전히 다름.** KR=자사몰 1+1 24,900원 / US=아마존 $14.99 + 사은품 + 임상 수치 + 필러 대비 서사. **같은 템플릿으로 찍으면 안 됨.**

## 3-3. Meta 광고 계정 전체 인벤토리 (광고관리자 실측 2026-09-22)

> 앱은 5개만 알고 있었고, `META_AD_ACCOUNTS` 파싱 버그 탓에 **실제로는 3개만 조회**하고 있었음. 실제는 11개.

| 포트폴리오 | 계정 | ID | 앱 등록 |
|---|---|---|---|
| 랄라라운지오피셜 | **밀리밀리_US** | **`1019588217240709`** | ❌ **누락 — 이게 미국 계정** |
| 랄라라운지오피셜 | 밀리밀리_인하우스 | `2327868604313508` | ✅ |
| 랄라라운지오피셜 | 밀리밀리_한국 | `791241442793311` | ✅ |
| 랄라라운지오피셜 | 밀리밀리_한국_올리브영 | `623851980786807` | ✅ |
| 랄라라운지오피셜 | 랄라라운지_한국 | `855116430496295` | ⚠️ env에만(버그로 미적용) |
| 랄라라운지오피셜 | 엠마워시_오피셜 | `864303894888410` | ⚠️ env에만(버그로 미적용) |
| 밀리밀리 글로벌 | Collaborative ads_MILLI… | `2108817439486566` | ❌ |
| 밀리밀리 글로벌 | 밀리밀리_일본 | `1628402194365775` | ❌ |
| 밀리밀리오피셜 | 밀리밀리_오피셜광고계정 | `1328902060959344` | ❌ |
| 기타 자산 | 유민혜(개인 IG 트래픽) | `604916716607098` | ❌ |
| 기타 자산 | — | `446602882091063` | ❌ |

### 밀리밀리_US 실성과 (2026-09-17~21, 5일)

**광고 643개 등록 / 활성 6개** · ⚠️ **청구 통화 = KRW** (미국 계정인데 원화)

| 소재 | 링크클릭 | CPC | 일예산 |
|---|---|---|---|
| [AUTO] US_AMP_GLASSKIN_0820 | 3,028 | ₩340 | ₩207,360 |
| [AUTO] REUSE_LINES_FADING_0911 | 2,158 | **₩220** | ₩100,000 |
| REVIVE_B_1 | 1,940 | ₩283 | ₩216,000 |
| [AUTO] REUSE_FLIGHT_GLASS_0911 | 371 | ₩241 | ₩100,000 |
| [AUTO] US_AMP_GLASS5_260809 | 166 | ₩559 | ₩155,520 |
| REVIVE_A_1 | 101 | ₩284 | ₩216,000 |
| **합계/가중평균** | **7,764** | **₩292 ≈ $0.21** | ₩994,880/일 |

**US 소재 네이밍은 KR과 다른 체계**: `REVIVE_A_1` · `[AUTO] US_AMP_GLASSKIN_0820` · `[AUTO] REUSE_FLIGHT_GLASS_0911`
(`REUSE_` = 재사용 소재, `US_AMP_` = 미국 앰플, 접미 = 날짜)

### ⚠️ 합격선 재설정 필요
평균 CPC **$0.21**로, 앞서 제안한 합격선 **$0.75를 6개 소재 전부 통과**함(최악 $0.40). **변별력이 없어 기준으로 못 씀.**
→ 아마존 전환율 실측 후 재설정하거나, 절대선이 아닌 **분포 기준(중앙값·하위 25%)** 으로 가야 함.

### 아마존 매출 (SP-API 복구 후 실측)
`2026-09: 주문 1,163건 · $20,084.45` (2026-08 이전 전부 0 — 9월이 US 첫 달) · 객단가 ≈ $17.27
미스트 BSR `Face Mists #71`
⚠️ 이 매출에는 오가닉 + 아마존 스폰서광고 + Meta 유입이 전부 섞여 있음 — **Meta 기여분 분리 불가**.

## 3-4. 배선 수정 후 라이브 실측 (2026-09-22, 배포 22cebdd + objective 수정)

### 광고비의 89%가 ROAS 판정 불가 영역
```
이번달 총 광고비        ₩19,071,490
 ├ 귀속가능(자사몰 전환)  ₩2,009,187  →  매출 ₩3,226,990  →  ROAS 1.61   ← 11%
 └ 귀속불가(아마존·트래픽) ₩17,062,303                                    ← 89%
```
> 판정 가능한 영역조차 **ROAS 1.61로 목표 3.0 미달.** 3.0을 넘은 소재는 `자사몰_9월슈퍼위크` 2건뿐.

### 미국 소재 CPC 분포 (82개, 클릭 72,485, 지출 $13,512)
`최저 $0.08 · 중앙값 $0.19 · 상위25%선 $0.23 · 최고 $0.39` (평균 $0.186)

| 잘 사는 소재 TOP5 | CPC | CTR |
|---|---|---|
| US_MM_DUO_PAYBACK_0825_ravefiller | **$0.08** | 11.43% |
| [AUTO] AMP_BA_PORE_260811 | $0.09 | 7.89% |
| [AUTO] MM-MST-GLOW1-260902-C | $0.09 | 1.09% |
| [AUTO] REUSE_FLIGHT_GLASS_0911 | $0.10 | **14.67%** |
| US_MM_DUO_PAYBACK_0825_storytease | $0.11 | 8.25% |

| 비싸게 사는 소재 BOTTOM5 | CPC | CTR | 지출 |
|---|---|---|---|
| [AUTO] MM-MST-GLA-MACRO-260828-07 | $0.32 | 2.05% | ₩28,564 |
| [AUTO] MM-MST-HRZ-C-45-260902-18 | $0.32 | 1.70% | ₩49,056 |
| [AUTO] MM-MST-SGL-C-45-260902-06 | $0.33 | 1.60% | ₩76,073 |
| 새 트래픽 광고 | $0.34 | 3.30% | ₩43,591 |
| **[AUTO] US_MIST_POV_GLOW_260716** | **$0.39** | 4.67% | **₩1,021,952** |

> ⚠️ **미국에서 가장 돈을 많이 쓴 소재(₩102만)가 CPC 최악.** 예산이 성과와 반대로 붙어 있음.
> ⚠️ CPC와 CTR은 따로 논다 — `MM-MST-GLOW1`은 CTR 1.09%인데 CPC $0.09(싼 CPM),
>    `REUSE_FLIGHT_GLASS`는 CTR 14.67%인데 CPC $0.10. **CTR만 보면 오판한다.**

### 합격선 확정 — 시장별로 다르게
| | 기준 | 근거 |
|---|---|---|
| KR 자사몰 (OUTCOME_SALES) | **ROAS ≥ 3.0** | 픽셀 귀속 정상 |
| US 아마존 | **CPC ≤ 중앙값 $0.19** / 하위25%($0.23 초과)는 교체 | 절대선 $0.75는 전부 통과해 변별력 0 |
| KR 올리브영·스마트스토어, 트래픽 캠페인 | **판정 제외** | 구조적으로 전환 미귀속 |

### 토큰 권한 미부여 계정 4개 (`ads_read` 없음 — 조회 불가)
`랄라라운지_한국` · `엠마워시_오피셜` · `밀리밀리_오피셜광고계정` · `Collaborative ads_MILLI`
→ 필요해지면 비즈니스 설정에서 앱에 권한 부여 필요. 현재 범위(밀리밀리 KR/US)엔 영향 없음.

### 성능
계정 3개 27초 → **계정 8개 5초.** (썸네일을 계정별 12페이지 크롤 → 선별분 배치 1콜로 교체)

## 4. Cowork 제작 메타 소재 = 디자인 시스템 (실파일 확인)

- **미스트 US**: `~/mist-ad-c1*.png` 15종 반복 (6/20~6/27)
- **앰플 6컨셉**: `~/amp-{1-beforeafter,2-clinical,3-promo,4-ingredient,5-glass,6-authority}.png` (8/9)

**공통 시각 문법 (재현 대상):**
1. 우상단 `milli²` 워드마크 고정
2. 초대형 볼드 헤드라인 + **손그림 동그라미 강조** (앱 `render-card`에 이미 구현됨 — roughEllipse)
3. 우측 권위 배지 2단: `TOP 100 AMAZON` (검정 원) / `#1 OLIVE YOUNG` (흰 원)
4. 클리니컬 수치 배지 (`35.81% SMILE LINES↓`)
5. 하단 **블랙 오퍼 밴드** + 가격 (`1&1 Get it $20 → $14`) + 실제 제품컷 합성
6. 최하단 8pt 근거 각주 (`Clinical test · TheK Dermatology Research Center · 20 participants`)

> ⚠️ `amp-2-clinical.png`은 본문 텍스트가 배지 뒤로 잘림(오버플로 버그). 자동화 시 재현 금지.

## 5. 오피셜 vs 소재 — 실제로 뭐가 다른가 (기존 문서에서 확정된 선)

| | 오피셜 SNS (millimilli.kr/.us) | 메타 광고 소재 |
|---|---|---|
| 1순위 KPI | **댓글 100 / 저장 / 공유** | **ROAS / CVR** |
| 톤 | 정보성이 주(主), **제품 은근히 1곳** | 오퍼·가격·권위 배지 전면 |
| 판매 톤 | **금지** ("광고로 보이면 실패") | **필수** |
| 필수 장치 | 궁금증 갭 + 대세감 둘 다 | 3초 후킹 + 증거 + CTA |
| 근거 | CLAUDE.md KPI 규칙 | owner-conversion-ad-spec.md |

## 6. 재사용 가능한 자산 (다시 만들 필요 없음)

- `api/agents/ad-winners.js` — Meta 소재별 ROAS·CTR·CVR·썸네일 (**성과 모니터링의 심장**)
- `api/creator/render-card.js` — 손그림 동그라미·한글 어절 분할·Pretendard 렌더러
- `api/creator/render-ad.js` — 오너 후킹 전환 광고 1080×1350 합성기
- `api/creator/calendar.js` — 보드 CRUD + Zernio 발행
- `api/creator/overlay-short.js` — 릴스 자막·엔드카드 합성
- `docs/shorts-format-library.md` — 바이럴 릴스 8포맷 + 4비트 아크
- 제품/얼굴 Higgsfield media_id 30종 (HANDOVER.md §3)

## 7. 알려진 한계 (숨기지 않음)

1. **Higgsfield CDN egress 차단** → 생성 이미지 픽셀을 코드가 직접 검증 못 함. 눈검증 필요.
2. **제품은 AI 생성 금지** — 라벨 왜곡. 실제 제품컷만 합성 (2026-06-12 검증 완료).
3. **메타 광고 라이브러리·틱톡 트렌드 = 공식 API 막힘** → 브라우저 스캔(반자동)만 가능.
4. **GA4 403** — GOOGLE_REFRESH_TOKEN에 analytics scope 없음. 자사몰 전환 정밀 추적 불가.
5. **`ad-optimize.js` ROAS 계산 버그** — `actions`(구매 건수)를 매출로 씀. `action_values`가 맞음 (`ad-winners.js`는 올바름).
6. **US TikTok 자동발행 불가** — Zernio 계정 없음. 드라이브 수동.

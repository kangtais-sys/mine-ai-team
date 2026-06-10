# 월요일 US 카루셀 — 콘텐츠 작성 스펙 (재현용 · 매주 동일하게)

> 작성: Cowork · 채널: millimilli.us (Instagram). 매주 월요일 이 스펙대로 생성.
> 상위 규칙은 `CLAUDE.md`의 「🎯 콘텐츠 목표·KPI (절대 규칙)」를 따른다(가치 먼저·제품 은근히·실제 후기 캡처·댓글/공유/저장 유발).

## 0. 한 줄 요약
실제 유용한 **"베이스 안 들뜨는 5가지 실수/꿀팁"** 정보 카루셀. 제품은 1곳에만 은근히, **실제 아마존 후기 스크린샷**으로 신뢰, 마지막에 **댓글→DM·추첨·구독** 장치. 7장, 9:16 카드(1080×1350).

## 1. 슬라이드 구조 (7장, 항상 이 순서)
1. **커버(히어로 훅)** — eyebrow 핀(`MAKEUP ARTIST SECRET`) + 초대형 훅(`Makeup pilling by noon?`) + 짧은 서브(`5 fixes — and #1 isn't your foundation.`) + 우측 세로 인물 이미지(핀터레스트 캡처 + `via Pinterest`).
2. **Mistake 1 — thirsty skin (제품+후기 증거, reviewshot)** — 헤드라인 + 본문에 **제품 은근히**(`fast-absorbing mist`) + **실제 아마존 후기 스크린샷**(framed) + 출처(`Amazon US · verified buyer · 4.8★ (N)`) + footnote(`a 500-Dalton-size mist sinks in seconds`).
3. **Mistake 2 — you rushed** (imageRight, 글래스스킨 핀) — "skincare 60초 흡수 후 base".
4. **Mistake 3 — too much** (imageLeft, 메이크업 베이스 핀) — "thin layers, press not rub".
5. **Mistake 4 — formula clash** (textBig, 대형숫자 `04`, 이미지 없음) — "water vs silicone ball up".
6. **Mistake 5 — set it damp** (imageRight, 광채 핀) — "damp sponge, press not drag".
7. **참여(블랙)** — `Which one are you guilty of?` + **댓글→DM**(`Comment your number 1–5 and I'll DM you the full prep guide.`) + **GIVEAWAY**(`Every month, one commenter wins a full 500 Dalton series set.`) + 저장·공유 한 줄 + CTA `Follow for more tips →`.

## 2. 레이아웃 변주 규칙 (지루함 방지)
- 한 카루셀에서 같은 레이아웃 반복 금지. 변주 풀: `cover(hero)`, `imageRight`(텍스트좌/이미지우), `imageLeft`(미러), `textBig`(대형 고스트 숫자·이미지 없음), `reviewshot`(후기 프레임), `engage`(블랙).
- 본문 **리치텍스트**: `**강조**`=볼드(900), 나머지=라이트(400). ⚠️ **볼드 단어 바로 뒤에 마침표/쉼표 두지 말 것**(satori richText가 부호를 띄움 → "skin ," 처럼 보임). 부호 앞 단어는 비볼드로.
- 직각(borderRadius:0), 모노크롬 블랙/화이트, 하단 푸터 좌측 = `THE 500 DALTON RULE`, 우측 = `milli²`.

## 3. 이미지 규칙 (실사 우선 + 핀터레스트/힉스필드 믹스)
- **후기·증거 = 실제 캡처만**. 아마존 US 리뷰 페이지에서 makeup/pilling/absorb 관련 **실제 리뷰를 스크린샷 캡처**(커서 빼고). 렌더한 가짜 후기 카드 금지.
- **비후기 illustrative 이미지** = 실사 우선, 없으면 **핀터레스트 캡처**(검색: `dewy glass skin`, `makeup base`, `glowy skin closeup`) 또는 Higgsfield 생성. 각 이미지에 **작은 출처**(`via Pinterest`) 좌하단 칩.
- 핀 캡처는 세로(portrait)라 **세로 이미지 박스**(cover 380×880, imageRight/Left 360×820)에 배치(가로 풀블리드 박스는 핀 해상도상 흐려짐).
- 시장 클레임 혼용 금지: US는 `4.8★(현재 리뷰수)`, `30+ proteins`, `under 500 Daltons → dermis`, `Collagen Water 431,964ppm`(아마존 실측값). KR 클레임(올리브영·984ppm·29가지) US에 쓰지 말 것.

## 4. 캡션 (US · 매주 동일 톤, 수치/후기만 최신화)
```
Save this if your makeup keeps pilling 📌

It's almost never your foundation — it's prep. 5 fixes a makeup artist actually uses:

1. Hydrate first — dry skin grabs makeup. A fast-absorbing mist helps (verified Amazon buyers say their foundation doesn't pill with one on)
2. Let skincare absorb a full 60 sec before base
3. Thin layers — press, don't rub
4. Don't mix clashing formulas (water vs silicone)
5. Set with a DAMP sponge — press, don't drag

👉 Comment your number 1–5 and I'll DM you the full prep guide.
🎁 GIVEAWAY: every month I pick one commenter to win a full 500 Dalton series set.
📌 Save this for your next face · send it to a friend whose base always pills.
Follow for more skin + makeup tips.
```

## 5. 해시태그 (고정 세트 + 토픽 1~2 로테이션)
고정: `#makeuptips #foundationpilling #makeupprep #glassskin #beautytips #koreanskincare #500dalton #milli`
로테이션(주제 따라 1~2개): `#dewyskin #makeuphacks #baseprep #nopilling #facemist #kbeauty`

## 6. 렌더 방법
- 로컬 참조 렌더러: `docs/render_monday.mjs`(satori + @resvg). 슬라이드 JSON(SLIDES) 수정 → `node render_monday.mjs` → `monday_us_FINAL_01~07.png`.
- 프로덕션(앱)으로 자동화하려면 `api/creator/render-card.js`(§7)에 **본 스펙의 슬라이드 타입 추가 필요**: `reviewshot`(실제 후기 이미지 프레임), `engage`(댓글/추첨/구독 블랙), info `variant`(imageRight/imageLeft/imageTop/textBig), `framedImage`(이미지+출처 크레딧). → Claude Code 작업.

## 7. 매주 갱신 체크리스트
- [ ] 아마존 리뷰수(N)·실측 수치 최신화(리뷰 페이지 재확인).
- [ ] 후기 슬라이드: 이번 주 makeup/pilling 관련 **새 실제 리뷰** 캡처(같은 것 반복 금지면 교체).
- [ ] 핀터레스트 이미지 4컷 새로 캡처(중복 방지, 출처 칩 유지).
- [ ] 캡션 수치·후기 인용 최신화, 해시태그 로테이션 1~2개 교체.
- [ ] KPI 점검: 댓글 유발 질문·DM 유도·추첨·저장·공유·구독 모두 포함됐는가.

## 8. KR 버전 (millimilli.kr) — 동일 구조, 시장만 교체
- 구조·레이아웃·참여장치(댓글→DM·추첨·구독)는 US와 동일. **언어=한국어, 시장 클레임=KR**.
- **시장 클레임(US와 혼용 금지)**: `올리브영 1위`, `단백질 29가지`, `함량 984ppm`, `MOLECULAR 500da`. (아마존 4.8★·431,964ppm 쓰지 말 것.)
- **후기 = 올리브영 실후기 캡처**: 제품 goodsNo `A000000255334` (밀리밀리 500달톤 프로틴 콜라겐 미스트 55ml, ★4.9·리뷰 97건). 리뷰 탭에서 "화잘먹/흡수/메이크업" 관련 실후기 스크린샷(커서 빼고). 가짜 카드 금지.
- **한글 렌더 주의**: ① mono 라벨/출처에 한글이면 Pretendard로(자동 폴백 적용됨). ② richText `**볼드**` 뒤엔 **공백+단어**가 오게, 문장부호는 **볼드 안쪽**에 넣어 띄움 버그 회피(조사가 볼드 단어에서 떨어지지 않게).
- 렌더러: `docs/render_monday_kr.mjs` (MARKET='kr', 올리브영 후기, 한글 SLIDES). 핀터레스트 이미지는 시장 무관이라 재사용 OK.

### KR 캡션
```
파데 들뜸, 사실 파데 탓이 아니에요 🙅‍♀️ (저장 필수 📌)

베이스 안 무너지는 5가지 — 메이크업 아티스트가 진짜 쓰는 법:

1. 속건조부터 잡기 — 건조하면 화장이 떠요. 빠르게 흡수되는 미스트로 결 정돈 (올리브영 실후기: "메이크업 전 쓰면 화장도 더 잘 먹어요")
2. 60초 기다렸다 베이스 — 스킨케어 덜 마른 채 올리면 밀려요
3. 얇게, 문지르지 말고 톡톡
4. 제형 충돌 주의 (수분 vs 실리콘)
5. 퍼프는 살짝 적셔서 — 끌지 말고 누르기

👉 댓글에 1~5 번호 남기면 풀 가이드 DM 보내드려요.
🎁 추첨: 매달 댓글 한 분께 500달톤 시리즈 풀세트 선물.
📌 저장해두고 다음 메이크업 때 · 파데 들뜨는 친구 태그.
관리 꿀팁 더 보려면 구독해요.
```
### KR 해시태그
고정: `#메이크업꿀팁 #파데들뜸 #속건조 #화장잘먹는법 #베이스메이크업 #밀리밀리 #500달톤 #올리브영`
로테이션: `#물광피부 #프로틴미스트 #메이크업베이스 #화잘먹 #국민미스트`

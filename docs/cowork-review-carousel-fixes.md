# Cowork 지시 — 실후기 카루셀 (월/금) 수정·변주 (2026-06-15)

> 배경: 실후기 카루셀은 Cowork 샌드박스가 **render-card 로직을 복사한 로컬 스크립트**(예: render_monday_kr.mjs)로 렌더 → 로컬 PNG → 업로드. 앱 egress 차단이라 배포 render-card 를 못 부름. **그래서 앱(render-card.js)에 적용한 수정이 Cowork 로컬 스크립트엔 자동 반영 안 됨.** 아래를 Cowork 로컬 렌더 스크립트에 직접 반영하고 **06-15부터 다시 렌더**할 것.

## 1. 한글 줄바꿈 ('건조'→'건' 쪼개짐) 수정 — 필수
⚠️ **`wordBreak:'keep-all'`만으론 안 됨** — satori 렌더 엔진이 CJK에 keep-all을 안 먹여 음절 중간에서 쪼갬(검증됨). **단일 문자열 헤드라인을 어절(공백) 단위 노드로 쪼개 flexWrap 컨테이너에 흘려야** 단어 통째로 줄바꿈됨. (앱 render-card.js 에 `headlineText` 헬퍼로 반영 완료 — commit b933aba.)
```js
const headlineText = (s, { fontFamily = FONT, fontWeight = 700, fontSize, color = BLACK, lineHeight = 1.1, letterSpacing = -1, align = 'flex-start', marginTop } = {}) =>
  h('div', { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: align, ...(marginTop !== undefined ? { marginTop } : {}) },
    String(s ?? '').split(/\s+/).filter(Boolean).map(w =>
      txt(w, { fontFamily, fontWeight, fontSize, color, lineHeight, letterSpacing,
        marginRight: Math.round(fontSize * 0.24), marginBottom: Math.round(fontSize * 0.12) })));
```
→ 구 렌더러(renderCover/Info/Review/Cta)의 `txt(s.headline, …)` 5곳을 `headlineText(s.headline, …)`로 교체. 신규 포맷 렌더러는 이미 어절 분할이라 OK. (Cowork 로컬 복사본을 쓰면 거기에도 동일 적용.)

## 2. 마크다운 `**` 마커 노출 제거 — 필수
헤드라인에 `**진짜**` 같은 볼드 마커가 글자로 그대로 나옴. 위 `txt` 의 `.replace(/\*\*/g,'')` 로 제거(본문 richText 는 파싱 후라 영향 없음). 헤드라인엔 `**` 쓰지 말 것.

## 3. 후기 캡처 잘림 수정 — 필수
- 실제 후기 스크린샷은 **반드시 `reviewshot` 타입**으로(`objectFit: 'contain'` = 전체 보임).
- cover/info 슬라이드의 일반 이미지 슬롯(`objectFit: 'cover'` = 크롭)에 **후기 캡처를 넣지 말 것.** 넣으면 잘림.
- info 이미지에도 후기류 넣을 거면 `objectFit: 'contain'` 으로.

## 4. 커버 디자인 변주(4종) 적용 — 매번 같은 표지 금지
carousel-daily 처럼 커버 레이아웃 4종을 로테이션:
- `cover_fullimage`(풀이미지+하단훅) / `cover_split`(좌사진·우텍스트) / `cover_number`(초대형 숫자+사진) / `cover_textonly`(흑배경 타이포, 이미지 없음)
- 일자/콘텐츠별로 돌려가며 사용(연속 같은 타입 금지).

## 5. 본문 도표 변주 — 같은 막대도표 반복 금지
- stat(초대형 숫자) / compare(막대 비교) / steps(번호 리스트) / textBig 등을 **서로 다르게 섞을 것**. 같은 visual 2장 연속·매 콘텐츠 동일 패턴 금지.

## 6. 장수·밀도
- 총 7~8장(커버1 + 본문5~6 + 마무리1). 본문은 "저장각" 구체정보(수치·메커니즘·실전팁). 빈약한 한 줄 금지.
- 근거 없는 수치/인원("N만명이 확인"·"전문가 N명") 단정 금지. 효능 단정(다크서클 제거 등) 금지 — 입증 범위(보습·장벽·결).

## 7. 06-15 재생성 + ⚠️ 보드 갱신까지 필수
- 위 1~6 반영해 06-15 실후기 카루셀을 다시 렌더.
- ⚠️ **로컬 PNG 렌더만 하면 보드에 반영 안 됨.** (2026-06-15 실측: Cowork가 고쳤다는데 보드 06-15 review_hook 드래프트는 updatedAt=06-13 그대로 = 옛 카드 = "건조" 쪼개짐 그대로 떠 있음.)
- 반드시 **(a) 고친 카드 PNG를 Vercel Blob에 업로드 → (b) 06-15 review_hook 드래프트 4채널(kr_ig/kr_tt/us_ig/us_tt)의 `mediaUrls`를 새 Blob URL로 교체(update)** 까지 할 것.
  - 기존 업로드/시드 경로(ingest 등)를 그대로 써서 보드 드래프트의 mediaUrls 가 새 URL로 바뀌어야 함. updatedAt 이 갱신되어야 반영된 것.
- 갱신 후 알려주면 앱에서 화면으로 재검증함.

## 7-b. ⚠️ 실후기 요일 = 월·금 (화 금지)
- 실후기(review_hook) 카루셀은 **월요일 + 금요일** 주 2회만. (Cowork `milli-realreview-carousel`)
- 실측 버그(2026-06-15): 실후기가 **월+화**로 생성돼 금요일이 비고 화요일이 3종(정보성+실후기+릴스)으로 겹쳤음. → 앱에서 화 06-16 실후기 4채널을 금 06-19로 수동 이동해 정리함.
- **Cowork 실후기 스케줄을 월+금으로 고정**할 것(화요일 생성 금지). 화요일은 정보성(Cowork)+릴스만.

## 9. (권장) 슬라이드 원문 저장
- 보드 드래프트에 `slides`(텍스트 원문)도 같이 저장하면, 이후 앱에서 재베이킹·텍스트 수정이 가능해짐(현재 미저장이라 앱 재베이킹 불가).

---
참고: 앱 쪽 render-card.js 에는 위 1·2·3 이 이미 반영됨(carousel-daily 정보성 카루셀). Cowork 로컬 스크립트가 그 최신 렌더 함수를 그대로 복사해오면 드리프트 방지됨.

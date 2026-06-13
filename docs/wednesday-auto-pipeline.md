# 수요일 프로모 — 무인 파이프라인 스펙 (구조2: 스케줄 브라우저 → 앱 렌더)

> 목적: 매주 수요일 프로모 카루셀(US 아마존 / KR 올리브영)을 **사람 중계 없이** 보드까지 자동 생성.
> 상위 규칙: `CLAUDE.md`「콘텐츠 목표·KPI」 + `docs/wednesday-promo-spec.md` 준수.
> 결정 근거(2026-06-10 입증):
>  - **US 아마존**: bare curl 스크래핑이 캡차로 막힘. 공식 API(SP-API/PA-API) 미보유 → **실세션 브라우저로만 추출 가능**(구조2).
>  - **KR 자사몰(millimilli.kr)**: 유민혜 storefront → **캡차 없음**. cafe24 상세는 서버렌더(가격/옵션/혜택이 초기 HTML에 있음) → **앱(Vercel) 서버 fetch로 브라우저 없이 가능성 높음(구조1-style)**. 미스트는 product_no=248 고정.
>  - 이미지 CDN 직링크(m.media-amazon.com / millimilli.kr/web/product)는 200 도달. 렌더는 CDN 닿는 곳(Vercel)에서.
>  - ⚠️ Cowork 브라우저 하네스는 **쿼리스트링(?product_no=) 데이터 반환을 차단** → KR 제품 URL은 상수(248)로 박고, 이미지는 경로기반이라 무관.

## 능력별 역할 분담 (왜 둘로 나누나)
| 단계 | 필요 환경 | 누가 | 비고 |
|---|---|---|---|
| 1. 이미지 URL·오퍼 추출 | 실세션 브라우저(캡차 우회) | **Cowork 스케줄 작업**(브라우저 구동) | sandbox·서버 curl 다 막힘 |
| 2. 이미지 다운+카드 렌더 | CDN egress | **앱 엔드포인트(Vercel)** | sandbox는 CDN 못 닿음. 앱은 닿음(to-drive/render-card가 외부 fetch 함) |
| 3. 보드 시드 | 앱 | **앱(ingest)** | 기존 계약 재사용 |

이미지는 거의 안 바뀜 → **repo에 캐시**(아래 manifest), 매주 **오퍼만 재추출**. 이미지 URL은 매주 재검증(깨지면 자가복구).

---

## A. Claude Code가 "한 번" 만들 것 (앱)

### A-1. 렌더 엔드포인트 `POST /api/creator/render-promo`
- 인증: `Authorization: Bearer <CREATOR_INGEST_SECRET>` (ingest와 동일 시크릿).
- 입력 body:
```json
{
  "market": "us",                 // "us" | "kr"
  "date": "2026-06-10",
  "images": {
    "hero":   "<제품 히어로 URL>",
    "deal":   "<딜 슬라이드용 제품컷 URL>",
    "science":"<500달톤 흡수 그래픽 URL>",
    "proof":  "<사회적증거/리뷰 강조 URL>"
  },
  "offer": {
    "price": "$14.99",
    "bonus": "Free bonus item — buy 1 get 1 free gift",
    "rating": "4.9", "reviewCount": 34,
    "shipping": "Prime FREE delivery",
    "extra": null
  },
  "publish": false                 // true면 시드 후 자동발행 라우팅까지(기본 false=review만)
}
```
- 처리: ① images의 각 URL을 서버에서 fetch(버퍼) → ② **이미지-주도 프로모 5장 렌더**(아래 A-2) → ③ 각 PNG를 `POST /api/creator/ingest-capture`(base64, ≤4MB)로 올려 호스팅 URL 획득 → ④ `POST /api/creator/ingest`로 보드 시드:
  - `channel`: us→`us_ig`(+ 필요시 `us_tt`), kr→`kr_ig`(+`kr_tt`)
  - `mediaUrls`: [5장 호스팅 URL], `format`:"carousel", `slotType`:"wed_promo", `status`:"review"
  - `caption`/`hashtags`: 아래 A-3로 생성
- 출력: `{ ok:true, drafts:[{channel,id}], mediaUrls:[...] }`
- ⚠️ `CREATOR_INGEST_SECRET` env 누락 상태 → Vercel env에 설정 필요.

### A-2. 이미지-주도 프로모 렌더러 (월요일과 완전히 다른 디자인)
- 1080×1350 ×5. **월요일(`render_monday.mjs`=텍스트카드 에디토리얼)과 절대 같으면 안 됨.** 제품 사진이 화면을 지배하는 광고형.
- 슬라이드:
  1. **cover** — 제품 히어로 풀블리드 + 하단 오퍼밴드(증정/가격 크게). 3초 훅.
  2. **science** — 500달톤 흡수 그래픽 + "431,964 ppm / under 500 Da" 한 줄.
  3. **proof** — US-clean 갤러리 실사컷 + **실평점 오버레이(4.9★·34 Amazon reviews)**. ⚠️ KR 클레임(올영 No.1 등) 박힌 이미지 금지=시장혼용. 실집계 평점만(가짜 후기카드 금지). ※실후기 스크린샷 업그레이드는 별도(맥에서 캡처→캐시).
  4. **deal** — 제품컷 + 오퍼(가격·증정·배송). "광고 바로 걸 퀄."
  5. **cta+engage** — KPI 장치: 댓글 가르기("One mist, or two? 👇"), 친구태그, 저장, follow.
- 기술: 기존 앱 렌더 스택 재사용(satori+@resvg/resvg-js 또는 node-canvas — `api/.../render-card.js`와 동일 스택). 한글은 Pretendard.
- 오퍼 텍스트는 입력 `offer` 값만(지어내기 금지). KR/US 수치 혼용 금지.

### A-3. 캡션 생성
- 가치/관전 훅 + 실제 오퍼 + KPI 장치(댓글 가르기·친구태그·저장). 시장별 언어(US 영문 / KR 한글). 컴플라이언스(기능성 범위, AI 연출 시 명시).

---

## B. Cowork 스케줄 작업이 매주 할 것 (브라우저 추출 → POST)

매주 수 08:00. 스케줄 프롬프트가 마인맥북 크롬으로:
1. **US**(브라우저 필수 — 캡차): `https://www.amazon.com/dp/B0GYCB5164` 열고 아래 추출 JS 실행 → hero/deal/science/proof URL + 오퍼.
2. **KR**(자사몰 — 브라우저 불필요 권장): 캡차 없음 → **앱 서버가 직접 fetch**(아래 B-3). 브라우저 폴백 시: 홈에서 "500달톤 프로틴 미스트" 링크 클릭 진입(쿼리 URL 직접 핸들 금지) → 경로기반 이미지(`/web/product/big/`) + infoArea 오퍼 추출.
3. 각 시장 payload를 `POST /api/creator/render-promo`.
4. 결과(보드 드래프트 생성) 확인 후 유민혜에게 "검토 대기 N건" 통보.

### B-1. US 추출 JS (입증된 셀렉터)
```js
// 제품 갤러리 hi-res
const baseId = u => (u.match(/images\/I\/([^.]+)\./)||[])[1];
const gallery=[],seen=new Set();
document.querySelectorAll('#altImages img,#main-image-container img').forEach(i=>{
  const u=i.src; if(!u||!/media-amazon\.com\/images\/I\//.test(u))return;
  const b=baseId(u); if(b&&!seen.has(b)){seen.add(b);gallery.push('https://m.media-amazon.com/images/I/'+b+'._SL1500_.jpg');}
});
// A+ 콘텐츠(alt가 라벨): '500 dalton'·'ppm'=science, 'sold'·'bottles'=proof
const aplus=[],sa=new Set();
document.querySelectorAll('#aplus img,#aplus_feature_div img,.aplus-module img').forEach(i=>{
  const u=i.src||i.getAttribute('data-src'); if(!u||!/media-amazon/.test(u))return;
  const b=(u.match(/images\/[IS]\/([^.]+)\./)||[])[1]||u; if(sa.has(b))return; sa.add(b);
  aplus.push({alt:(i.alt||'').toLowerCase(), url:u});
});
const pickA = kw => (aplus.find(x=>kw.some(k=>x.alt.includes(k)))||{}).url;
// 오퍼
const t=s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\s+/g,' ').trim():null;};
const offer={
  price:(t('#corePrice_feature_div .a-offscreen')||'').split(' ')[0],
  bonus:(document.body.innerText.match(/free bonus item[^.]*/i)||[])[0],
  rating:(t('#acrPopover')||'').match(/[0-9.]+/)?.[0],
  reviewCount:+(t('#acrCustomerReviewText')||'').replace(/\D/g,'')||null
};
JSON.stringify({
  images:{ hero:gallery.at(-1), deal:gallery.at(-2), science:pickA(['500 dalton','ppm','dalton']), proof:gallery[4]||gallery[0] },
  offer
});
```
- ⚠️ **proof는 A+ 'sold/bottles' 그래픽 쓰지 말 것** — 거기 'No.1 Olive Young'(KR) 박혀 US 카루셀에 들어가면 시장혼용 위반. proof = **US-clean 갤러리 실사컷 + 실평점(offer.rating·reviewCount) 오버레이**. (렌더러 proof 슬라이드가 별점 오버레이 담당. 가짜 후기카드 금지=실집계 평점만.)
- 캡차 페이지면 `document.title`에 상품명 없음 → 그땐 중단·통보(빈 payload 보내지 말 것).

### B-2. 캐시
- 이미지 manifest는 repo에 보관. 매주 재추출값과 diff → URL 깨졌을 때만 갱신.
- 2026-06-10 실측: `docs/manifests/wed_us_image_manifest.json`, `docs/manifests/wed_kr_image_manifest.json`(유민혜 Downloads에도 사본).

### B-3. KR 자사몰 서버 fetch (브라우저 없이 — 권장 경로, Claude Code 검증)
- millimilli.kr는 캡차 없음 + cafe24 서버렌더 → **Vercel 함수가 `https://millimilli.kr/product/detail.html?product_no=248` 를 직접 fetch**해서 HTML 파싱:
  - 오퍼: `.infoArea`/`.xans-product-detaildesign` 텍스트에서 소비자가·판매가·할인%·1+1·당일발송·증정 추출(2026-06-10 값: 정가 38,000 → 1+1 24,900원 34%, 5만↑무료, 7만↑앰플증정, 관심 319,937명).
  - 이미지: `/web/product/big/...png`(경로기반). 메인컷은 small→big 치환. 상세 스토리컷(500달톤 흡수)은 `#prdDetail` 본문 HTML에서 `ec-data-src` 추출.
- **Claude Code 검증 필요**: 맥에서 `curl -A "Mozilla/5.0" "https://millimilli.kr/product/detail.html?product_no=248"` → 실제 HTML(가격·옵션 포함)인지 JS 셸인지 확인. 실 HTML이면 KR은 브라우저 없는 서버 cron(구조1)로 확정. 셸이면 B-2 브라우저 폴백.

---

## C. 배선 순서 (의존성)
1. **Claude Code**: A-1 엔드포인트 + A-2 렌더러 + A-3 캡션 빌드 → Vercel 배포 + `CREATOR_INGEST_SECRET` env 설정.
2. **검증**: 위 US payload(2026-06-10 실측값)로 엔드포인트 직접 호출 → 보드에 카루셀 5장 드래프트 뜨는지 + 월요일과 디자인 다른지 확인.
3. **KR 레그**: Claude Code가 자사몰 서버 fetch 검증(B-3). 실 HTML이면 KR=서버 cron(브라우저 불필요), 셸이면 브라우저 폴백.
4. **Cowork 스케줄 작업 생성**(엔드포인트 배포 후): 매주 수 08:00 — US는 브라우저 추출+POST, KR은 서버 fetch가 되면 앱 cron에 합치고 스케줄은 US만 담당.

## D. 발행 라우팅 (기존)
KR IG/TT = Zernio 자동 / US IG = 자동 / US TT = 수동→Drive(밀리밀리 US 수동발행). `status:"review"`로 시드 → 유민혜 검토 후 발행.

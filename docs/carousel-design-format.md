# 캐러셀 디자인 포맷 (milli² SNS) · ✅ 최종 확정 2026-06-13 (MINE 승인)

> MINE 시안 합의본. render-card.js 구현 기준. "감각적 에디토리얼 + 흑백 미니멀" — 정보 PPT 금지.
> 확정: 커버 4종(풀이미지/텍스트만/우텍스트/숫자형) · 본문 4종(적을때/많을때/텍스트만/풀이미지+캡션바) · 마무리=A(화이트 에디토리얼). 모서리=직각. 폰트=Noto Sans KR. 강조=두께(300/700, 900금지). 사인펜 동그라미=카드당 1·필요시. 로고=파일 작게.

## 타이포
- **폰트: Noto Sans KR** (현재 Pretendard → 교체). 한 종만, 명조·모노 혼용 금지.
- **강조는 "두께"로**: 본문/약함 = Light(300), 기본 = Medium(500), 강조 = Bold(700). ⚠️ 900은 과해서 700까지만.
- 헤드라인 letter-spacing 살짝 타이트(-0.3~-0.5).

## 컬러 (브랜드 흑백 + 사진만 컬러)
- 화이트 `#FFFFFF`, 블랙 `#0A0A0A`, 쿨그레이 배경 `#F7F6F4`, 보조텍스트 `#9A9A95`.
- ⚠️ 따뜻한 베이지 금지. **유일한 유채색 = 사진(피부톤·물광)**.

## 강조 장치 — 검정 사인펜 동그라미
- 브랜드 시그니처 = 낙서한 듯한 손그림 동그라미(roughEllipse). 검정(블랙 배경 위는 흰색).
- **"필요할 때만"·카드당 최대 1곳** — 핵심 키워드/숫자에만. 남발 금지.

## 로고
- **로고 파일을 작게**, 필요 시에만(보통 커버). milli²를 타이포로 박지 않음.

## 사진 = 일상룩 (네 레퍼 무드 그대로)
- 인물·실사 = brand-look 레퍼 무드로 생성(또는 핀터레스트 유사무드+출처). photoreal·다양한 사람.
- 사진 무드를 브랜드로 바꾸려 하지 말 것 — **틀(타이포)이 브랜드, 사진은 일상**.

## 사진 = 단일 레퍼 "거의 복제" 내추럴 실사 (✅ 2026-06-13 MINE 피드백)
- **레퍼 1장만**(블렌드 금지 — 여러 장 섞으면 글로시 "모델 화보"化). brand-look/제품에서 랜덤 1장.
- **custom_reference_strength 0.85~0.9**(인물 0.88·클로즈업/제품 0.85) — 레퍼 무드 거의 복제.
- 프롬프트 기조: "natural candid real photo, everyday natural background, authentic phone-camera/snapshot feel, NOT studio editorial/model shoot, photoreal skin texture, match the reference natural mood" (+키워드 무드). **글로시·플라스틱·올드 금지.**
- genCloseupPhoto(질감/제품)도 동일: 자연 실사 매크로, 단일 제품 레퍼, strength 0.85.

## 커버 소재 = 주제 적응 (항상 인물 X) (✅ 2026-06-13 MINE 피드백)
- genSlides 가 커버 슬라이드에 `photoSubject` ∈ ["person","product","texture","scene"] + `photoSubjectDetail`(주제 한 줄) 지정.
  주제가 인물 중심 아니면 product/texture/scene 선택. 예: 제형=texture, 휴대/파우치=product, 무드(해변/욕실)=scene, 사람 루틴/표정=person.
- attachPhotos 가 photoSubject 로 생성기 분기:
  - person → genDailyPhoto(단일 brand-look 레퍼, 인물 수 1인/2인/그룹 랜덤 변주).
  - product → genProductPhoto(제품 레퍼 PRODUCT_MIST, "파우치 안/책상 위" 일상 맥락 real photo).
  - texture → genCloseupPhoto(제형·질감 매크로, 인물 X).
  - scene → genScenePhoto(무드 씬, 키워드 맞춤, 레퍼 없이 프롬프트만, real photo).
- **대세감은 사진이 아니라 카피로도 가능**("요즘 다들"·"N만 저장") → 커버 인물 수 강제 금지.

## KR·US 통일 — 콘텐츠·사진 공유, 언어만 다름 (✅ 2026-06-13 MINE 피드백)
- 콘셉트·사진은 **1회만** 생성: KR 기준 genSlides('kr') → slides → attachPhotos(공유 이미지 1세트 주입).
- **US = 번역본**: translateSlidesToEn(slides) — 텍스트 필드(headline/body/sub/statLabel/steps[].t/compare.*/comment/share/emphasis/caption/hashtags)만 영어로(LLM 1회, claude-sonnet-4). type/num/stat(숫자)/image(공유 URL)/circle/visual/photoSubject 등 비텍스트는 그대로 복사. emphasis 는 번역된 headline 안 단어로.
- bake: KR slides→KR 카드, US(번역) slides→US 카드. **두 시장 모두 같은 image URL**.
- seed: kr_ig·kr_tt=KR mediaUrls, us_ig·us_tt=US mediaUrls.
- → 사진 생성 1세트로 축소(maxDuration 300s 여유), 번역 LLM 1회 추가.

## 본문 이미지 소싱 = 내용 타입별 (✅ 2026-06-13 갱신)
- **커버**(cover_fullimage/split/number) = 일상룩 인물 사진(여러 사람·대세감). genDailyPhoto(brand-look 인물 레퍼).
- **정보성 본문 = 데이터 비주얼(코드 렌더, 사진 X)**. 무관한 인물 사진 금지. 3종:
  - `body_stat` — 초대형 숫자(stat·240px·700) + 라벨 + 한 줄 설명. circle 플래그로 사인펜 동그라미.
  - `body_compare` — 좌(약·쿨그레이 #D6D7D9)/우(강·블랙) 비교 막대. 트랙 배경=쿨톤 #F7F6F4. compare:{left,leftVal,right,rightVal}. 수치 있으면 비율, 없으면 좌 0.4/우 1.0.
  - `body_steps` — 번호(700·SUB) + 텍스트(300/강조700) 리스트 2~4개. steps:[{n,t}] 또는 body 여러 줄.
- **질감·제형 본문(필요할 때만)** = `body_closeup`(또는 body_fullimage) 매크로 클로즈업 **생성(인물 아님)**. genCloseupPhoto = 제품 레퍼(PRODUCT_MIST) + closeupSubject(피부 질감/미스트 입자/세럼 제형). "extreme macro, NO face/no person, photoreal, 4:5".
- **후기** = 실후기 캡처(별도 flow, 이 포맷 범위 아님).
- LLM(genSlides)이 본문마다 `visual` ∈ [data_stat|data_compare|data_steps|closeup|none] 지정 → data_* 우선, closeup 은 질감 설명에만.

---

## 슬라이드 역할 (캐러셀 = 4~7장 흐름)
### ① 커버 (첫장)
- 목적: 3초 훅. 이미지 포워드.
- 레이아웃: **풀이미지 + 훅 1~2줄**(하단) / 또는 **텍스트만(흑배경)**. 로고 작게.
- 강조 키워드 1곳에 사인펜 동그라미 가능.

### ② 본문 — 내용 적을 때
- 한 줄 핵심 + 작은 사진 인셋. 번호(01) 작게. **여백 많이.**

### ③ 본문 — 내용 많을 때
- 소제목(번호+제목) + 가로 사진 스트립 + 설명 2~3줄(Light). 구조적.

### ④ 마무리 (CTA)
- 흑배경. 저장 유도 + 댓글 가르는 질문 + 공유 소환. KPI 장치 필수.

## 레이아웃 변주 풀 (역할 안에서 로테이션 — 매번 다르게)
풀이미지 / 텍스트만 / 좌사진·우텍스트 스플릿 / 초대형 숫자형 / 사진 인셋 / 가로 스트립.
→ 같은 역할도 매번 다른 레이아웃 → 목·토·일 안 똑같아 보임.

## 규격
- 1080×1350 (4:5). 슬라이드 4~7장. 첫장 강함, 마지막 CTA.

## 렌더 보정 (✅ 2026-06-15 — 캐러셀 렌더 8개 수정)
- **장수: 7~8장** = 커버1 + 본문5~6 + 마무리1(cta_editorial). 저장각 정보 밀도로 채움.
- **한글 줄바꿈**: txt 헬퍼 기본 스타일에 `wordBreak:'keep-all'` 적용(한글 단어가 음절 단위로 안 쪼개짐, satori 지원). 헤드라인·라벨 등 전역.
- **마크다운 `**` 노출 제거**: txt 가 호출하는 sx() 가 화살표 글리프와 함께 `**` 마커 제거(헤드라인/라벨). richText 는 sx 전체 적용 대신 원문에서 `**강조**` 먼저 파싱 후 세그먼트별 sx 적용 → 볼드 위계 유지(파싱이 깨지지 않게).
- **후기 캡처 contain**: 후기는 `review`(+alias `reviewshot`) 타입에만. 이미지 `objectFit:'contain'`(세로 비율 잘림 금지). 후기 캡처를 cover/info(크롭=cover) 슬라이드에 넣지 말 것.
- **커버 변주 4종 로테이션**(carousel-daily): cover_fullimage→split→number→textonly redis 카운터 로테이션(기존 유지).
- **본문 도표 변주**: genSlides 프롬프트가 data_stat·data_compare·data_steps 를 섞고 텍스트 강조형(body_textonly)도 1장 섞도록 강화. **직전 본문과 다른 visual·같은 막대도표 2장 연속 금지**.
- **클레임 가드**: 입증 혜택 범위(24h 보습·장벽·결 정돈) 밖 수치/효능 단정 금지(프롬프트 명시).
- **slidesRaw 저장**: seedDraft 가 draft 에 `slidesRaw`(생성 slides JSON 사본) + `market`/`keyword`/`axis`/`coverType` 메타 저장 → 앱에서 재베이킹 가능. (mediaUrls·caption·hashtags·slides 기존 필드 유지에 추가.)

## 구현 TODO (render-card.js)
1. 폰트 로더 Pretendard → Noto Sans KR(woff/otf).
2. 슬라이드 타입 확장: cover(풀이미지/텍스트만) · body_short · body_long · cta. (현재 cover/info/review/cta → 매핑·추가.)
3. roughEllipse 강조 = 키워드 단위 적용(카드당 1, 옵셔널 플래그).
4. 로고 = 작게·옵셔널.
5. carousel-daily: 슬라이드별 일상룩 사진 생성 + 역할/레이아웃 로테이션 + 카피 LLM(감각적 한 줄·두께 위계용 emphasis 마킹).

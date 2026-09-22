# 트렌드 수집 계약 (2026-09-23 확정)

> 대시보드는 트렌드를 **수집하지 않는다.** 맥에서 도는 실행자가 수집·분석하고, 결과를 이 계약으로 밀어넣는다.
> 앱은 "누가 어떻게 가져왔는지"를 묻지 않고 **결과의 모양만** 강제한다. 실행자가 바뀌어도 이 문은 그대로다.

## 역할

| | 누가 | 무엇 |
|---|---|---|
| 틀 | MINE + Claude(Cowork) | 스키마·판정 규칙·어디에 꽂히는지 |
| **실행** | **Claude Code (맥)** | 틱톡에서 찾기 → 영상 분석 → 이 계약으로 POST |
| 실행 대체 | **Codex** | 클로드 코드가 못 하거나 품질이 안 나올 때 |
| 수신 | `POST /api/content/trend-ingest` | 스키마 검증만. 지어낸 값 차단 |
| 소비 | `오늘의 9칸` 트렌드 3칸 | 훅 라이브러리(`content:hooks:v1`)에서 꺼내 앉힌다 |

**왜 앱이 안 하나:** 틱톡은 공개 트렌드 API 가 없다. 영상을 실제로 보려면 브라우저와 파일 시스템(ffmpeg)이
필요한데 Vercel 서버리스는 둘 다 없다. 맥에서 도는 에이전트는 둘 다 있다.

**릴스는 버린다.** 인스타그램에는 Creative Center 같은 공개 트렌드 surface 가 없다. 로그인 피드를 긁는 것
말고 방법이 없고 그건 차단·계정 위험이다. **틱톡만.** (`sourceUrl` 이 tiktok.com 이 아니면 거부된다.)

---

## 실행자가 하는 일

### 1. 찾는다
- 1순위: **TikTok Creative Center → Top Ads** (공개·로그인 불필요). 산업 Beauty & Personal Care,
  지역 US / KR, 기간 7일. 조회수와 함께 실제로 돈을 쓴 광고가 올라온다.
- 2순위: 틱톡 검색 — `korean skincare` · `glass skin` · `mist hack` · `smile lines` · `속건조` · `물광`
- 우리 제품(미스트·앰플)과 **소구가 닿는 것만.** 조회수만 높고 결이 다른 건 버린다.
- 하루 **3장**. 더 많이 보내도 앞의 3개만 오늘 칸에 앉고 나머지는 라이브러리에 쌓인다.

### 2. 분석한다 — 본 것만 적는다
영상을 실제로 재생/다운로드해서 봤으면 `craft` 를 채우고 `confidence.craft` 를 `high`/`low`.
**못 봤으면 `craft` 를 통째로 비우고 `confidence.craft: "absent"` + `confidence.note` 에 무엇만 봤는지.**

> 이게 이 계약의 핵심이다. 커버 이미지만 보고 "8컷 하드컷"이라 적으면 그건 관찰이 아니라 창작이고,
> 그 값이 블루프린트로 흘러들어가 소재를 망친다. **absent 는 실패가 아니다** — 훅만 차용하고
> 골격은 우리 실측 카탈로그(`docs/ad-creative-system.md` §8)를 쓰면 된다.

영상 없이도 관찰 가능한 것: 커버에 박힌 첫 자막, 캡션, 해시태그, 조회수·좋아요, 사운드 이름, 게시일.
영상이 있어야 아는 것: 컷 수, 컷 길이, 전환, 비트 타이밍, 시각 구조(A/B/C/D).

### 3. 변환한다 — 문장은 100% 새로 쓴다
`sourceHook` 은 관찰한 **원문 그대로**(근거·추적용, 생성에 안 쓴다).
`adapted.kr` / `adapted.us` 는 밀리밀리 버전 — **번역이 아니라 새 문장.**
원문과 같으면(공백·구두점 무시 비교) 거부된다.

컴플라이언스: 입증 범위만(24h 보습 · 피부장벽 · 결 정돈 · 팔자/눈가 4주 겉보기 · 탄력).
주름 제거/개선 단정 · 구조 차오름 · 시술 동등 비교 금지. KR/US 수치 혼용 금지.

### 4. 보낸다
```bash
curl -X POST "https://mine-ai-team.vercel.app/api/content/trend-ingest?market=us&dry=1" \
  -H "Authorization: Bearer $CREATOR_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d @cards.json
```
**`dry=1` 로 먼저 검증한다.** 거부 사유가 `fails[]` 로 하나씩 돌아온다. 통과하면 `dry` 를 빼고 다시.

---

## 스키마 — 카드 1장

```json
{
  "sourceUrl": "https://www.tiktok.com/@handle/video/7284...",   // 필수 · tiktok.com 만
  "refId": "7284...",                                            // 선택 · 중복 판정에 쓴다
  "market": "us",                                                // us | kr
  "product": "MST",                                              // 선택 · MST | AMP | SET

  "sourceHook": "Your mist is making you drier.",                // 필수 · 관찰한 원문 그대로
  "adapted": {                                                   // 필수 · 100% 새 문장
    "kr": "미스트 뿌릴수록 당기는 건 순서가 틀려서예요",
    "us": "Mist drying you out? You're using it backwards."
  },

  "lever":    "CURIOSITY",   // CURIOSITY | PROOF | CONTRAST | RELATE | SAVE | SHARE
  "angle":    "MYTH",        // BA | CLI | POV | MYTH | AUTH | OFFER | TIP | UGC
  "hookType": "TEXT",        // FACE | RESULT | SPLIT | TEXT | SCENE | ASMR

  "why":   "통념을 뒤집고 '그럼 어떻게?'를 열어 끝까지 보게 만든다",
  "proof": "댓글 2천 개가 '나도 그런다'로 몰림",

  "observed": {                          // 본 것만. 모르면 키를 빼라 (null 도 쓰지 마라)
    "views": 1240000,
    "likes": 89000,
    "postedAt": "2026-09-18",
    "soundName": "original sound - handle",
    "coverText": "STOP using mist like this",
    "caption": "게시물 캡션 원문",
    "hashtags": ["#skincare", "#glassskin"]
  },

  "craft": {                             // 영상을 실제로 본 경우에만. 아니면 통째로 생략
    "durationSec": 14.2,
    "cuts": 9,
    "transitions": "hardcut",
    "structure": "B",                    // A | B | C | D
    "beats": ["0-3s 통념 선언", "3-8s 왜 틀렸나", "8-12s 올바른 순서 시연", "12-14s 엔드카드"]
  },

  "confidence": {
    "craft": "high",                     // high | low | absent
    "note": "영상 전체 재생 후 컷 카운트"   // absent 면 필수 — 무엇만 보고 판단했는지
  },

  "analyzedBy": "claude-code"            // claude-code | codex — 누가 분석했는지 남긴다
}
```

전송 body: `{ "cards": [ … ] }` — 한 번에 12장까지.

## 거부 사유 (그대로 `fails[]` 로 돌아온다)

| 사유 | 고치는 법 |
|---|---|
| `sourceUrl 이 틱톡이 아님` | 릴스·유튜브는 받지 않는다 |
| `sourceHook 없음` | 원문이 없으면 근거가 없다 |
| `adapted.kr/us 이 원문과 같다` | 번역만 한 것도 복제다. 새로 써라 |
| `lever/angle/hookType 이 목록 밖` | 위 enum 안에서만 |
| `craft 를 보냈는데 confidence.craft=absent` | 영상을 못 봤으면 craft 를 비워라 |
| `confidence.craft=high 인데 craft 가 비었다` | 본 걸 적든가, absent 로 내려라 |
| `영상을 못 봤으면 confidence.note 에…` | 무엇만 보고 판단했는지 적어라 |

`shortfall` 이 돌아오면 통과분이 3장 미만이라 그날 트렌드 칸이 다 안 찬다는 뜻이다. 더 보내라.

---

## 클로드 코드 → 코덱스로 넘기는 조건

아래 중 하나면 그 건은 코덱스에 넘긴다 (`analyzedBy: "codex"`).

1. **영상을 못 얻는다** — 3장 중 2장 이상이 `confidence.craft: absent` 로 나온다.
2. **변환 훅이 번역 수준** — `adapted` 가 원문 구조를 그대로 따라간다(거부당하거나, 거부는 피했는데 읽어보면 같은 문장).
3. **분류가 흔들린다** — 같은 영상을 두 번 돌렸는데 `angle`/`lever` 가 다르게 나온다.
4. 실행이 10분을 넘긴다.

> 넘길 때 코덱스에 이 문서 전체와 실패한 `fails[]` 를 같이 준다. 사유 없이 "다시 해봐"는 같은 결과를 산다.

## 이 계약이 막는 것

- **지어낸 골격** — 영상을 안 보고 컷·전환을 적는 것. `confidence` 교차검증으로 차단.
- **복제** — 원문을 번역해서 우리 훅으로 쓰는 것. 정규화 비교로 차단.
- **축 오염** — 실행자가 새 앵글·레버를 만들어 보내는 것. enum 밖은 거부.
- **조용한 실패** — 3장이 안 차면 `shortfall` 로 알린다. 빈 칸을 채운 척하지 않는다.

# 에이전트 실행 설계 (2026-09-22)

> 오케스트레이터: **Astra (Codex, `gpt-6-astra`)**
> 실행자: Aside · Codex 워커 · Claude · Higgsfield
> 버스: `https://mine-ai-team.vercel.app/api/agents/jobs`

---

## 0. 왜 큐를 쓰나 — 직접 호출이 불가능하기 때문

Claude·Codex·Aside 는 **각각 독립 프로세스**다. 서로를 함수처럼 부를 수 없고, 서로의 메모리도 못 본다.
셋 다 닿을 수 있는 유일한 지점이 **이 앱의 HTTP API** 다. 그래서 앱이 버스가 된다.

파일 드롭(`~/handoff/*.json`)으로 붙이지 않은 이유: 맥이 꺼지면 끊기고, 누가 언제 집었는지 추적이 안 되고,
두 워커가 같은 파일을 동시에 집는 경합을 막을 방법이 없다. 큐는 `RPOP` 이 원자적이라 경합이 구조적으로 불가능하다.

```
                    ┌──────────────────────────┐
     Astra ────────▶│  /api/agents/jobs (버스) │◀──────── 워커들이 claim
   (오케스트레이션)  │  queued → claimed → done │
                    └──────────────────────────┘
                              ▲
                              │ complete(result)
        ┌─────────────┬───────┴───────┬──────────────┐
      Aside         Codex           Claude       Higgsfield
     브라우저       브라우저         코드/판정        생성
```

---

## 1. 역할 분담 — 능력이 아니라 **접근권**으로 나눈다

| 역할 | 담당 | 왜 이 담당인가 |
|---|---|---|
| `browser` | **Aside · Codex** | 틱톡·인스타를 **실제로 볼 수 있다.** Claude는 못 본다 — 이게 유일하고 결정적인 차이 |
| `code` | **Claude** | 앱 코드·판정 규칙·렌더러·배포. 레포 컨텍스트를 들고 있음 |
| `generate` | **Higgsfield** | 이미지·영상 생성, `virality_predictor` |
| `judge` | Claude 또는 Astra | QA 게이트 |

> ⚠️ **유튜브는 빠졌다.** 코드가 볼 수 있는 유일한 소스여서 썼던 것뿐이고, 실제 트렌드는 틱톡·인스타에 있다.
> 브라우저 에이전트가 붙는 순간 유튜브를 고집할 이유가 없어진다. `?youtube=1` 로만 켜는 보조 소스로 강등.

---

## 2. 작업 타입과 흐름

```
trend.observe   (browser)  틱톡·인스타에서 위너 영상을 보고 구조를 받아적음
      ↓
hook.card       (code)     관찰 → 훅 카드로 정규화 → 라이브러리 적재
      ↓
creative.brief  (code)     훅 카드 → 블루프린트(4비트·캡션·컴플라이언스)
      ↓
creative.make   (generate) 블루프린트 → 실제 소재
      ↓
qa.gate         (judge)    QA 체크리스트 → 통과분만 보드 review
```

---

## 3. 버스 사용법 (모든 워커 공통)

인증: `Authorization: Bearer $CRON_SECRET` — 모든 호출.

```bash
BASE=https://mine-ai-team.vercel.app/api/agents/jobs
H="Authorization: Bearer $CRON_SECRET"

# 1) 내 역할의 작업 하나 집기 (원자적 — 중복 점유 불가)
curl -s -X POST "$BASE?action=claim" -H "$H" -H 'Content-Type: application/json' \
  -d '{"role":"browser","worker":"aside-1"}'

# 2) 끝나면 결과 제출
curl -s -X POST "$BASE?action=complete" -H "$H" -H 'Content-Type: application/json' \
  -d '{"id":"job_xxx","result":{...}}'

# 3) 실패 (3회까지 자동 재큐)
curl -s -X POST "$BASE?action=fail" -H "$H" -H 'Content-Type: application/json' \
  -d '{"id":"job_xxx","error":"틱톡 로그인 벽"}'

# 4) 현황
curl -s "$BASE?status=queued" -H "$H"
```

**리스 30분.** 그 안에 complete 하지 않으면 작업이 큐로 돌아간다(`?action=reap`).
오래 걸릴 것 같으면 쪼개서 여러 작업으로 만들 것.

---

## 4. `trend.observe` 계약 — 브라우저 에이전트 (Aside · Codex)

### 받는 것 (`job.payload`)
```json
{ "platform": "tiktok" | "instagram", "market": "kr" | "us",
  "query": "smile lines skincare", "minViews": 100000, "want": 3 }
```

### 하는 일
1. 해당 플랫폼에서 `query` 로 검색. 최근 90일, 조회수 `minViews` 이상.
2. 상위 `want` 개를 **끝까지 재생해서 본다.** 썸네일만 보지 말 것 — 이게 이 역할의 존재 이유다.
3. 각 영상에 대해 아래를 받아적는다.

### 제출 계약 (`result`)
```json
{
  "observations": [{
    "url": "...",
    "platform": "tiktok",
    "market": "us",
    "stats": { "views": 1200000, "likes": 84000, "comments": 1900, "saves": null },
    "postedAt": "2026-09-05",
    "durationSec": 14,

    "openingFrame": "첫 프레임에 뭐가 보이는지 — 얼굴? 제품? 텍스트?",
    "hookLine": "0~3초에 말하거나 띄운 문장 (원문 그대로. 참고용이며 복제하지 않는다)",
    "onScreenText": ["번인 자막을 순서대로", "..."],
    "beats": [
      { "t": "0-3s", "what": "화면에 무슨 일이 일어나는가" },
      { "t": "3-8s", "what": "..." },
      { "t": "8-12s", "what": "..." },
      { "t": "12s-", "what": "엔드카드/CTA" }
    ],
    "cuts": 7,
    "audio": { "kind": "voiceover|trending|asmr|무음", "note": "무슨 소리가 나는지. 곡명은 알면 적되 몰라도 됨" },
    "visual": { "lighting": "...", "palette": "...", "framing": "클로즈업/와이드", "product": "언제 어떻게 등장하는가" },
    "proof": "대세감 장치 — 수치·후기더미·랭킹 등",
    "comments": ["상위 댓글 2~3개 원문"],
    "whyItWorks": "왜 멈춰세웠다고 보는가 — 한 줄"
  }]
}
```

### 하지 말 것
- ⛔ **영상·오디오·대사·얼굴을 다운로드하거나 복제하지 않는다.** 구조만 받아적는다.
- ⛔ 로그인 벽·캡차를 우회하지 않는다. 막히면 `action=fail` 로 사유를 적어 반납.
- ⛔ 조회수 미달이나 카테고리 무관(뷰티 아님)은 넣지 않는다. 빈손이 오염보다 낫다.
- ⛔ `hookLine` 을 의역하거나 다듬지 않는다 — **원문 그대로.** 각색은 다음 단계(Claude)가 한다.

---

## 5. `hook.card` 계약 — Claude

`trend.observe` 결과를 받아 훅 카드로 바꾼다.

- `sourceHook` = 관찰 원문 (근거·추적용, **생성에 쓰지 않음**)
- `adapted.kr` / `adapted.us` = **우리 제품용 오리지널 훅** (생성에 쓰는 건 이것뿐)
- 축 매핑: `angle`(BA/CLI/POV/MYTH/AUTH/OFFER/TIP/UGC) · `hookType`(FACE/RESULT/SPLIT/TEXT/SCENE/ASMR) · `lever`
- 클레임은 밀리밀리 입증 범위 내에서만 (24h 보습 · 결 정돈 · 팔자/눈가 주름 4주 · 탄력)

적재: `POST /api/content/hooks`

---

## 6. Astra(오케스트레이터)가 하는 일

1. **매일 20:00** `GET /api/cron/trend-scan` (Bearer) — 내부 위너 카드 + 관찰 작업 큐잉
2. **큐 감시** `GET /api/agents/jobs?status=queued` — 역할별 적체 확인
3. **배차** — `browser` 큐가 쌓이면 Aside/Codex 워커를 돌린다
4. **회수** `POST /api/agents/jobs?action=reap` — 죽은 워커가 물고 있는 작업 되돌리기
5. **검수** — `done` 작업의 `result` 가 계약을 지켰는지 확인. 어기면 `fail` 로 반려
6. **에스컬레이션** — 같은 작업이 3회 실패하면 MINE에게 보고 (로그인 벽 등 사람이 풀어야 하는 것)

Astra가 **직접 하지 말 것**: 앱 코드 수정(Claude 담당), 소재 생성(Higgsfield 담당).

---

## 7. 현재 상태

| | 상태 |
|---|---|
| 버스 (`/api/agents/jobs`) | ✅ 배포 |
| `trend.observe` 자동 큐잉 | ✅ trend-scan cron 에 배선 |
| 브라우저 워커 (Aside/Codex) | ⬜ **지시서 전달 필요** → `docs/briefs/` |
| `hook.card` 워커 | 🟡 수동 (Claude가 직접) |
| `creative.brief` 이후 | ⬜ 미착수 |

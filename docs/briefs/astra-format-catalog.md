# Astra — 포맷 카탈로그 1회 분석 지시서

> `codex exec` 또는 Codex 앱에서 실행. `CRON_SECRET` 필요.
> **이건 1회 작업이다.** 끝나면 분기마다 갱신만 한다.

---

너는 밀리밀리(K뷰티 · 단백질 미스트 / 앰플) 콘텐츠팀의 오케스트레이터다.
지금 할 일은 **포맷 카탈로그를 확정하는 것** — 터지는 릴스 유형과 메타 소재 유형의 단일 목록.

## 왜 하는가

영상을 100개 봐도 결론은 8~12개 유형으로 수렴한다. 매번 처음부터 해석하면 같은 답을 매일 다시 사는 꼴이다.
**한 번 확정하고 참조한다.** 이후 매일 하는 일은 "관찰"이 아니라 "이 카탈로그에서 조합을 고르는 것"이 된다.

그리고 **새로 관찰할 필요가 없다.** 재료가 이미 다 있다.

## 재료 (전부 로컬)

| 자산 | 무엇 |
|---|---|
| `~/mine-ai-team/docs/shorts-format-library.md` | 바이럴 릴스 8포맷 + 표준 4비트 아크. **2026-06 작성, 이후 검증 없음** |
| `~/amp-1-beforeafter.png` … `~/amp-6-authority.png` | 앰플 메타 소재 6컨셉 (실제 제작물) |
| `~/mist-ad-c1-*.png` (15장) | 미스트 메타 소재 반복 시안 |
| `~/mine-ai-team/docs/content-team-design.md` §2 | 앵글 축 정의 (BA/CLI/POV/MYTH/AUTH/OFFER/TIP/UGC) |
| `~/mine-ai-team/docs/content-team-research-2026-09-22.md` | 실측 — US 광고 훅 패턴, 소재 디자인 시스템 |

이미지는 `codex exec -i <파일>` 로 붙여서 보면 된다.

## ⚠️ 핵심 — "문서 합치기"가 아니라 "실성과로 검증하며 합치기"

문서는 6월에 쓰였고 그 뒤 검증되지 않았다. **실제 성과와 충돌하는 곳이 이미 있다.**

실성과를 먼저 받아라:
```bash
curl -s "https://mine-ai-team.vercel.app/api/content/performance?market=all"
```
`matrix` 배열이 `제품 × 앵글` 별 평균 훅률·위너 수다.

알려진 충돌 하나 — **이건 반드시 판단해서 기록해라**:
> 소재 디자인 시스템은 `TOP 100 AMAZON` / `#1 OLIVE YOUNG` 권위 배지를 전면에 쓴다.
> 그런데 매트릭스에서 `AUTH` 앵글은 KR 훅률 **6.1%로 최하위**다(소재 6개 투입).
> 반면 `UGC`(실후기)와 `MYTH`(반전)가 상위를 독식한다.
>
> → AUTH 유형을 `retired` 로 내릴지, `cooldown` 으로 둘지, 아니면
>   "배지는 유지하되 훅으로 쓰지 않는다"로 재정의할지 **네가 판단하고 evidence 에 근거를 적어라.**

같은 방식으로 8포맷 전부를 매트릭스와 대조해라. 성과 데이터가 없는 유형은 `evidence: null` 로 두고
응답의 `unvalidated` 에 뜨게 한다 — **없는 근거를 지어내지 마라.**

## 제출

```bash
curl -s -X POST "https://mine-ai-team.vercel.app/api/content/formats" \
  -H "Authorization: Bearer $CRON_SECRET" -H 'Content-Type: application/json' \
  -d '{"replace":true,"formats":[ ... ]}'
```

포맷 1개의 모양:

```json
{
  "name": "반전 토킹 (Myth-bust UGC)",
  "kind": "reel",
  "angle": "MYTH",
  "hookType": "FACE",
  "lever": "CURIOSITY",
  "summary": "통념을 깬 뒤 올바른 사용법을 시연한다",
  "beats": [
    "0-3s 반전 선언",
    "3-8s 왜 그런지 한 스푼",
    "8-12s 올바른 타이밍 시연",
    "12s- 엔드카드(실제 제품컷 + 스펙 1줄 + CTA)"
  ],
  "hookPatterns": [
    "{제품}을 {통념대로} 쓰면 오히려 {역효과}입니다",
    "{고민}인 줄 알았죠? 사실 {진짜원인}이었어요"
  ],
  "products": ["MST", "AMP"],
  "markets": ["kr", "us"],
  "compliance": "효능 단정 금지 — 겉보기·입증 범위(24h 보습/결 정돈/팔자·눈가 4주/탄력)",
  "evidence": "매트릭스 US MST·MYTH 훅률 40.9%, 위너 1건",
  "status": "active",
  "source": "shorts-format-library.md #1"
}
```

### 규칙

- `angle` 은 **필수**다. 없으면 서버가 거부한다 — 성과와 대조할 수 없는 유형은 카탈로그에 못 들어온다.
  허용값: `BA CLI POV MYTH AUTH OFFER TIP UGC`
- `hookType` 허용값: `FACE RESULT SPLIT TEXT SCENE ASMR`
- `hookPatterns` 는 **완성 문장이 아니라 틀**이다. `{}` 로 변수를 남겨라. 생성 단계가 채운다.
- `kind: "static"` 은 메타 소재 유형 — `beats` 자리에 레이아웃 슬롯을 적어라
  (예: `"상단 훅"`, `"중앙 비포애프터"`, `"우측 권위배지"`, `"하단 블랙 오퍼밴드"`).
- **유형 개수는 8~14개로 억제해라.** 더 잘게 쪼개면 조합당 표본이 없어서 판정이 안 된다.
- 성과가 없는 유형을 지우지는 마라 — `status: "cooldown"` 으로 두고 `evidence: null`.

## 하지 말 것

- ⛔ **틱톡·인스타를 새로 관찰하지 마라.** 이번 작업에 관찰은 불필요하다. 있는 자산으로 충분하다.
- ⛔ 앵글 축을 새로 만들지 마라. 8개로 고정이다 — 바꾸면 기존 소재 442건의 분류가 다 깨진다.
- ⛔ 판정 기준(훅률 34% / 유지율 39% / 본→클릭 39%)을 건드리지 마라. MINE 확정값이다.
- ⛔ 앱 코드를 고치지 마라. 네 출력은 카탈로그 JSON 하나다.
- ⛔ 근거 없는 evidence 를 지어내지 마라. `null` 이 거짓보다 낫다.

## 끝내고 확인

```bash
curl -s "https://mine-ai-team.vercel.app/api/content/formats" | python3 -m json.tool
```

`unvalidated` 에 뜬 유형들이 "아직 성과로 검증 못 한 것"이다. 그 목록을 MINE에게 보고해라.

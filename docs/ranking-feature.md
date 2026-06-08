# 카테고리 랭킹 기능 (Amazon US + 올리브영)

목표: 우리 미스트 제품의 아마존 US·올리브영 카테고리 순위를 대시보드에 준실시간 표시.

## 추적 대상 제품
- **아마존 US**: 밀리밀리 500 Dalton Protein Mist — ASIN `B0GYCB5164`
- **올리브영**: 밀리밀리 500달톤 프로틴 콜라겐 미스트 55ml — goodsNo `A000000255334`
  - 카테고리: 스킨케어 > 미스트/오일 (`fltDispCatNo=100000100010010`)
  - 랭킹 페이지: `getBestList.do?dispCatNo=900000100100001&fltDispCatNo=100000100010010`
  - (2026-06-07 기준 7위 — 라이브 검증 완료)

## 데이터 소스 / 인프라
| 채널 | 방식 | 갱신 |
|---|---|---|
| 아마존 US | Vercel `api/ranking/amazon.js` — SP-API `getCatalogItem` salesRanks (BSR) | 크론 2h |
| 올리브영 | **내 맥에서 Playwright 스크래핑 → Upstash 푸시** (Imperva 봇 차단 때문에 일반 fetch 403, 실브라우저 필요) | launchd/cron |

## Redis 키
- `ranking:amazon` — 아마존 endpoint가 기록 `{ rank, prevRank, change, category, name, url, source, updatedAt }`
- `ranking:oliveyoung` — 로컬 스크립트가 푸시 (동일 shape)
- `ranking:amazon:YYYYMMDD` / `ranking:oliveyoung:YYYYMMDD` — 일일 순위 스냅샷 (전일 대비 변동 계산)
- `ranking:data` — 두 채널 합본 `{ status:'connected', items:[...], updatedAt }` (기존 brand 에이전트 + ChatView 호환)

## item shape
```
{ platform, flag, category, name, rank, prevRank, change, ours:true, url, source, updatedAt }
```
change = prevRank - rank (양수 = 순위 상승 ▲)

## 프론트
- `api/ranking.js` GET → 대시보드 store `fetchRanking` → "카테고리 랭킹" 카드
- 표시: 국기 + 플랫폼 + 카테고리 + #순위 + 변동(▲▼—) + 소스 + 갱신시각

# 오너-후킹 전환 광고 (Meta) — 제작 스펙

> 근거: ad-winners 실데이터. #1 Ampoule_Owner_01(ROAS 10.39·매출 1,240만·CTR 4.6%+CVR 14.3%) = **오너 직접 등장**이 전환 최강.
> 전략: 검증된 오너-후킹 포맷을 **미스트**에 이식(미스트는 Meta top5 밖 → 위너 포맷으로 테스트). 채널: 밀리밀리_한국 자사몰 전환.
> 상위 규칙: CLAUDE.md「KPI·컴플라이언스」. 1-2장(10장 아님), 광고 바로 돌릴 전환형.

## 자산 (실측 URL)
- **오너 히어로(생성)**: MINE Soul `67c4bcbf-8637-4fbf-8b43-3ae1a9ab48cd`, soul_v2. 후보 2:
  - A: `https://d8j0ntlcm91z4.cloudfront.net/user_38PAdEfRanROtVrNU82Klb8ZOSl/hf_20260611_015718_b9e8f457-cd99-4cac-92e7-e1872970ef9f.png`
  - B: `https://d8j0ntlcm91z4.cloudfront.net/user_38PAdEfRanROtVrNU82Klb8ZOSl/hf_20260611_015718_2857a479-5a20-45fc-ae0c-278d4e76f64f.png`
  - ⚠️ AI 생성 likeness → 광고/캡션에 **"AI 연출" 명시 필수**(컴플라이언스).
  - ⚠️ MCP Soul2.0이 negative_prompt·custom_reference_strength·style_id누락을 미지원 → 글자artifact·oily 발생 시 앱 `persona-soul`(풀 검증값)로 재생성.
- **제품 실컷(자사몰, 정확)**: `https://millimilli.kr/web/product/big/202606/5bd5f3743667a7a3056ed74fc1de916d.png` (1300px 미스트). AI로 제품 그리지 말 것 — 실제 제품컷 합성.

## 오퍼 (검증·KR 자사몰, 라이브)
- 1+1 미스트 2병 **24,900원** (정가 38,000 · **34%↓**)
- 당일출발(~14시 전), 5만↑ 무료배송, 7만↑ 앰플 증정
- 사회적증거: **지금까지 32만+ 관심**(라운딩, 라이브 카운터)

## Piece A — 메인 후킹 단일 전환컷 (1080×1350, 4:5)
레이아웃(목업대로): 오너 히어로 풀블리드 → 상단 훅 → 중앙 제품컷 인서트+효능1줄 → 하단 블랙 오퍼밴드+CTA+증거칩.
- **훅(상단, 3초)** — 기본값 #1, 교체 가능:
  1. "30만이 물어본 내 아침 물광" / "사실 미스트 하나 바꿨어요"  ← 기본
  2. "대표가 매일 아침 뿌리는 미스트"
  3. "화장 들뜨던 내가, 미스트 하나 바꾸고"
- **효능 1줄**: "500달톤 프로틴 미스트 · 진짜 흡수되는 크기"
- **오퍼밴드(블랙·큰 숫자)**: "1+1 · 24,900원"  서브 "34%↓ · 당일출발"
- **CTA**: "지금 자사몰에서 받기 →"
- **증거칩**: "지금까지 32만+ 관심"
- 좌하단 작게 "AI 연출".
- 매핑: 오너얼굴=#1위너 우위 / 훅=CTR / 오퍼·증거·CTA=CVR.

## Piece B — 클로징·리타겟컷 (옵션 2번째)
- #millimilli 실 UGC 후기(실제 캡처=신뢰 규칙) 또는 자사몰 사용 전/후컷.
- 카피 "뿌리고 5분, 속부터 차오르는 물광" + 오퍼 반복 + 긴급 "오늘 14시 전=오늘 출발" + CTA.
- A에서 클릭·미구매자 리타겟 닫기.

## 렌더 (앱 = sandbox가 cloudfront·자사몰 못 받음)
- 새 렌더 `POST /api/creator/render-ad` 또는 render-promo 확장: 입력 {owner_url, product_url, hook, offer, market:"kr"} → 두 이미지 서버 fetch → 합성(오너 배경 + 제품 인서트 + 텍스트/오퍼/CTA/AI연출/증거칩) → 1080×1350 → ingest-capture → 보드 시드(channel kr_ig, slotType "ad_owner", status review).
- 컴플라이언스: AI연출 명시 / 1+1 24,900 정확 / KR 수치만(US$·아마존 별점 금지).

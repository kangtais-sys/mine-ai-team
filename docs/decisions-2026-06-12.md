# 결정 로그 — 2026-06-12 (제품 사용 장면 자동화)

> SYSTEM-MAP.md·HANDOVER.md 보조. 이번 세션에서 검증·확정한 것만.

## 1. 릴스 완성본 = A안(힉스필드 단독 9:16) — 확정
- 전부 힉스필드 안에서 9:16으로. 캡컷 의존 최소.

## 2. ⚠️ 제품 라벨 = 생성 금지 (검증된 실패)
- **nano_banana_pro로 제품 단독 재생성 → 라벨이 다른 글자/로고로 바뀜** (MINE 반려, 2026-06-12 실측).
- 결론: 생성 모델은 **라벨 텍스트를 정확히 재현 못 함.** 제품을 "그리게" 하면 무인 루프에서 매일 가짜 라벨 양산.
- soul→kling 경로(현 `shorts-daily`)는 imagePrompt에 "frosted milky-white milli² bottle"이라 **병을 그림 → 같은 결함.** 교체 대상.

## 3. ✅ 제품 사용 장면 정답 = Marketing Studio (제품충실 모델)
- MINE 요구: 사진 잠깐 X → **모델이 진짜 제품 들고·분사·사용하는 장면이 매일 자동**으로.
- models_explore recommend 결과(2026-06-12): **`marketing_studio_video` 압도(score 1660)** — 제품을 `product_ids`로 등록해 진짜 제품 유지한 채 아바타 사용 영상. 9:16·UGC/Product Review/Unboxing 프리셋·hook/setting 로테이션 지원. 2순위 `seedance_2_0`(reference·identity·product 유지).
- ⚠️ 사용 장면이라도 병이 작거나 빠르게 움직이면 라벨 미세 드리프트 가능 → **100% 보장 아님. 첫 편은 MINE이 라벨 눈검증.** 통과 시 엔진 기본값.
- 백업: 라벨이 끝내 안 맞으면 사용 장면의 병만 진짜 제품 누끼로 합성(overlay-short ffmpeg 단계 확장).

## 4. 제품 에셋 — 전부 라이브 확인 (2026-06-12)
- 히어로 단백질 미스트 핸드헬드 실사: `4a56fcd8`, `5ae8b48a` (show_medias 확인).
- 앰플 `bb221889`/`4660e076` · 시카 누끼 `68a0a7c2` · 비타 `a6e71e46` · 선크림 누끼 `19e135c7` 등 product-assets.md 10종 전부 정상.
- ⚠️ media_id 만료 대비 Vercel Blob 미러 권장(미실행).

## 5. 엔진 수정 TODO (이 결정의 코드 반영)
- [ ] `api/cron/shorts-daily.js` FORMATS.imagePrompt에서 병 묘사 제거 → 얼굴·센서리만 (가짜 라벨 차단).
- [ ] 제품샷 생성기를 soul→kling 에서 **marketing_studio_video(product_ids)** 로 교체.
- [ ] 첫 테스트 편 MINE 승인 후 위 교체 반영.

## 6. 검증 한계 (정직 고지)
- 샌드박스가 Higgsfield CDN(d2ol7oe51mr4n9 / d8j0ntlcm91z4) egress 차단 → **생성 픽셀을 Claude가 직접 못 봄.** 라벨·9:16·표정 최종 판정은 MINE이 job_display 또는 직접 URL로.

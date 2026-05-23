# MILLI AI Team — Claude 컨텍스트 파일

## 프로젝트 개요
- **앱 이름**: MILLI AI (Millius Corp.)
- **URL**: https://mine-ai-team.vercel.app
- **GitHub**: kangtais-sys/mine-ai-team
- **오너**: 유민혜 (MINE) — MILLIMILLI 브랜드 대표, 0.8L 인플루언서 마케팅 플랫폼 대표

## ⚠️ 자동응대 플랫폼 — ZERNIO 전용 (절대 규칙)

### 파일 규칙
- **인스타그램 댓글/DM 자동응대는 100% Zernio 경유** — Meta(Instagram) 직접 API 연동 없음
- `api/webhooks/instagram.js`와 `api/cron/instagram.js`는 **미사용 파일 — 절대 수정 금지**
- 자동응대 코드는 반드시 `api/webhooks/zernio.js`와 `api/cron/inbox.js`에만 적용

### Zernio 계정 ID 매핑 (웹훅 실측값)
| Zernio 프로필 ID | 계정 | 핸들 |
|---|---|---|
| 69fca4b192b3d8e85f8cfea6 | yuminhye | lala_lounge_ |
| 69d08807986d57bb8f72f7e6 | yuminhye | (원래 ID) |
| 69fbfc1992b3d8e85f86d277 | millimilli | millimilli.kr |
| 69fbfd0692b3d8e85f86d882 | millimilli | millimilli.us |
| 69d08cc1986d57bb8f733102 | millimilli | (원래 ID) |

### Zernio API 스펙 (검증 완료 — 추측 금지)
```
베이스: https://zernio.com/api/v1

# 댓글 목록 (게시물 단위, 팔로워 댓글 아님)
GET  /inbox/comments?limit=50      → { data: [...] }  ← .comments 아님, .data 임
  item 구조: { id, accountId, accountUsername, platform, content(게시물캡션), commentCount, likeCount }

# 팔로워 댓글에 대댓글 달기 ← 실제 docs 확인 (2025-05 검증)
POST /inbox/comments/{postId}      → body: { accountId*, message*, commentId(선택) }
  postId    = Zernio 내부 게시물 ID (GET /inbox/comments 결과의 .id)
  accountId = Zernio 프로필 ID (웹훅 body.account.id)
  message   = 답장 텍스트
  commentId = 웹훅 body.comment.id (특정 댓글에 달 때)
  ⚠️ 웹훅 body.post.id = null → platformPostId로 Zernio postId 역조회 필요
  ⚠️ 구엔드포인트 POST /comments/{id}/reply { text } → HTML 반환 (동작 안함)

# DM (docs 확인 완료 — 2025-05)
POST /inbox/conversations/{conversationId}/messages → body: { accountId*, message }
  conversationId = 웹훅 body.conversation?.id || body.conversationId
  ⚠️ conversationId 없으면 스킵 (no_conversationId)
```

### Zernio 웹훅 body 구조 (실측)
```json
{
  "event": "comment.received",
  "comment": {
    "id": "...",           ← commentId (reply 엔드포인트에 사용)
    "text": "...",         ← 팔로워가 쓴 댓글 내용
    "platformPostId": "...", ← Instagram 게시물 ID
    "author": { "username": "..." },
    "isReply": false
  },
  "account": {
    "id": "69fbfc1992b3d8e85f86d277",  ← Zernio 프로필 ID
    "username": "millimilli.kr"
  }
}
```

### 반드시 지킬 작업 원칙
1. **Zernio 관련 코드 작업 전 이 섹션 먼저 읽기**
2. **API 엔드포인트는 추측하지 말 것** — 모르면 `docs.zernio.com/api/openapi` 확인
3. **`/inbox/comments`는 게시물 목록이지 팔로워 댓글 아님** — 혼동 금지
4. **발송 성공 여부는 반드시 Redis 로그(`channel:auto:comment:logs:*`)로 확인 후 보고**
5. **"완료" 보고 전 `success: true` + `resultRaw` 비어있음 확인 필수**

## 핵심 인프라
- **배포**: Vercel (Pro, 5분 cron 지원)
- **자동화**: n8n (https://peerstory.app.n8n.cloud)
- **Google Cloud Project**: 998424366713
- **n8n 워크플로우 ID**: SGHhOsshxLqG9EMj (Google Drive → YouTube & TikTok)

## 브랜드 정체성
- 앱명: **MILLI AI** (구 MINE AI)
- 회사명: **Millius Corp.**
- 아이콘: M 레터마크 SVG
- UI: Linear-style 다크 테마

## 📘 참고 문서 (Reference)
- **Persona Soul 프롬프트 가이드**: [docs/persona-soul-prompt-guide.md](./docs/persona-soul-prompt-guide.md)
  → V3 페르소나 실사화 프롬프트 설계/분포 트리거/Higgsfield Soul payload 검증값. 프롬프트 수정 전 필독.

## 9개 에이전트 구조
1. AI 크리에이터 (유민혜/밀리밀리/얼쎄라 채널)
2. AI 커뮤니티 (댓글/DM 관리)
3. AI CS매니저 (고객 문의)
4. AI 경영지원 (수출바우처, 정부지원)
5. AI 랭킹&리뷰 (카테고리 랭킹, 리뷰 모니터링)
6. AI 마케터 (ROAS, Meta 광고 5개 계정)
7. AI 커머스MD (프로모션 캘린더)
8. AI 수출 (국가별 매출, 바이어 파이프라인)
9. Chief AI (일간 체크, 연결 현황)

## 연결된 데이터 소스
### Google Sheets
- OLIVEYOUNG_SHEET_ID: `1FyoWviFOuibMBBZcIuvBAcziEhcxCgoDOhVHvN6xMxU`
  - 탭: 스킨케어파트 (gid=352972103)
  - 컬럼: A=날짜(YYYYMMDD), D=상품명, E=매출, F=판매량
- EXPORT_SHEET_ID: `1XmZ182hUzfcFTTGPc-fz_nLcGWfnVq-PjtnVLtXUWsY`

### Meta 광고 계정 (5개)
- 랄라라운지_한국: 855116430496295
- 밀리밀리_인하우스: 2327868604313508
- (외 3개 — META_AD_ACCOUNTS env에 JSON으로 저장)

### GA4
- 측정 ID: G-EGNE1592YF
- Property ID: 502757542
- ⚠️ GOOGLE_REFRESH_TOKEN에 analytics scope 미포함 → 403 에러 중

### Zernio (TikTok 업로드 대행)
- millimilli 프로필 ID: `69d08cc1986d57bb8f733102`
- yuminhye 프로필 ID: `69d08807986d57bb8f72f7e6`
- API Key: env에 저장

### 카페24
- Client ID: KfKTYHoLZKvLNhdgukf5JJ (몰ID: millius)
- 심사 진행 중

### TikTok API (MILLI Studio)
- App ID: 7622243906441103367
- 상태: In Review (4/4 재제출, 4월 4일)

## n8n 파이프라인 (SGHhOsshxLqG9EMj)
```
Watch Google Drive Folder (mine 업로드 폴더)
→ If (영상 파일 확인)
→ Download Video
→ HTTP Request: POST /api/video-analyze  ← Claude Vision 첫 프레임 분석
→ Combine Video and Metadata
→ Upload a video (YouTube) ← n8n YouTube account 크레덴셜
→ Upload to TikTok (Zernio) ← TikTok API 승인 대기 중
```

### /api/video-analyze 엔드포인트
- Input: `{ videoUrl: "구글드라이브 URL" }`
- Output: `{ youtube_title, youtube_description, tiktok_caption, hashtags, thumbnail_text }`

### YouTube 노드 현재 설정
- Credential: YouTube account (MBj8QSaVNRjRAkeK) — Account connected
- Input Binary Field: `videoData` (중요! `data` 아님)
- Title: `{{ $json.youtube_title }}` ← undefined 이슈 있음 (Combine 노드 JSON 구조 확인 필요)
- Description: `{{ $json.youtube_description }}`
- Tags: `{{ $json.hashtags }}`
- Region: Korea (KR), Category: People & Blogs

## 주요 PENDING 작업
- [ ] YouTube Title undefined 이슈 해결 (Combine 노드 output JSON 구조 확인 필요)
- [ ] GA4 analytics scope — GOOGLE_REFRESH_TOKEN 재발급 필요
- [ ] TikTok API 승인 대기 → 승인 시 n8n TikTok 노드 활성화
- [ ] 카페24 OAuth 앱 심사 완료

## 주요 계정/환경
- n8n YouTube Credential ID: MBj8QSaVNRjRAkeK
- TikTok @peerstory, YouTube @15초유민혜
- Google Cloud: 998424366713
- Vercel env에 모든 API 키 저장됨

## 개발 스타일
- Claude Code로 개발 → Vercel 자동 배포
- n8n으로 API 자동화 파이프라인
- Cowork(Claude in Chrome)으로 UI 조작

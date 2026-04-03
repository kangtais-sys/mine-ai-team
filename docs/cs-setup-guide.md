# MILLIMILLI CS 자동화 설정 가이드

## 1. 슬랙 앱 설정

1. https://api.slack.com/apps 접속
2. **Create New App** > **From scratch**
   - App Name: `밀리밀리 CS Bot`
   - Workspace: `08liter_global`
3. 왼쪽 메뉴 **Incoming Webhooks** > **Activate** 켜기
4. **Add New Webhook to Workspace** 클릭
5. `#밀리밀리` 채널 선택 > **Allow**
6. 생성된 **Webhook URL** 복사
7. Vercel 환경변수에 추가:
   ```
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
   ```

## 2. 구글시트 생성

1. https://sheets.google.com 에서 새 시트 생성
2. 파일명: `밀리밀리 CS 상담 현황`
3. 1행에 헤더 입력:

| A | B | C | D | E | F | G | H | I | J | K | L | M |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 상담날짜 | 상담시간 | 카톡아이디 | 고객이름 | 연락처 | 주소 | 상담종류 | 주요내용요약 | 마무리액션 | 상담종료여부 | 실무확인필요 | 2차처리담당자 | 비고 |

4. URL에서 시트 ID 복사: `https://docs.google.com/spreadsheets/d/{이 부분}/edit`
5. Vercel 환경변수에 추가:
   ```
   CS_GOOGLE_SHEET_ID=복사한_시트_ID
   ```
6. 구글 OAuth가 연동되어 있어야 시트 접근 가능 (대시보드에서 구글 계정 연동)

## 3. 카카오 오픈빌더 설정

1. https://center-pf.kakao.com 접속
2. 밀리밀리 채널 선택
3. **챗봇 관리** > **시나리오** > **폴백 블록** 설정
4. **스킬** 탭 > **스킬 생성**
   - 스킬명: `MINE AI 상담`
   - URL: `https://mine-ai-team.vercel.app/api/cs/kakao-webhook`
   - Method: POST
5. 폴백 블록에 스킬 연결
6. **배포** 클릭

## 4. 환경변수 최종 체크

Vercel 대시보드 (Settings > Environment Variables)에서:

| 변수 | 설명 |
|------|------|
| `ANTHROPIC_API_KEY` | Claude API 키 |
| `SLACK_WEBHOOK_URL` | 슬랙 #밀리밀리 웹훅 URL |
| `CS_GOOGLE_SHEET_ID` | 구글시트 ID |
| `GOOGLE_CLIENT_ID` | 구글 OAuth (시트 접근용) |
| `GOOGLE_CLIENT_SECRET` | 구글 OAuth |
| `GOOGLE_REFRESH_TOKEN` | 구글 OAuth (자동 저장됨) |

## 5. API 엔드포인트

| 엔드포인트 | 설명 |
|-----------|------|
| `POST /api/cs/kakao-webhook` | 카카오 챗봇 웹훅 (자동 상담 응답) |
| `GET /api/cs/daily-report` | 일일 보고 (Cron: 매일 9AM UTC = 오후 6시 KST) |

## 6. 동작 흐름

```
고객 카카오 문의
  → /api/cs/kakao-webhook
  → Claude AI 자동 응답 (MILLIMILLI CS 전문가)
  → 구글시트 자동 기록 (A~M 컬럼)
  → 실무확인 필요 시 슬랙 #밀리밀리 즉시 알림

매일 오후 6시 (KST)
  → /api/cs/daily-report (Cron)
  → 구글시트에서 당일 데이터 집계
  → 슬랙 #밀리밀리 일일 보고서 전송
```

## 7. 테스트

1. 카카오 오픈빌더에서 **테스트 봇** 실행
2. "안녕하세요 교환하고 싶어요" 입력
3. AI 응답 확인
4. 구글시트에 기록 확인
5. (에스컬레이션 시) 슬랙 알림 확인

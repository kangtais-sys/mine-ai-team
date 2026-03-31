# MINE AI Team

MILLIMILLI 브랜드를 위한 8개 AI 에이전트 팀 대시보드.

## 에이전트

| # | 에이전트 | 역할 |
|---|---------|------|
| 1 | Chief AI | 총괄 오케스트레이터 |
| 2 | AI 크리에이터 | 멀티채널 콘텐츠 제작 및 수익화 |
| 3 | AI 커뮤니티 | 댓글/DM 관리, 팔로워 관계 |
| 4 | AI CS매니저 | 고객 상담 자동 응대 |
| 5 | AI 마케터 | 성과 분석, 마케팅 전략 |
| 6 | AI 경영지원 | 매출/재고/회계/정부지원사업 |
| 7 | AI 상품개발 | 트렌드 기반 신제품 개발 |
| 8 | AI 글로벌 | 수출/해외 바이어/글로벌 확장 |

## 기술 스택

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Express + Claude API (claude-sonnet-4-20250514)
- **State**: Zustand
- **Charts**: Recharts

## 실행

```bash
# 패키지 설치
npm install

# 환경변수 설정
cp .env.example .env
# .env 파일에 ANTHROPIC_API_KEY 입력

# 프론트엔드 실행
npm run dev

# 백엔드 실행 (별도 터미널)
npm run dev:server

# 또는 동시 실행
npm run dev:all
```

## 디자인

- 블랙 & 화이트 모노톤
- 배경: #0A0A0A / 카드: #141414
- 폰트: Pretendard

// Vercel Edge Middleware — 대시보드 전체 비밀번호 보호(Basic Auth)
//
// 목적: 무인증으로 열려 있던 대시보드 + 데이터 API(/api/stats 매출, /api/chat,
//   /api/creator/calendar, /api/ranking 등)를 비번 1개 뒤로 한 번에 보호.
//
// 비번: 코드에 박지 않고 환경변수 DASHBOARD_PASSWORD 사용.
//   - 미설정 시 fail-open(전부 통과) → 비번 넣기 전까지 사이트 그대로(안 깨짐).
//   - 설정 시 보호 활성화. 아이디는 'milli' 고정, 비번만 DASHBOARD_PASSWORD.
//
// 예외(인증 없이 통과 — 외부/자동화가 들어와야 하는 곳):
//   /api/webhooks/*   Zernio 자동응대 웹훅 등
//   /api/cron/*       Vercel 크론(각자 CRON_SECRET 자체 검증)
//   /api/auth/*       OAuth 콜백/시작/상태
//   /api/video-analyze  n8n 호출

export const config = {
  // 정적 자산(assets, favicon, vite.svg)·이미지 최적화는 미들웨어 제외
  matcher: ['/((?!_next/static|_next/image|assets/|favicon.ico|vite.svg).*)'],
};

const PUBLIC_PREFIXES = [
  '/api/webhooks/',
  '/api/cron/',
  '/api/auth/',
  '/api/video-analyze',
  '/api/creator/ingest', // Cowork 콘텐츠 투입 — 자체 Bearer 시크릿으로 보호됨
  '/api/creator/ingest-capture', // 외부 페이지 캡처 인제스트(CORS) — 자체 Bearer 시크릿
  '/api/creator/render-card', // Cowork 카드 렌더 호출 — 자체 Bearer 시크릿
  '/api/creator/render-promo', // Cowork 수요일 프로모 렌더 호출 — 자체 Bearer 시크릿
  '/api/creator/render-ad', // 오너-후킹 전환광고 렌더 호출 — 자체 Bearer 시크릿
  '/api/creator/generate-image-ref', // Cowork 레퍼런스 이미지 생성 — 자체 Bearer 시크릿
];

export default function middleware(req) {
  const { pathname } = new URL(req.url);

  // 외부/자동화 진입점은 그대로 통과
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return;

  const got = req.headers.get('authorization') || '';

  // Vercel 크론 인증(Authorization: Bearer CRON_SECRET)은 경로 무관 통과.
  //   /api/sales/amazon·/api/sales/cafe24 처럼 크론이 직접 때리지만 /api/cron/* 가
  //   아닌 데이터 엔드포인트가 Basic Auth 에 막혀 캐시 갱신이 끊기는 것을 방지.
  //   (CRON_SECRET 을 모르는 외부인은 여전히 차단됨 — 데이터 노출 아님)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && got === `Bearer ${cronSecret}`) return;

  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return; // 미설정 → fail-open (사이트 안 깨짐)

  const expected = 'Basic ' + btoa('milli:' + password);

  if (got === expected) return; // 인증 통과

  return new Response('인증이 필요합니다 (MILLI AI)', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="MILLI AI Dashboard", charset="UTF-8"',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}

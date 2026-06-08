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
];

export default function middleware(req) {
  const { pathname } = new URL(req.url);

  // 외부/자동화 진입점은 그대로 통과
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return;

  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return; // 미설정 → fail-open (사이트 안 깨짐)

  const expected = 'Basic ' + btoa('milli:' + password);
  const got = req.headers.get('authorization') || '';

  if (got === expected) return; // 인증 통과

  return new Response('인증이 필요합니다 (MILLI AI)', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="MILLI AI Dashboard", charset="UTF-8"',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}

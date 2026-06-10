// 검증: middleware 가 Vercel 크론(Authorization: Bearer CRON_SECRET)을 통과시키는가?
// 실행: node scripts/test-middleware-cron.mjs
process.env.DASHBOARD_PASSWORD = 'pw';
process.env.CRON_SECRET = 'cronsecret';

const { default: middleware } = await import('../middleware.js');

function run(name, headers, expectPass) {
  const req = new Request('https://mine-ai-team.vercel.app/api/sales/amazon', { headers });
  const out = middleware(req);
  const passed = out === undefined; // undefined = 통과, Response = 차단
  const ok = passed === expectPass;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} → ${passed ? '통과' : '차단(401)'} (기대: ${expectPass ? '통과' : '차단'})`);
  return ok;
}

let all = true;
all &= run('크론 Bearer CRON_SECRET', { authorization: 'Bearer cronsecret' }, true);
all &= run('대시보드 Basic milli:pw', { authorization: 'Basic ' + btoa('milli:pw') }, true);
all &= run('무인증', {}, false);
all &= run('틀린 Bearer', { authorization: 'Bearer wrong' }, false);
console.log(all ? '\nALL PASS' : '\nSOME FAIL');
process.exit(all ? 0 : 1);

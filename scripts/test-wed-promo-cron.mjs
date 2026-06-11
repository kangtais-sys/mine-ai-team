// 로컬 dry 검증: wed-promo cron 핸들러를 dry=1 로 호출해 KR fresh 파싱·US 인자만 확인(렌더·시드 없음).
import handler from '../api/cron/wed-promo.js';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'localtest';

const req = { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, query: { dry: '1' } };
let out;
const res = { status(c) { this._c = c; return this; }, json(o) { out = { code: this._c, body: o }; return this; } };
await handler(req, res);
console.log('HTTP', out.code);
console.log(JSON.stringify(out.body, null, 2));

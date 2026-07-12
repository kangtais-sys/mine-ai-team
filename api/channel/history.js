import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

function parse(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { account, raw } = req.query;

  // ?raw=1 — 최근 웹훅 raw 로그 반환 (디버그용)
  // account 파라미터 있으면 계정별, 없으면 통합
  if (raw === '1') {
    const key = account
      ? `zernio:webhook:raw:${account}`
      : 'zernio:webhook:raw';
    const logs = await redis.lrange(key, 0, 49);
    const parsed = logs.map(l => { try { return typeof l === 'string' ? JSON.parse(l) : l; } catch { return l; } });
    return res.status(200).json({ key, rawLogs: parsed });
  }

  const parseList = (arr) => (arr || []).map(parse).filter(Boolean);

  // 계정별 로그/카운트를 정확한 Redis 키에서 읽는다 (계정 혼선 방지)
  async function fetchAccount(acct) {
    const [comments, dms, cc, dc] = await Promise.all([
      redis.lrange(`channel:auto:comment:logs:${acct}`, 0, 49),
      redis.lrange(`channel:auto:dm:logs:${acct}`, 0, 49),
      redis.get(`channel:auto:count:comment:${acct}`),
      redis.get(`channel:auto:count:dm:${acct}`),
    ]);
    return {
      comments: parseList(comments),
      dms: parseList(dms),
      counts: { comment: cc || 0, dm: dc || 0 },
      commentCount: cc || 0,
      dmCount: dc || 0,
    };
  }

  const ACCOUNTS = ['yuminhye', 'millimilli', 'millimilli_us', 'yu_milli'];

  // 특정 계정 요청
  if (account) {
    if (!ACCOUNTS.includes(account)) return res.status(400).json({ error: 'unknown account' });
    return res.status(200).json(await fetchAccount(account));
  }

  // 전체 계정 통합
  const all = await Promise.all(ACCOUNTS.map(fetchAccount));
  const result = {};
  ACCOUNTS.forEach((acct, i) => { result[acct] = all[i]; });
  return res.status(200).json(result);
}

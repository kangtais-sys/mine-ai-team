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

  const { account } = req.query;

  // Fetch logs for specific account or all
  const [ymComments, mmComments, ymDms, mmDms] = await Promise.all([
    redis.lrange('channel:auto:comment:logs:yuminhye', 0, 49),
    redis.lrange('channel:auto:comment:logs:millimilli', 0, 49),
    redis.lrange('channel:auto:dm:logs:yuminhye', 0, 49),
    redis.lrange('channel:auto:dm:logs:millimilli', 0, 49),
  ]);

  const [ymCC, mmCC, ymDC, mmDC] = await Promise.all([
    redis.get('channel:auto:count:comment:yuminhye'),
    redis.get('channel:auto:count:comment:millimilli'),
    redis.get('channel:auto:count:dm:yuminhye'),
    redis.get('channel:auto:count:dm:millimilli'),
  ]);

  const parseList = (arr) => (arr || []).map(parse).filter(Boolean);

  if (account) {
    return res.status(200).json({
      comments: parseList(account === 'yuminhye' ? ymComments : mmComments),
      dms: parseList(account === 'yuminhye' ? ymDms : mmDms),
      counts: {
        comment: account === 'yuminhye' ? (ymCC || 0) : (mmCC || 0),
        dm: account === 'yuminhye' ? (ymDC || 0) : (mmDC || 0),
      },
    });
  }

  return res.status(200).json({
    yuminhye: {
      comments: parseList(ymComments),
      dms: parseList(ymDms),
      counts: { comment: ymCC || 0, dm: ymDC || 0 },
    },
    millimilli: {
      comments: parseList(mmComments),
      dms: parseList(mmDms),
      counts: { comment: mmCC || 0, dm: mmDC || 0 },
    },
  });
}

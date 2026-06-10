import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ZERNIO = 'https://zernio.com/api/v1';
const PROFILES = {
  yuminhye:      '69d08807986d57bb8f72f7e6',
  millimilli:    '69d08cc1986d57bb8f733102',
  millimilli_us: '69fbfcd01fc1fdb66f249aa8',
};

// §2 — 토큰 끝 리터럴 '\n'·개행·따옴표 방어
const ZKEY = String(process.env.ZERNIO_API_KEY ?? '').replace(/\\[rn]/g, '').replace(/^["'\s]+|["'\s]+$/g, '');
const zFetch = (path) =>
  fetch(`${ZERNIO}${path}`, {
    headers: { Authorization: `Bearer ${ZKEY}` },
  }).then(r => r.ok ? r.json() : null).catch(() => null);

const mapAccounts = (data) =>
  (data?.accounts || []).map(a => ({
    platform: a.platform,
    username: a.username,
    displayName: a.displayName,
    followers: a.metadata?.profileData?.followersCount || 0,
    profilePicture: a.profilePicture || null,
    isActive: a.isActive,
  }));

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const today = new Date().toISOString().slice(0, 10);
    const cached = await redis.get(`creator-accounts:${today}`);
    if (cached) return res.status(200).json(cached);

    const [ymData, mlData, mlUsData, todayReport] = await Promise.all([
      zFetch(`/accounts?profileId=${PROFILES.yuminhye}`),
      zFetch(`/accounts?profileId=${PROFILES.millimilli}`),
      zFetch(`/accounts?profileId=${PROFILES.millimilli_us}`),
      redis.get(`creator-report:${today}`),
    ]);

    const result = {
      yuminhye: {
        label: '유민혜',
        profileId: PROFILES.yuminhye,
        accounts: mapAccounts(ymData),
      },
      millimilli: {
        label: '밀리밀리 KR',
        profileId: PROFILES.millimilli,
        accounts: mapAccounts(mlData),
      },
      millimilli_us: {
        label: '밀리밀리 US',
        profileId: PROFILES.millimilli_us,
        accounts: mapAccounts(mlUsData),
      },
      latestReport: todayReport?.report || null,
      generatedAt: new Date().toISOString(),
    };

    await redis.set(`creator-accounts:${today}`, result, { ex: 1800 });
    res.status(200).json(result);
  } catch (error) {
    console.error('[Creator Accounts]', error.message);
    res.status(500).json({ error: error.message });
  }
}

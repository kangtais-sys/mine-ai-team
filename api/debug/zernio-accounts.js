// 임시 디버그 — Zernio 프로필 + 계정 목록 + 웹훅 구독 + inbox access 조회
export default async function handler(req, res) {
  const ZERNIO = 'https://zernio.com/api/v1';
  const headers = {
    'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const zGet = async (path) => {
    const r = await fetch(`${ZERNIO}${path}`, { headers });
    const text = await r.text();
    try { return JSON.parse(text); } catch { return { error: `HTTP ${r.status}`, raw: text.slice(0, 500) }; }
  };

  const MM_KR_ID = '69fbfc1992b3d8e85f86d277';
  const LALA_ID = '69fca4b192b3d8e85f8cfea6';

  const [
    profiles,
    accounts,
    webhooks,
    mmInboxConvs,
    mmInboxConvsRecent,
    lalaInboxConvs,
    mmInboxAccess,
    lalaInboxAccess,
  ] = await Promise.all([
    zGet('/profiles'),
    zGet('/accounts'),
    // 현재 등록된 모든 웹훅 구독 목록
    zGet('/webhooks?limit=20'),
    // millimilli.kr conversations (최신 10개)
    zGet(`/inbox/conversations?accountId=${MM_KR_ID}&limit=10`),
    // millimilli.kr conversations 최신순
    zGet(`/inbox/conversations?accountId=${MM_KR_ID}&limit=5&sort=updatedAt&order=desc`),
    // lala_lounge_ conversations 비교용
    zGet(`/inbox/conversations?accountId=${LALA_ID}&limit=5`),
    // inbox access 상태 — millimilli.kr
    zGet(`/inbox/access?accountId=${MM_KR_ID}`),
    // inbox access 상태 — lala_lounge_
    zGet(`/inbox/access?accountId=${LALA_ID}`),
  ]);

  res.status(200).json({
    profiles,
    accounts,
    webhooks,
    mmInboxConvs,
    mmInboxConvsRecent,
    lalaInboxConvs,
    mmInboxAccess,
    lalaInboxAccess,
  });
}

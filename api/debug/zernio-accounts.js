// 임시 디버그 — Zernio 프로필 + 계정 목록 조회
export default async function handler(req, res) {
  const ZERNIO = 'https://zernio.com/api/v1';
  const headers = {
    'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const zGet = async (path) => {
    const r = await fetch(`${ZERNIO}${path}`, { headers });
    const text = await r.text();
    try { return JSON.parse(text); } catch { return { error: `HTTP ${r.status}`, raw: text.slice(0, 300) }; }
  };

  const [profiles, accounts, mmInbox, mmInboxConvs] = await Promise.all([
    zGet('/profiles'),
    zGet('/accounts'),
    // millimilli.kr 계정 ID로 inbox 메시지 조회
    zGet('/inbox/messages?accountId=69fbfc1992b3d8e85f86d277&limit=5'),
    // conversations 목록
    zGet('/inbox/conversations?accountId=69fbfc1992b3d8e85f86d277&limit=5'),
  ]);

  res.status(200).json({ profiles, accounts, mmInbox, mmInboxConvs });
}

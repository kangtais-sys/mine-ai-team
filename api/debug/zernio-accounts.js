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

  const [profiles, accounts] = await Promise.all([
    zGet('/profiles'),
    zGet('/accounts'),
  ]);

  res.status(200).json({ profiles, accounts });
}

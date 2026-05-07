import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) return res.status(200).json({ error: 'missing env vars' });

  const timestamp = String(Date.now() - 3000);
  const hashed = bcrypt.hashSync(`${clientId}_${timestamp}`, clientSecret);
  const client_secret_sign = Buffer.from(hashed).toString('base64');

  const fetchRes = await fetch('https://api.commerce.naver.com/external/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      timestamp,
      client_secret_sign,
      grant_type: 'client_credentials',
      type: 'SELF',
      account_type: 'SELLER',
    }),
  });

  const data = await fetchRes.json();
  res.status(200).json({ naver_status: fetchRes.status, naver_response: data });
}

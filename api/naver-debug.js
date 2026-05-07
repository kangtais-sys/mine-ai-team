import { createHmac } from 'crypto';

export default async function handler(req, res) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  const info = {
    clientId_set: !!clientId,
    clientId_len: clientId?.length,
    clientId_val: clientId,
    clientSecret_set: !!clientSecret,
    clientSecret_len: clientSecret?.length,
    clientSecret_first10: clientSecret?.slice(0, 10),
    clientSecret_last5: clientSecret?.slice(-5),
  };

  if (!clientId || !clientSecret) return res.status(200).json({ ...info, error: 'missing env vars' });

  const timestamp = Date.now();
  const sig = createHmac('sha256', clientSecret)
    .update(`${clientId}_${timestamp}`)
    .digest('base64');

  const body = new URLSearchParams({
    client_id: clientId,
    timestamp: String(timestamp),
    client_secret_sign: sig,
    grant_type: 'client_credentials',
    type: 'SELF',
    account_type: 'SELLER',
  });

  const fetchRes = await fetch('https://api.commerce.naver.com/external/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await fetchRes.json();
  res.status(200).json({ ...info, timestamp, sig_preview: sig.slice(0, 20), naver_status: fetchRes.status, naver_response: data });
}

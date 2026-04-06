export default function handler(req, res) {
  try {
    const mallId = (process.env.CAFE24_MALL_ID || 'millius').trim();
    const clientId = (process.env.CAFE24_CLIENT_ID || '').trim();

    if (!clientId) {
      return res.status(500).json({ error: 'CAFE24_CLIENT_ID not set' });
    }

    const redirectUri = encodeURIComponent('https://mine-ai-team.vercel.app/api/auth/cafe24-callback');
    const scope = encodeURIComponent('mall.read_order,mall.read_product,mall.read_store,mall.read_analytics');

    const authUrl = `https://${mallId}.cafe24.com/disp/common/oauth/authorize?response_type=code&client_id=${clientId}&state=mine-ai-team&redirect_uri=${redirectUri}&scope=${scope}`;

    console.log('[Cafe24 Auth] URL:', authUrl);

    // HTML meta refresh — Location 헤더 문제 우회
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${authUrl}"><title>Redirecting...</title></head><body><p>Redirecting to Cafe24...</p><p><a href="${authUrl}">Click here</a></p></body></html>`);
  } catch (error) {
    console.error('[Cafe24 Auth] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

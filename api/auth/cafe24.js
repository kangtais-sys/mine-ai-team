export default function handler(req, res) {
  try {
    const mallId = (process.env.CAFE24_MALL_ID || 'millius').replace(/[\r\n\s]/g, '');
    const clientId = (process.env.CAFE24_CLIENT_ID || '').replace(/[\r\n\s]/g, '');

    if (!clientId) {
      return res.status(500).json({ error: 'CAFE24_CLIENT_ID not set' });
    }

    const redirectUri = 'https://mine-ai-team.vercel.app/api/auth/cafe24-callback';
    const scope = 'mall.read_order,mall.read_product,mall.read_store,mall.read_analytics';

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      state: 'mine-ai-team',
      redirect_uri: redirectUri,
      scope: scope,
    });

    const authUrl = `https://${mallId}.cafe24.com/disp/common/oauth/authorize?${params.toString()}`;

    console.log('[Cafe24 Auth] mallId:', JSON.stringify(mallId), 'clientId:', JSON.stringify(clientId));
    console.log('[Cafe24 Auth] authUrl:', authUrl);

    // ?debug=1 이면 URL만 반환 (리다이렉트 안 함)
    if (req.query?.debug) {
      return res.status(200).json({ mallId, clientId: clientId.substring(0, 6) + '...', authUrl, redirectUri, scope });
    }

    // HTML meta refresh
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${authUrl}"><title>Redirecting...</title></head><body><p>Redirecting to Cafe24...</p><p><a href="${authUrl}">Click here</a></p></body></html>`);
  } catch (error) {
    console.error('[Cafe24 Auth] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

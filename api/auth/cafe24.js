export default function handler(req, res) {
  try {
    const mallId = process.env.CAFE24_MALL_ID || 'millius';
    const clientId = process.env.CAFE24_CLIENT_ID;

    if (!clientId) {
      return res.status(500).json({ error: 'CAFE24_CLIENT_ID not set' });
    }

    const host = req.headers?.host || 'mine-ai-team.vercel.app';
    const redirectUri = encodeURIComponent(`https://${host}/api/auth/cafe24-callback`);
    const scope = 'mall.read_order,mall.read_product,mall.read_store,mall.read_analytics';

    const url = `https://${mallId}.cafe24.com/disp/common/oauth/authorize?response_type=code&client_id=${clientId}&state=mine-ai-team&redirect_uri=${redirectUri}&scope=${scope}`;

    console.log('[Cafe24 Auth] Redirecting to:', url.substring(0, 100));
    res.writeHead(302, { Location: url });
    res.end();
  } catch (error) {
    console.error('[Cafe24 Auth] Error:', error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
}

export default function handler(req, res) {
  const mallId = process.env.CAFE24_MALL_ID || 'millius';
  const clientId = process.env.CAFE24_CLIENT_ID;

  if (!clientId) {
    return res.status(500).json({ error: 'CAFE24_CLIENT_ID not set' });
  }

  const redirectUri = `https://${req.headers.host || 'mine-ai-team.vercel.app'}/api/auth/cafe24-callback`;
  const scope = 'mall.read_order,mall.read_product,mall.read_store,mall.read_analytics';

  const url = `https://${mallId}.cafe24.com/disp/common/oauth/authorize?response_type=code&client_id=${clientId}&state=mine-ai-team&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;

  res.redirect(url);
}

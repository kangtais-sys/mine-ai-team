export default function handler(req, res) {
  const clientId = (process.env.CANVA_CLIENT_ID || '').trim();
  if (!clientId) return res.status(500).json({ error: 'CANVA_CLIENT_ID not set' });

  const redirectUri = encodeURIComponent('https://mine-ai-team.vercel.app/api/auth/canva-callback');
  const scope = encodeURIComponent('design:content:read design:content:write design:meta:read asset:read asset:write');
  const state = req.query?.show_token === '1' ? 'show_token' : 'default';

  const url = `https://www.canva.com/api/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${url}"></head><body><a href="${url}">Canva 인증</a></body></html>`);
}

const TIKTOK_REDIRECT_URI = 'https://mine-ai-team.vercel.app/api/auth/tiktok-callback';

export default function handler(req, res) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    return res.status(500).json({ error: 'TIKTOK_CLIENT_KEY not set' });
  }

  const scope = 'user.info.basic,video.publish,video.upload';
  const state = Math.random().toString(36).substring(2, 15);

  const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=${scope}&response_type=code&redirect_uri=${encodeURIComponent(TIKTOK_REDIRECT_URI)}&state=${state}`;

  console.log('[TikTok] OAuth redirect_uri:', TIKTOK_REDIRECT_URI);
  res.redirect(url);
}

// TikTok OAuth - redirect to authorization
export default function handler(req, res) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    return res.status(500).json({ error: 'TIKTOK_CLIENT_KEY not set' });
  }

  const redirectUri = process.env.TIKTOK_REDIRECT_URI;
  const scope = 'user.info.basic,video.publish,video.upload';
  const state = Math.random().toString(36).substring(2, 15);

  const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=${scope}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  res.redirect(url);
}

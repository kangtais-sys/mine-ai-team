// TikTok OAuth callback - exchange code for tokens
export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.redirect('/?tiktok_error=missing_code');
  }

  try {
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.TIKTOK_REDIRECT_URI || 'https://mine-ai-team.vercel.app/api/auth/tiktok-callback',
      }),
    });

    const data = await tokenRes.json();

    if (data.error || !data.access_token) {
      console.error('[TikTok] Token exchange failed:', data);
      return res.redirect('/?tiktok_error=' + encodeURIComponent(data.error_description || data.error || 'token_exchange_failed'));
    }

    // Store tokens in cookies
    const cookieOpts = 'Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000';
    const cookies = [
      `tiktok_access_token=${data.access_token}; ${cookieOpts}`,
      `tiktok_refresh_token=${data.refresh_token}; ${cookieOpts}`,
      `tiktok_connected=true; Path=/; Secure; SameSite=Lax; Max-Age=31536000`,
      `tiktok_open_id=${data.open_id || ''}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`,
    ];

    res.setHeader('Set-Cookie', cookies);
    res.redirect('/?tiktok_connected=true');
  } catch (error) {
    console.error('[TikTok] Callback error:', error.message);
    res.redirect('/?tiktok_error=' + encodeURIComponent(error.message));
  }
}

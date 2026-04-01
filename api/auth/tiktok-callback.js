// Save env var to Vercel via REST API
async function saveToVercelEnv(key, value) {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) {
    console.warn(`[TikTok] Cannot save ${key}: VERCEL_API_TOKEN or VERCEL_PROJECT_ID not set`);
    return false;
  }

  try {
    const checkRes = await fetch(
      `https://api.vercel.com/v10/projects/${projectId}/env?key=${key}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const checkData = await checkRes.json();
    const existing = checkData.envs?.find(e => e.key === key);

    if (existing) {
      await fetch(
        `https://api.vercel.com/v10/projects/${projectId}/env/${existing.id}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ value }),
        }
      );
    } else {
      await fetch(
        `https://api.vercel.com/v10/projects/${projectId}/env`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key,
            value,
            type: 'encrypted',
            target: ['production', 'preview', 'development'],
          }),
        }
      );
    }
    console.log(`[TikTok] Saved env var: ${key}`);
    return true;
  } catch (error) {
    console.error(`[TikTok] Failed to save ${key}:`, error.message);
    return false;
  }
}

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

    // Save tokens to Vercel env vars (so Cron can use them)
    await Promise.all([
      saveToVercelEnv('TIKTOK_ACCESS_TOKEN', data.access_token),
      data.refresh_token ? saveToVercelEnv('TIKTOK_REFRESH_TOKEN', data.refresh_token) : null,
    ]);

    // Also store in cookies for immediate use
    const cookieOpts = 'Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000';
    const cookies = [
      `tiktok_access_token=${data.access_token}; ${cookieOpts}`,
      `tiktok_refresh_token=${data.refresh_token || ''}; ${cookieOpts}`,
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

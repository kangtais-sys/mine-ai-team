import { google } from 'googleapis';

// Save env var to Vercel via REST API
async function saveToVercelEnv(key, value) {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) {
    console.warn(`[OAuth] Cannot save ${key}: VERCEL_API_TOKEN or VERCEL_PROJECT_ID not set`);
    return false;
  }

  try {
    // Try to update existing env var first
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
      console.log(`[OAuth] Updated env var: ${key}`);
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
      console.log(`[OAuth] Created env var: ${key}`);
    }
    return true;
  } catch (error) {
    console.error(`[OAuth] Failed to save ${key}:`, error.message);
    return false;
  }
}

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Save refresh_token to Vercel env vars (so Cron can use it)
    if (tokens.refresh_token) {
      await saveToVercelEnv('GOOGLE_REFRESH_TOKEN', tokens.refresh_token);
    }

    // Also store in cookies for immediate use
    const cookieOpts = 'Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000';
    const cookies = [
      `google_access_token=${tokens.access_token}; ${cookieOpts}`,
      `google_refresh_token=${tokens.refresh_token || ''}; ${cookieOpts}`,
      `google_email=${encodeURIComponent(userInfo.email)}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`,
      `google_connected=true; Path=/; Secure; SameSite=Lax; Max-Age=31536000`,
    ];

    if (tokens.expiry_date) {
      cookies.push(`google_expiry=${tokens.expiry_date}; ${cookieOpts}`);
    }

    res.setHeader('Set-Cookie', cookies);
    res.redirect('/?google_connected=true&email=' + encodeURIComponent(userInfo.email));
  } catch (error) {
    console.error('OAuth callback error:', error.message);
    res.redirect('/?google_error=' + encodeURIComponent(error.message));
  }
}

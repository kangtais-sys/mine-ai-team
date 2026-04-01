import { google } from 'googleapis';

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(c => {
    const [key, ...rest] = c.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  });
  return cookies;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cookies = parseCookies(req.headers.cookie);

  // Check cookies first (user OAuth flow)
  const refreshToken = cookies.google_refresh_token || process.env.GOOGLE_REFRESH_TOKEN;
  const email = cookies.google_email ? decodeURIComponent(cookies.google_email) : null;
  const connectedCookie = cookies.google_connected === 'true';

  if (!refreshToken && !connectedCookie) {
    return res.status(200).json({ connected: false, reason: 'not_connected' });
  }

  // If we have a refresh token, validate it
  if (refreshToken && process.env.GOOGLE_CLIENT_ID) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      oauth2Client.setCredentials({ refresh_token: refreshToken });
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);

      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data: userInfo } = await oauth2.userinfo.get();

      return res.status(200).json({
        connected: true,
        email: userInfo.email,
        scopes: ['drive', 'youtube.upload'],
      });
    } catch (error) {
      return res.status(200).json({
        connected: false,
        reason: 'token_expired',
        error: error.message,
      });
    }
  }

  // Cookie says connected but no refresh token to validate
  if (connectedCookie) {
    return res.status(200).json({
      connected: true,
      email: email || 'unknown',
      scopes: ['drive', 'youtube.upload'],
    });
  }

  return res.status(200).json({ connected: false, reason: 'no_token' });
}

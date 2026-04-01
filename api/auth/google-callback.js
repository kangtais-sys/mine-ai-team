import { google } from 'googleapis';

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

    // Get user email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Store tokens in httpOnly cookies (persist across serverless invocations)
    const cookieOpts = 'Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000';

    const cookies = [
      `google_access_token=${tokens.access_token}; ${cookieOpts}`,
      `google_refresh_token=${tokens.refresh_token}; ${cookieOpts}`,
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

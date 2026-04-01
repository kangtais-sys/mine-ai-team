import { google } from 'googleapis';

// Check if Google OAuth is configured and tokens are valid
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const hasCredentials = !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );

  if (!hasCredentials) {
    return res.status(200).json({
      connected: false,
      reason: 'missing_credentials',
    });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    // Try to get fresh access token
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);

    // Verify by getting user info
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

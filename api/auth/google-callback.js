import { google } from 'googleapis';

// Step 2: Handle OAuth callback, exchange code for tokens
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

    // Get user email for verification
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Store tokens in Vercel KV or environment
    // For now, we'll store in a simple JSON response and
    // the frontend will save to localStorage + show to user
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      email: userInfo.email,
    };

    // Redirect back to dashboard with token info
    const params = new URLSearchParams({
      google_connected: 'true',
      email: userInfo.email,
    });

    // Store tokens server-side for cron to use
    // Save refresh_token to process.env via Vercel API or KV
    // For MVP: redirect with success and instruct user to set env var
    res.redirect(`/?${params.toString()}`);
  } catch (error) {
    console.error('OAuth callback error:', error.message);
    res.redirect('/?google_error=' + encodeURIComponent(error.message));
  }
}

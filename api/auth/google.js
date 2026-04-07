import { google } from 'googleapis';

// Step 1: Redirect user to Google OAuth consent screen
export default function handler(req, res) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.force-ssl',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/spreadsheets.readonly',
  ];

  const showToken = req.query?.show_token === '1';
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state: showToken ? 'show_token' : 'default',
  });

  res.redirect(url);
}

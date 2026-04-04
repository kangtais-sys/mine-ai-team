import { google } from 'googleapis';

function getAuth() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  return oauth2Client;
}

let cachedToken = null;
let tokenExpiry = 0;

export async function getGoogleAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;
  const auth = getAuth();
  const { credentials } = await auth.refreshAccessToken();
  cachedToken = credentials.access_token;
  tokenExpiry = credentials.expiry_date;
  return cachedToken;
}

export async function readSheet(sheetId, range = 'A1:Z500') {
  const token = await getGoogleAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.error) throw new Error(`Sheets API: ${data.error.message}`);
  return data.values || [];
}

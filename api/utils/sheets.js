function parseCSV(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const cols = [];
    let inQuote = false;
    let cur = '';
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.replace(/\r$/, '').trim());
    rows.push(cols);
  }
  return rows;
}

// For PUBLIC Google Sheets — no OAuth needed
export async function readPublicSheet(sheetId, gid) {
  const url = gid != null
    ? `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
    : `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Public sheet HTTP ${res.status}: ${sheetId}`);
  return parseCSV(await res.text());
}

// Legacy OAuth-based reader (kept for private sheets if needed)
export async function readSheet(sheetId, range = 'A1:Z500') {
  const token = process.env.GOOGLE_REFRESH_TOKEN;
  if (!token) throw new Error('GOOGLE_REFRESH_TOKEN not set');
  const oauth = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: token,
      grant_type: 'refresh_token',
    }),
  });
  const { access_token, error } = await oauth.json();
  if (error) throw new Error(`OAuth error: ${error}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
  const data = await res.json();
  if (data.error) throw new Error(`Sheets API: ${data.error.message}`);
  return data.values || [];
}

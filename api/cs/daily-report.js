import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Slack notification
async function sendSlack(message) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  });
}

// Get today's rows from Google Sheets
async function getTodayRows() {
  const { google } = await import('googleapis');
  const sheetId = process.env.CS_GOOGLE_SHEET_ID;
  if (!sheetId) return [];

  let auth;
  if (process.env.GOOGLE_REFRESH_TOKEN && process.env.GOOGLE_CLIENT_ID) {
    auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  } else if (process.env.GOOGLE_CLIENT_EMAIL) {
    auth = new google.auth.GoogleAuth({
      credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  } else { return []; }

  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'A:M' });
  const rows = res.data.values || [];
  if (rows.length <= 1) return []; // header only

  const today = new Date().toLocaleDateString('ko-KR');
  return rows.slice(1).filter(r => r[0] === today);
}

export default async function handler(req, res) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const rows = await getTodayRows();
    const total = rows.length;

    if (total === 0) {
      await sendSlack(`📊 밀리밀리 CS 일일 현황 (${new Date().toLocaleDateString('ko-KR')})\n──────────────────\n오늘 상담 내역이 없습니다.\n──────────────────\n수고하셨습니다! 💪`);
      return res.status(200).json({ message: 'No consultations today' });
    }

    // Count by status (column J, index 9)
    const completed = rows.filter(r => r[9] === '완료').length;
    const needMore = rows.filter(r => r[9] === '추가상담필요').length;
    const incomplete = rows.filter(r => r[9] === '미완료').length;

    // Count by type (column G, index 6)
    const types = {};
    rows.forEach(r => { const t = r[6] || '기타'; types[t] = (types[t] || 0) + 1; });

    // Count escalations (column K, index 10)
    const escalations = rows.filter(r => r[10] === 'Y').length;

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${process.env.CS_GOOGLE_SHEET_ID}`;

    const typeLines = ['주문', '배송', '교환', '환불', '제품문의', '이벤트', '제휴제안', '기타']
      .filter(t => types[t])
      .map(t => `- ${t}: ${types[t]}건`)
      .join('\n');

    const report = `📊 밀리밀리 CS 일일 현황 (${new Date().toLocaleDateString('ko-KR')})
──────────────────
총 상담: ${total}건
✅ 완료: ${completed}건
⏳ 추가상담필요: ${needMore}건
❌ 미완료: ${incomplete}건

📋 유형별 현황:
${typeLines}

⚠️ 실무확인 필요: ${escalations}건
📎 상담 시트: ${sheetUrl}
──────────────────
수고하셨습니다! 💪`;

    await sendSlack(report);

    return res.status(200).json({ message: 'Daily report sent', total, completed, needMore, incomplete });
  } catch (error) {
    console.error('[CS] Daily report error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

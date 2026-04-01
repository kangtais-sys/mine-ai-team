import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const uploadFolderId = process.env.GOOGLE_DRIVE_UPLOAD_FOLDER_ID;
  if (!uploadFolderId) {
    return res.status(200).json({ pending: 0, recent: [] });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // Count pending files
    const videoMimes = [
      'video/mp4', 'video/quicktime', 'video/x-msvideo',
      'video/webm', 'video/x-matroska',
    ].map(m => `mimeType='${m}'`).join(' or ');

    const pending = await drive.files.list({
      q: `(${videoMimes}) and '${uploadFolderId}' in parents and trashed=false`,
      fields: 'files(id)',
    });

    // Read upload log
    const logRes = await drive.files.list({
      q: `name='upload-log.json' and '${uploadFolderId}' in parents and trashed=false`,
      fields: 'files(id)',
    });

    let recent = [];
    if (logRes.data.files.length > 0) {
      const content = await drive.files.get({
        fileId: logRes.data.files[0].id,
        alt: 'media',
      });
      const logs = Array.isArray(content.data) ? content.data : [];
      recent = logs.slice(-10).reverse(); // Last 10, newest first
    }

    return res.status(200).json({
      pending: pending.data.files?.length || 0,
      recent,
    });
  } catch (error) {
    return res.status(200).json({ pending: 0, recent: [], error: error.message });
  }
}

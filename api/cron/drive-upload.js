import { google } from 'googleapis';

export const config = { maxDuration: 300 };

function getAuth() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2Client;
}

async function ensureFreshToken(auth) {
  if (auth.credentials?.expiry_date && auth.credentials.expiry_date < Date.now() + 60000) {
    const { credentials } = await auth.refreshAccessToken();
    auth.setCredentials(credentials);
  }
}

// Claude Vision: 썸네일 분석 → 캡션/해시태그 생성
async function analyzeAndGenerate(thumbnailBase64) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: thumbnailBase64 } },
          { type: 'text', text: `이 영상 썸네일을 보고 K-뷰티 SNS 콘텐츠용 메타데이터를 JSON으로 생성해줘.
브랜드: 밀리밀리 (MILLIMILLI), 500달톤 프로틴 스킨케어
JSON만 응답:
{
  "youtube_title": "(60자 이내, 한국어, SEO 최적화)",
  "youtube_description": "(3-4줄, 브랜드 소개 + 구매링크 안내)",
  "tiktok_caption": "(150자 이내, 이모지 포함)",
  "hashtags": ["#밀리밀리", "#500달톤", "#K뷰티", ...10개],
  "thumbnail_text": "(10자 이내, 임팩트)"
}` },
        ],
      }],
    }),
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || '{}';
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : {};
}

// FFmpeg wasm 없이: Google Drive 썸네일로 대체
async function getThumbnail(drive, fileId) {
  try {
    // Google Drive는 영상 파일의 썸네일을 자동 생성
    const meta = await drive.files.get({ fileId, fields: 'thumbnailLink' });
    if (meta.data.thumbnailLink) {
      const thumbRes = await fetch(meta.data.thumbnailLink.replace('=s220', '=s1280'));
      const buf = await thumbRes.arrayBuffer();
      return Buffer.from(buf).toString('base64');
    }
  } catch {}
  return null;
}

// YouTube 업로드 (썸네일 포함)
async function uploadToYouTube(auth, fileBuffer, metadata, thumbnailBuffer) {
  await ensureFreshToken(auth);
  const youtube = google.youtube({ version: 'v3', auth });
  const { Readable } = await import('stream');

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: (metadata.youtube_title || 'Untitled').substring(0, 100),
        description: metadata.youtube_description || '',
        tags: metadata.hashtags || [],
        categoryId: '26',
        defaultLanguage: 'ko',
      },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    },
    media: { mimeType: 'video/mp4', body: Readable.from(fileBuffer) },
  });

  const videoId = res.data.id;

  // 썸네일 업로드
  if (thumbnailBuffer && videoId) {
    try {
      await youtube.thumbnails.set({
        videoId,
        media: { mimeType: 'image/jpeg', body: Readable.from(thumbnailBuffer) },
      });
      console.log(`[Drive Upload] Thumbnail set for ${videoId}`);
    } catch (e) {
      console.warn(`[Drive Upload] Thumbnail failed: ${e.message}`);
    }
  }

  return { videoId, title: metadata.youtube_title };
}

// Zernio TikTok 업로드
async function uploadToZernio(videoUrl, metadata) {
  if (!process.env.ZERNIO_API_KEY) return { skipped: true, reason: 'no_zernio_key' };
  const caption = `${metadata.tiktok_caption || ''}\n${(metadata.hashtags || []).join(' ')}`;
  const res = await fetch('https://zernio.com/api/v1/posts', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileId: process.env.ZERNIO_YUMINHYE_PROFILE_ID || '69d08807986d57bb8f72f7e6',
      platforms: ['tiktok'],
      text: caption.substring(0, 2200),
      mediaUrl: videoUrl,
    }),
  });
  return res.json();
}

// Google Sheets 기록
async function logToSheet(auth, result) {
  const sheetId = process.env.UPLOAD_LOG_SHEET_ID;
  if (!sheetId) return;
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          new Date().toISOString(),
          result.fileName,
          result.youtube?.videoId || '-',
          result.youtube?.title || '-',
          result.tiktok?.success ? 'OK' : result.tiktok?.error || '-',
          result.metadata?.tiktok_caption || '-',
        ]],
      },
    });
  } catch (e) {
    console.warn(`[Drive Upload] Sheet log failed: ${e.message}`);
  }
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const uploadFolderId = process.env.GOOGLE_DRIVE_UPLOAD_FOLDER_ID;
  if (!uploadFolderId) return res.status(200).json({ message: 'GOOGLE_DRIVE_UPLOAD_FOLDER_ID not set', processed: 0 });

  try {
    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });

    // 영상 파일 감지
    const videoMimes = ['video/mp4', 'video/quicktime', 'video/webm'].map(m => `mimeType='${m}'`).join(' or ');
    const files = await drive.files.list({
      q: `(${videoMimes}) and '${uploadFolderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, size, webContentLink)',
      orderBy: 'createdTime',
      pageSize: 3,
    });

    if (!files.data.files?.length) {
      console.log('[Drive Upload] 새 파일 없음');
      return res.status(200).json({ message: 'No new files', processed: 0 });
    }

    // 완료 폴더
    let doneFolderId;
    const doneSearch = await drive.files.list({
      q: `name='완료' and '${uploadFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    });
    if (doneSearch.data.files?.length) {
      doneFolderId = doneSearch.data.files[0].id;
    } else {
      const f = await drive.files.create({
        requestBody: { name: '완료', mimeType: 'application/vnd.google-apps.folder', parents: [uploadFolderId] },
        fields: 'id',
      });
      doneFolderId = f.data.id;
    }

    const results = [];

    for (const file of files.data.files) {
      const result = { fileName: file.name, metadata: null, youtube: null, tiktok: null };

      try {
        console.log(`[Drive Upload] Processing: ${file.name}`);

        // 1. 썸네일 추출
        const thumbBase64 = await getThumbnail(drive, file.id);

        // 2. Claude AI 분석
        let metadata = {};
        if (thumbBase64) {
          metadata = await analyzeAndGenerate(thumbBase64);
        } else {
          // 파일명 기반 fallback
          metadata = {
            youtube_title: file.name.replace(/\.[^.]+$/, ''),
            youtube_description: '밀리밀리 500달톤 프로틴 스킨케어',
            tiktok_caption: file.name.replace(/\.[^.]+$/, '') + ' ✨',
            hashtags: ['#밀리밀리', '#500달톤', '#K뷰티', '#스킨케어', '#kbeauty'],
          };
        }
        result.metadata = metadata;
        console.log(`[Drive Upload] AI metadata: ${metadata.youtube_title}`);

        // 3. 영상 다운로드
        const download = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
        const fileBuffer = Buffer.from(download.data);

        // 썸네일 바이너리 (YouTube 업로드용)
        let thumbBuffer = null;
        if (thumbBase64) thumbBuffer = Buffer.from(thumbBase64, 'base64');

        // 4. YouTube 업로드
        try {
          result.youtube = await uploadToYouTube(auth, fileBuffer, metadata, thumbBuffer);
          console.log(`[Drive Upload] YouTube: ${result.youtube.videoId}`);
        } catch (e) {
          result.youtube = { error: e.message };
          console.error(`[Drive Upload] YouTube error: ${e.message}`);
        }

        // 5. Zernio TikTok 업로드
        try {
          const videoUrl = `https://drive.google.com/uc?id=${file.id}&export=download`;
          result.tiktok = await uploadToZernio(videoUrl, metadata);
          console.log(`[Drive Upload] TikTok: ${JSON.stringify(result.tiktok).substring(0, 100)}`);
        } catch (e) {
          result.tiktok = { error: e.message };
        }

        // 6. Google Sheets 기록
        await logToSheet(auth, result);

        // 7. 완료 폴더로 이동 (하나라도 성공 시)
        if (result.youtube?.videoId || result.tiktok?.success) {
          await drive.files.update({
            fileId: file.id,
            addParents: doneFolderId,
            removeParents: uploadFolderId,
            fields: 'id, parents',
          });
        }
      } catch (e) {
        result.error = e.message;
        console.error(`[Drive Upload] File error (${file.name}): ${e.message}`);
      }

      results.push(result);
    }

    return res.status(200).json({ processed: results.length, results });
  } catch (error) {
    console.error(`[Drive Upload] Fatal: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
}

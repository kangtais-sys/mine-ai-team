import { google } from 'googleapis';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Vercel Cron - runs every 5 minutes
export const config = {
  maxDuration: 300,
};

// Google Auth - supports both OAuth (user tokens) and Service Account
function getAuth() {
  // Prefer OAuth refresh token if available (user-connected)
  if (process.env.GOOGLE_REFRESH_TOKEN && process.env.GOOGLE_CLIENT_ID) {
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

  // Fallback to service account
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ],
  });
}

// Find or create a folder by name under a parent
async function findOrCreateFolder(drive, name, parentId) {
  const res = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  if (res.data.files.length > 0) return res.data.files[0].id;

  const folder = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  });
  return folder.data.id;
}

// Generate platform-optimized text via Claude
async function generateContent(fileName, platform) {
  const prompts = {
    tiktok: `당신은 MILLIMILLI 브랜드의 틱톡 콘텐츠 전문가입니다.
파일명: "${fileName}"

이 영상의 틱톡 업로드용 텍스트를 생성해주세요.

규칙:
- 첫 줄: 강렬한 훅 (한국어+영어 믹스, 15자 이내)
- 본문: 2~3줄, 호기심 유발, 이모지 활용
- 해시태그: 트렌드 태그 + 브랜드 태그, 최대 5개
- 총 글자수 150자 이내 (틱톡 제한)
- MILLIMILLI K뷰티 브랜드 톤: 친근한 언니 느낌
- 영어 해시태그 필수 포함 (#kbeauty #millimilli)

JSON 형식으로만 응답:
{"caption": "...", "hashtags": ["...", "..."]}`,

    youtube: `당신은 MILLIMILLI 브랜드의 유튜브 쇼츠 SEO 전문가입니다.
파일명: "${fileName}"

이 영상의 유튜브 쇼츠 업로드용 텍스트를 생성해주세요.

규칙:
- title: SEO 최적화 제목, 50자 이내, 키워드 포함
- description: 3~5줄, 키워드 자연 삽입, 구매 링크 안내 포함
  · 1줄: 영상 설명
  · 2줄: 제품 포인트
  · 3줄: "더 많은 K뷰티 팁은 밀리밀리에서! 🔗"
  · 4줄: 관련 키워드
- tags: SEO 태그 10개 (한국어+영어)
- MILLIMILLI K뷰티 브랜드 톤: 전문적이면서 친근

JSON 형식으로만 응답:
{"title": "...", "description": "...", "tags": ["...", "..."]}`,
  };

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompts[platform] }],
  });

  const text = response.content[0]?.text || '{}';
  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
}

// Upload to TikTok via API
async function uploadToTiktok(fileBuffer, fileName, content) {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (!accessToken) return { success: false, error: 'TIKTOK_ACCESS_TOKEN not set' };

  try {
    // Step 1: Initialize upload
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: '', // Will be set after Drive sharing
        },
      }),
    });

    // TikTok API requires video URL - we'll use the publish intent flow
    const caption = `${content.caption || ''}\n${(content.hashtags || []).map(t => `#${t.replace('#', '')}`).join(' ')}`;

    const publishRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        post_info: {
          title: caption.substring(0, 150),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_comment: false,
          disable_duet: false,
          disable_stitch: false,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: fileBuffer.length,
          chunk_size: fileBuffer.length,
          total_chunk_count: 1,
        },
      }),
    });

    const publishData = await publishRes.json();
    if (publishData.data?.upload_url) {
      await fetch(publishData.data.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        body: fileBuffer,
      });
    }

    return { success: true, publishId: publishData.data?.publish_id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Upload to YouTube Shorts
async function uploadToYoutube(auth, fileBuffer, fileName, content) {
  try {
    const youtube = google.youtube({ version: 'v3', auth });

    const { Readable } = await import('stream');
    const stream = Readable.from(fileBuffer);

    const res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: (content.title || fileName).substring(0, 100),
          description: content.description || '',
          tags: content.tags || [],
          categoryId: '26', // Howto & Style
          defaultLanguage: 'ko',
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false,
          madeForKids: false,
        },
      },
      media: {
        mimeType: 'video/mp4',
        body: stream,
      },
    });

    return { success: true, videoId: res.data.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Store upload log (append to a JSON file in Drive)
async function logUpload(drive, folderId, logEntry) {
  const logFileName = 'upload-log.json';
  const res = await drive.files.list({
    q: `name='${logFileName}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
  });

  let logs = [];
  if (res.data.files.length > 0) {
    const content = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
    logs = Array.isArray(content.data) ? content.data : [];
    await drive.files.update({
      fileId: res.data.files[0].id,
      media: { mimeType: 'application/json', body: JSON.stringify([...logs, logEntry]) },
    });
  } else {
    await drive.files.create({
      requestBody: { name: logFileName, parents: [folderId], mimeType: 'application/json' },
      media: { mimeType: 'application/json', body: JSON.stringify([logEntry]) },
    });
  }
}

export default async function handler(req, res) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const uploadFolderId = process.env.GOOGLE_DRIVE_UPLOAD_FOLDER_ID;
  if (!uploadFolderId) {
    return res.status(500).json({ error: 'GOOGLE_DRIVE_UPLOAD_FOLDER_ID not set' });
  }

  try {
    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });

    // 1. List video files in "MINE 업로드" folder
    const videoMimes = [
      'video/mp4', 'video/quicktime', 'video/x-msvideo',
      'video/webm', 'video/x-matroska',
    ].map(m => `mimeType='${m}'`).join(' or ');

    const files = await drive.files.list({
      q: `(${videoMimes}) and '${uploadFolderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, size)',
      orderBy: 'createdTime',
      pageSize: 5, // Process max 5 per run
    });

    if (!files.data.files?.length) {
      return res.status(200).json({ message: 'No new files', processed: 0 });
    }

    // 2. Find or create "완료" folder
    const doneFolderId = await findOrCreateFolder(drive, '완료', uploadFolderId);

    const results = [];

    for (const file of files.data.files) {
      const result = { fileName: file.name, tiktok: null, youtube: null };

      try {
        // Download file
        const download = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        const fileBuffer = Buffer.from(download.data);

        // Generate content for both platforms (parallel)
        const [tiktokContent, youtubeContent] = await Promise.all([
          generateContent(file.name, 'tiktok'),
          generateContent(file.name, 'youtube'),
        ]);

        // Upload to both platforms (parallel)
        const [tiktokResult, youtubeResult] = await Promise.all([
          uploadToTiktok(fileBuffer, file.name, tiktokContent),
          uploadToYoutube(auth, fileBuffer, file.name, youtubeContent),
        ]);

        result.tiktok = { ...tiktokResult, content: tiktokContent };
        result.youtube = { ...youtubeResult, content: youtubeContent };

        // Move file to "완료" folder
        await drive.files.update({
          fileId: file.id,
          addParents: doneFolderId,
          removeParents: uploadFolderId,
          fields: 'id, parents',
        });

        // Log the upload
        await logUpload(drive, uploadFolderId, {
          timestamp: new Date().toISOString(),
          fileName: file.name,
          tiktok: tiktokResult,
          youtube: youtubeResult,
        });

      } catch (fileError) {
        result.error = fileError.message;
      }

      results.push(result);
    }

    return res.status(200).json({
      message: `Processed ${results.length} files`,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('Upload pipeline error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

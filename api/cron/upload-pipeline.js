import { google } from 'googleapis';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export const config = {
  maxDuration: 300,
};

// Retry wrapper: retries fn up to maxRetries on failure
async function withRetry(fn, maxRetries = 2, label = '') {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLast = attempt === maxRetries;
      console.error(`[${label}] attempt ${attempt + 1}/${maxRetries + 1} failed: ${error.message}`);
      if (!isLast) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

// Google Auth with automatic token refresh (KV 우선)
async function getAuth() {
  let refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  // KV에 최신 토큰이 있으면 우선 사용
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    const kvToken = await redis.get('google:refresh_token');
    if (kvToken) refreshToken = kvToken;
  } catch {}

  if (refreshToken && process.env.GOOGLE_CLIENT_ID) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return oauth2Client;
  }

  throw new Error('Google refresh token not found');
}

// Manually refresh access_token if needed (fallback)
async function ensureFreshToken(auth) {
  if (auth.credentials?.expiry_date && auth.credentials.expiry_date < Date.now() + 60000) {
    console.log('[YouTube] Access token expired or expiring soon, refreshing...');
    try {
      const { credentials } = await auth.refreshAccessToken();
      auth.setCredentials(credentials);
      console.log('[YouTube] Token refreshed, new expiry:', new Date(credentials.expiry_date).toISOString());
    } catch (error) {
      console.error('[YouTube] Token refresh failed:', error.message);
      throw new Error(`YouTube token refresh failed: ${error.message}. 대시보드에서 구글 계정 재연동이 필요합니다.`);
    }
  }
}

function findOrCreateFolder(drive, name, parentId) {
  return withRetry(async () => {
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
  }, 1, 'Drive:findOrCreateFolder');
}

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
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
}

// TikTok: refresh access_token using refresh_token
async function refreshTiktokToken() {
  const refreshToken = process.env.TIKTOK_REFRESH_TOKEN;
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  if (!refreshToken || !clientKey || !clientSecret) {
    return null;
  }

  console.log('[TikTok] Refreshing access token...');
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await res.json();
  if (data.access_token) {
    console.log('[TikTok] Token refreshed successfully');
    return data.access_token;
  }

  console.error('[TikTok] Token refresh failed:', data.error || data.error_description);
  return null;
}

// TikTok upload: try direct API first, fallback to Zernio
async function uploadToTiktok(fileBuffer, fileName, content) {
  // Zernio fallback if no direct TikTok token
  let accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (!accessToken) {
    console.log('[TikTok] No direct token, using Zernio fallback');
    if (process.env.ZERNIO_API_KEY) {
      try {
        const caption = `${content.caption || content.title || fileName}\n${(content.hashtags || []).map(t => `#${t.replace('#', '')}`).join(' ')}`;
        const zRes = await fetch('https://zernio.com/api/v1/posts', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: process.env.ZERNIO_YUMINHYE_PROFILE_ID || '69d08807986d57bb8f72f7e6',
            platforms: ['tiktok'],
            text: caption.substring(0, 2200),
          }),
        });
        const zData = await zRes.json();
        console.log('[TikTok] Zernio fallback:', zRes.ok ? 'success' : zData.error);
        return { success: zRes.ok, via: 'zernio', tokenExpired: false };
      } catch (e) {
        console.error('[TikTok] Zernio fallback error:', e.message);
      }
    }
    return { success: false, error: 'TIKTOK_ACCESS_TOKEN not set, Zernio unavailable', tokenExpired: false };
  }

  async function attemptUpload(token) {
    const caption = `${content.caption || ''}\n${(content.hashtags || []).map(t => `#${t.replace('#', '')}`).join(' ')}`;

    const publishRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
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

    return { res: publishRes, data: await publishRes.json() };
  }

  return withRetry(async () => {
    let { res: publishRes, data: publishData } = await attemptUpload(accessToken);

    // Detect token expiry → try auto-refresh
    const isExpired = publishData.error?.code === 'access_token_invalid' ||
        publishData.error?.code === 'token_expired' ||
        publishRes.status === 401;

    if (isExpired) {
      console.log('[TikTok] Token expired, attempting refresh...');
      const newToken = await refreshTiktokToken();
      if (newToken) {
        accessToken = newToken;
        const retry = await attemptUpload(newToken);
        publishRes = retry.res;
        publishData = retry.data;
      } else {
        const msg = '틱톡 토큰 만료 — 재로그인 필요';
        console.error(`[TikTok] ${msg}`);
        return { success: false, error: msg, tokenExpired: true };
      }
    }

    if (publishData.error) {
      console.error('[TikTok] API error:', JSON.stringify(publishData.error));
      throw new Error(publishData.error.message || publishData.error.code || 'TikTok API error');
    }

    if (publishData.data?.upload_url) {
      const uploadRes = await fetch(publishData.data.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        body: fileBuffer,
      });
      if (!uploadRes.ok) {
        throw new Error(`TikTok upload failed: HTTP ${uploadRes.status}`);
      }
    }

    console.log(`[TikTok] Upload success: ${fileName}, publishId: ${publishData.data?.publish_id}`);
    return { success: true, publishId: publishData.data?.publish_id, tokenExpired: false };
  }, 2, `TikTok:${fileName}`);
}

// YouTube upload with token refresh and retry
async function uploadToYoutube(auth, fileBuffer, fileName, content) {
  return withRetry(async () => {
    // Ensure fresh token before upload
    if (auth.credentials?.refresh_token) {
      await ensureFreshToken(auth);
    }

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
          categoryId: '26',
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

    console.log(`[YouTube] Upload success: ${fileName}, videoId: ${res.data.id}`);
    return { success: true, videoId: res.data.id };
  }, 2, `YouTube:${fileName}`);
}

async function logUpload(drive, folderId, logEntry) {
  try {
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
  } catch (error) {
    console.error('[Log] Failed to write upload log:', error.message);
  }
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const uploadFolderId = process.env.GOOGLE_DRIVE_UPLOAD_FOLDER_ID;
  if (!uploadFolderId) {
    return res.status(500).json({ error: 'GOOGLE_DRIVE_UPLOAD_FOLDER_ID not set' });
  }

  try {
    const auth = await getAuth();
    const drive = google.drive({ version: 'v3', auth });

    const videoMimes = [
      'video/mp4', 'video/quicktime', 'video/x-msvideo',
      'video/webm', 'video/x-matroska',
    ].map(m => `mimeType='${m}'`).join(' or ');

    const files = await drive.files.list({
      q: `(${videoMimes}) and '${uploadFolderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, size)',
      orderBy: 'createdTime',
      pageSize: 5,
    });

    if (!files.data.files?.length) {
      return res.status(200).json({ message: 'No new files', processed: 0 });
    }

    const doneFolderId = await findOrCreateFolder(drive, '완료', uploadFolderId);
    const results = [];

    for (const file of files.data.files) {
      const result = { fileName: file.name, tiktok: null, youtube: null };

      try {
        const download = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        const fileBuffer = Buffer.from(download.data);

        const [tiktokContent, youtubeContent] = await Promise.all([
          generateContent(file.name, 'tiktok'),
          generateContent(file.name, 'youtube'),
        ]);

        const [tiktokResult, youtubeResult] = await Promise.all([
          uploadToTiktok(fileBuffer, file.name, tiktokContent).catch(e => {
            console.error(`[Pipeline] TikTok upload error (${file.name}):`, e.message, e.response?.data || '');
            return { success: false, error: e.message, tokenExpired: false };
          }),
          uploadToYoutube(auth, fileBuffer, file.name, youtubeContent).catch(e => {
            console.error(`[Pipeline] YouTube upload error (${file.name}):`, e.message, e.response?.data || '');
            return { success: false, error: e.message };
          }),
        ]);

        result.tiktok = { ...tiktokResult, content: tiktokContent };
        result.youtube = { ...youtubeResult, content: youtubeContent };

        // Only move to "완료" if at least one platform succeeded
        if (tiktokResult.success || youtubeResult.success) {
          await drive.files.update({
            fileId: file.id,
            addParents: doneFolderId,
            removeParents: uploadFolderId,
            fields: 'id, parents',
          });
        }

        await logUpload(drive, uploadFolderId, {
          timestamp: new Date().toISOString(),
          fileName: file.name,
          tiktok: { success: tiktokResult.success, error: tiktokResult.error, tokenExpired: tiktokResult.tokenExpired },
          youtube: { success: youtubeResult.success, error: youtubeResult.error, videoId: youtubeResult.videoId },
        });

      } catch (fileError) {
        console.error(`[Pipeline] File processing error (${file.name}):`, fileError.message);
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
    console.error('[Pipeline] Fatal error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

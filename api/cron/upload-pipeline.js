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

// 첫 프레임 추출: 영상 바이너리에서 Drive 썸네일 가져오기
async function getFirstFrame(drive, fileId, fileBuffer) {
  // Method 1: Extract first frame from video buffer using video-thumbnails API
  if (fileBuffer) {
    try {
      // Google Video Intelligence API or manual approach
      // For serverless: use Drive's export with specific timestamp
      const exportUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920&t=0`;
      const r = await fetch(exportUrl);
      if (r.ok && r.headers.get('content-type')?.includes('image')) {
        const buf = await r.arrayBuffer();
        if (buf.byteLength > 1000) {
          console.log('[Pipeline] First frame via Drive thumbnail t=0');
          return Buffer.from(buf);
        }
      }
    } catch {}
  }

  // Method 2: Drive thumbnailLink (fallback - may not be first frame)
  try {
    const meta = await drive.files.get({ fileId, fields: 'thumbnailLink' });
    if (meta.data.thumbnailLink) {
      const thumbUrl = meta.data.thumbnailLink.replace(/=s\d+/, '=s1920');
      const r = await fetch(thumbUrl);
      if (r.ok) {
        const buf = await r.arrayBuffer();
        console.log('[Pipeline] First frame via Drive thumbnailLink (fallback)');
        return Buffer.from(buf);
      }
    }
  } catch (e) {
    console.error('[Pipeline] First frame extraction failed:', e.message);
  }
  return null;
}

// Claude Vision으로 첫 프레임 분석 → 캡션/해시태그 생성
async function generateContentFromFrame(frameBuffer, fileName, platform) {
  if (!frameBuffer) {
    // Fallback: 파일명 기반
    return generateContentFallback(fileName, platform);
  }

  const base64 = frameBuffer.toString('base64');
  const prompt = platform === 'tiktok'
    ? `이 영상의 첫 프레임 이미지를 분석해줘.

1. 이미지에 보이는 텍스트를 모두 읽어줘 (한국어/영어 모두)
2. 이 텍스트와 이미지 내용을 기반으로 틱톡 캡션을 만들어줘

브랜드: 밀리밀리 (MILLIMILLI), 500달톤 프로틴 스킨케어
규칙:
- 이미지에 있는 텍스트를 최대한 활용
- 첫 줄: 강렬한 훅 (15자 이내)
- 본문: 2~3줄, 이모지 활용
- 해시태그: 5개 (#kbeauty #millimilli 포함)
- 총 150자 이내

JSON만 응답:
{"caption": "...", "hashtags": ["...", "..."], "detected_text": "이미지에서 읽은 텍스트"}`
    : `이 영상의 첫 프레임 이미지를 분석해줘.

1. 이미지에 보이는 텍스트를 모두 읽어줘 (한국어/영어 모두)
2. 이 텍스트와 이미지 내용을 기반으로 유튜브 쇼츠 메타데이터를 만들어줘

브랜드: 밀리밀리 (MILLIMILLI), 500달톤 프로틴 스킨케어
규칙:
- 이미지의 텍스트를 제목에 반영
- title: SEO 최적화, 50자 이내
- description: 3~4줄 (영상 설명 + 제품 포인트 + "프로필 링크에서 더 알아보세요! 🔗")
- tags: 10개 (한국어+영어)

JSON만 응답:
{"title": "...", "description": "...", "tags": ["...", "..."], "detected_text": "이미지에서 읽은 텍스트"}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const result = JSON.parse(match[0]);
      console.log(`[Pipeline] Vision detected text: "${result.detected_text || 'none'}"`);
      return result;
    }
  } catch (e) {
    console.error('[Pipeline] Vision analysis failed:', e.message);
  }

  return generateContentFallback(fileName, platform);
}

// Fallback: 파일명 기반 캡션 생성
async function generateContentFallback(fileName, platform) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: platform === 'tiktok'
      ? `파일명 "${fileName}" 기반 틱톡 캡션. JSON: {"caption":"...","hashtags":["#밀리밀리","#kbeauty",...]}`
      : `파일명 "${fileName}" 기반 유튜브 쇼츠. JSON: {"title":"...","description":"...","tags":["밀리밀리","kbeauty",...]}` }],
  });
  const text = response.content[0]?.text || '{}';
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : {};
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

// YouTube upload with token refresh, retry, and thumbnail
async function uploadToYoutube(auth, fileBuffer, fileName, content, thumbnailBuffer) {
  return withRetry(async () => {
    // Ensure fresh token before upload
    if (auth.credentials?.refresh_token) {
      await ensureFreshToken(auth);
    }

    const youtube = google.youtube({ version: 'v3', auth });

    const { Readable } = await import('stream');
    const stream = Readable.from(fileBuffer);

    // 해시태그를 description 끝에 추가
    const tags = content.tags || [];
    const hashtags = tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ');
    const description = `${content.description || ''}\n\n${hashtags}`.trim();

    const res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: (content.title || fileName).substring(0, 100),
          description,
          tags,
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

    const videoId = res.data.id;
    console.log(`[YouTube] Upload success: ${fileName}, videoId: ${videoId}`);

    // Set thumbnail from first frame
    if (thumbnailBuffer && videoId) {
      try {
        const { Readable: ThumbReadable } = await import('stream');
        await youtube.thumbnails.set({
          videoId,
          media: { mimeType: 'image/jpeg', body: ThumbReadable.from(thumbnailBuffer) },
        });
        console.log(`[YouTube] Thumbnail set for ${videoId}`);
      } catch (thumbErr) {
        console.warn(`[YouTube] Thumbnail failed: ${thumbErr.message}`);
      }
    }

    return { success: true, videoId };
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
        // 1. 영상 다운로드 먼저
        const download = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        const fileBuffer = Buffer.from(download.data);
        console.log(`[Pipeline] Downloaded: ${file.name} (${fileBuffer.length} bytes)`);

        // 2. 첫 프레임 추출 (영상 버퍼 전달)
        const frameBuffer = await getFirstFrame(drive, file.id, fileBuffer);
        console.log(`[Pipeline] First frame: ${frameBuffer ? `${frameBuffer.length} bytes` : 'not available'}`);

        // 3. Claude Vision으로 첫 프레임 분석 → 캡션/해시태그 생성
        const [tiktokContent, youtubeContent] = await Promise.all([
          generateContentFromFrame(frameBuffer, file.name, 'tiktok'),
          generateContentFromFrame(frameBuffer, file.name, 'youtube'),
        ]);

        const [tiktokResult, youtubeResult] = await Promise.all([
          uploadToTiktok(fileBuffer, file.name, tiktokContent).catch(e => {
            console.error(`[Pipeline] TikTok upload error (${file.name}):`, e.message, e.response?.data || '');
            return { success: false, error: e.message, tokenExpired: false };
          }),
          uploadToYoutube(auth, fileBuffer, file.name, youtubeContent, frameBuffer).catch(e => {
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

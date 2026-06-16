import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';

export const config = { maxDuration: 120 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const anthropic = new Anthropic();

const ZERNIO = 'https://zernio.com/api/v1';
const zFetch = (path, opts = {}) =>
  fetch(`${ZERNIO}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${process.env.ZERNIO_API_KEY}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  }).then(r => r.json());

const LALA_PROFILE_ID = (process.env.ZERNIO_YUMINHYE_PROFILE_ID || '69d08807986d57bb8f72f7e6').trim();

async function optimizeCaption(platform, originalCaption) {
  const instructions = {
    tiktok: '60자 이내 후킹 캡션 + 해시태그 7개 (한국어, TikTok 스타일)',
    youtube: 'SEO 최적화 제목(60자) + 설명(300자) + 태그 10개 (한국어)',
  };

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `원본 캡션: "${originalCaption}"\n\n${instructions[platform]}\n\n결과만 출력해줘.`,
    }],
  });
  return res.content[0]?.text || originalCaption;
}

async function getYouTubeAccessToken() {
  const { getGoogleRefreshToken } = await import('../utils/google-auth.js');
  const refreshToken = await getGoogleRefreshToken();
  if (!refreshToken) return null;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await r.json();
  return data.access_token;
}

async function uploadToYouTube(mediaUrl, title, description) {
  const accessToken = await getYouTubeAccessToken();
  if (!accessToken) throw new Error('YouTube access token failed');

  // Download media from Zernio URL
  const mediaRes = await fetch(mediaUrl);
  if (!mediaRes.ok) throw new Error(`Media download failed: ${mediaRes.status}`);
  const mediaBuffer = await mediaRes.arrayBuffer();

  // 1) Initialize resumable upload
  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/*',
        'X-Upload-Content-Length': mediaBuffer.byteLength,
      },
      body: JSON.stringify({
        snippet: { title, description, categoryId: '22' },
        status: { privacyStatus: 'public' },
      }),
    }
  );

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) throw new Error('No upload URL from YouTube');

  // 2) Upload video bytes
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'video/*',
      'Content-Length': mediaBuffer.byteLength,
    },
    body: mediaBuffer,
  });

  const ytData = await uploadRes.json();
  return ytData.id;
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const kvKey = `creator-crosspost:lala:${today}`;

  try {
    // 1) Get recent @lala_lounge_ posts from Zernio
    const postsData = await zFetch(`/posts?profileId=${LALA_PROFILE_ID}&limit=10`);
    const posts = postsData?.posts || postsData || [];

    // 2) Get already processed post IDs
    const processed = (await redis.get(kvKey)) || [];
    const results = [];

    for (const post of Array.isArray(posts) ? posts : []) {
      const postId = post._id || post.id;
      if (!postId || processed.includes(postId)) continue;

      const caption = post.text || post.caption || '';
      const mediaUrl = post.mediaUrl || post.media?.[0]?.url;
      if (!mediaUrl) continue;

      const taskResult = { postId, tiktok: null, youtube: null, error: null };

      try {
        // 3) Optimize captions with Claude
        const [ttCaption, ytMeta] = await Promise.all([
          optimizeCaption('tiktok', caption),
          optimizeCaption('youtube', caption),
        ]);

        // 4) Post to TikTok via Zernio (@peerstory)
        await zFetch('/posts', {
          method: 'POST',
          body: JSON.stringify({
            profileId: LALA_PROFILE_ID,
            text: ttCaption,
            platforms: ['tiktok'],
            mediaUrl,
          }),
        });
        taskResult.tiktok = 'posted';

        // 5) Upload to YouTube (@15초유민혜)
        const ytLines = ytMeta.split('\n');
        const ytTitle = ytLines[0]?.replace(/^제목[:：]?\s*/i, '').trim() || caption.slice(0, 60);
        const ytDesc = ytLines.slice(1).join('\n').trim() || caption;

        const ytVideoId = await uploadToYouTube(mediaUrl, ytTitle, ytDesc);
        taskResult.youtube = ytVideoId;
      } catch (e) {
        taskResult.error = e.message;
      }

      processed.push(postId);
      results.push(taskResult);
    }

    await redis.set(kvKey, processed, { ex: 86400 });

    // Save crosspost log
    const logKey = `creator-crosspost-log:${today}`;
    const existing = (await redis.get(logKey)) || [];
    if (results.length > 0) {
      await redis.set(logKey, [...existing, ...results], { ex: 86400 * 7 });
    }

    return res.status(200).json({ success: true, processed: results.length, results });
  } catch (error) {
    console.error('[Creator Crosspost]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

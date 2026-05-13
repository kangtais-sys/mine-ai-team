import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ZERNIO = 'https://zernio.com/api/v1';

// 밀리밀리 Zernio 프로필 ID
const MILLIMILLI_PROFILE_ID = process.env.ZERNIO_MILLIMILLI_PROFILE_ID || '69d08cc1986d57bb8f733102';

const zPost = async (body) => {
  const res = await fetch(`${ZERNIO}/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ZERNIO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
};

// 플랫폼별 mediaItems 구성
function buildMediaItems(draft) {
  const isVideo = draft.format === 'reel' || draft.format === 'shorts';
  const isCardNews = draft.format === 'cardnews';

  if (isVideo && draft.mediaUrl) {
    return [{ type: 'video', url: draft.mediaUrl, filename: 'content.mp4' }];
  }
  if (isCardNews && draft.mediaUrls?.length > 0) {
    return draft.mediaUrls.map((url, i) => ({ type: 'image', url, filename: `slide_${i + 1}.jpg` }));
  }
  return [];
}

// 플랫폼별 platformSpecificData
function buildPlatformData(platform, draft) {
  const caption = [draft.caption, draft.hashtags].filter(Boolean).join('\n\n');
  switch (platform) {
    case 'instagram':
      return { caption };
    case 'tiktok':
      return { caption: caption.substring(0, 2200) };
    case 'youtube':
      return {
        title: (draft.hook || draft.caption || '').substring(0, 100),
        description: caption,
        tags: (draft.hashtags || '').replace(/#/g, '').split(' ').filter(Boolean).slice(0, 30),
      };
    default:
      return { caption };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id 필수' });

  const raw = await redis.get(`creator:draft:${id}`).catch(() => null);
  if (!raw) return res.status(404).json({ error: '드래프트 없음' });
  const draft = typeof raw === 'string' ? JSON.parse(raw) : raw;

  if (!['review', 'scheduled'].includes(draft.status)) {
    return res.status(400).json({ error: `발행 불가 상태: ${draft.status}` });
  }

  if (!process.env.ZERNIO_API_KEY) {
    return res.status(500).json({ error: 'ZERNIO_API_KEY 없음' });
  }

  const platforms = draft.platforms || ['instagram'];
  const mediaItems = buildMediaItems(draft);
  const caption = [draft.caption, draft.hashtags].filter(Boolean).join('\n\n');

  try {
    // Zernio /posts 발행
    const body = {
      profileId: MILLIMILLI_PROFILE_ID,
      text: caption,
      platforms: platforms.map(platform => ({
        platform,
        platformSpecificData: buildPlatformData(platform, draft),
      })),
      status: 'published',
      ...(mediaItems.length > 0 && { mediaItems }),
    };

    const result = await zPost(body);

    if (result.error || result.message?.includes('error')) {
      const updated = {
        ...draft,
        status: 'failed',
        error: result.error || result.message,
        updatedAt: new Date().toISOString(),
      };
      await redis.set(`creator:draft:${id}`, updated, { ex: 86400 * 30 });
      return res.status(500).json({ error: result.error || result.message, result });
    }

    // 발행 성공
    const now = new Date().toISOString();
    const published = {
      ...draft,
      status: 'published',
      publishedAt: now,
      publishResult: { postId: result._id || result.id, platforms, via: 'zernio' },
      updatedAt: now,
    };
    await redis.set(`creator:draft:${id}`, published, { ex: 86400 * 30 });

    // 발행 로그 기록
    const today = new Date().toISOString().slice(0, 10);
    await redis.lpush(`publish-log:${today}`, JSON.stringify({
      id,
      brand: draft.brand,
      format: draft.format,
      pillar: draft.pillar,
      platforms,
      postId: result._id || result.id,
      publishedAt: now,
    }));

    return res.status(200).json({ success: true, draft: published, postId: result._id || result.id });
  } catch (e) {
    console.error('[Creator Publish]', e.message);
    const failed = { ...draft, status: 'failed', error: e.message, updatedAt: new Date().toISOString() };
    await redis.set(`creator:draft:${id}`, failed, { ex: 86400 * 30 }).catch(() => {});
    return res.status(500).json({ error: e.message });
  }
}

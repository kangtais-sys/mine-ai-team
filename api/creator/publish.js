import { getSupabase } from '../../lib/supabase.js';

const ZERNIO = 'https://zernio.com/api/v1';
const MILLIMILLI_PROFILE_ID = (process.env.ZERNIO_MILLIMILLI_PROFILE_ID || '69d08cc1986d57bb8f733102').trim();

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

function buildMediaItems(draft) {
  const isVideo = draft.format === 'reel' || draft.format === 'shorts';
  const isCardNews = draft.format === 'cardnews';
  if (isVideo && draft.mediaUrl) return [{ type: 'video', url: draft.mediaUrl, filename: 'content.mp4' }];
  if (isCardNews && draft.mediaUrls?.length > 0) return draft.mediaUrls.map((url, i) => ({ type: 'image', url, filename: `slide_${i + 1}.jpg` }));
  return [];
}

function buildPlatformData(platform, draft) {
  const caption = [draft.caption, draft.hashtags].filter(Boolean).join('\n\n');
  switch (platform) {
    case 'instagram': return { caption };
    case 'tiktok': return { caption: caption.substring(0, 2200) };
    case 'youtube': return {
      title: (draft.hook || draft.caption || '').substring(0, 100),
      description: caption,
      tags: (draft.hashtags || '').replace(/#/g, '').split(' ').filter(Boolean).slice(0, 30),
    };
    default: return { caption };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sb = getSupabase();

  // 새 CreatorShell V2 발행 (sceneVideos + platforms 기반)
  const { draftId, personaId, sceneVideos, caption, platforms, scheduledAt, bgmUrl, title } = req.body || {};
  if (!draftId && !personaId) {
    // 구형 id 기반 발행
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id 필수' });

    const { data: row } = await sb.from('creator_drafts').select('data').eq('id', id).single();
    if (!row) return res.status(404).json({ error: '드래프트 없음' });
    const draft = row.data;

    if (!['review', 'scheduled'].includes(draft.status)) {
      return res.status(400).json({ error: `발행 불가 상태: ${draft.status}` });
    }
    if (!process.env.ZERNIO_API_KEY) return res.status(500).json({ error: 'ZERNIO_API_KEY 없음' });

    const pList = draft.platforms || ['instagram'];
    const mediaItems = buildMediaItems(draft);
    const cap = [draft.caption, draft.hashtags].filter(Boolean).join('\n\n');

    try {
      const result = await zPost({
        profileId: MILLIMILLI_PROFILE_ID,
        text: cap,
        platforms: pList.map(p => ({ platform: p, platformSpecificData: buildPlatformData(p, draft) })),
        status: 'published',
        ...(mediaItems.length > 0 && { mediaItems }),
      });
      if (result.error || result.message?.includes('error')) {
        const updated = { ...draft, status: 'failed', error: result.error || result.message, updatedAt: new Date().toISOString() };
        await sb.from('creator_drafts').update({ data: updated }).eq('id', id);
        return res.status(500).json({ error: result.error || result.message });
      }
      const now = new Date().toISOString();
      const published = { ...draft, status: 'published', publishedAt: now, publishResult: { postId: result._id || result.id, platforms: pList, via: 'zernio' }, updatedAt: now };
      await sb.from('creator_drafts').update({ data: published }).eq('id', id);
      return res.status(200).json({ success: true, draft: published, postId: result._id || result.id });
    } catch (e) {
      const failed = { ...draft, status: 'failed', error: e.message, updatedAt: new Date().toISOString() };
      await sb.from('creator_drafts').update({ data: failed }).eq('id', id).catch(() => {});
      return res.status(500).json({ error: e.message });
    }
  }

  // V2: n8n 파이프라인 트리거 (sceneVideos → YouTube/TikTok)
  try {
    const n8nWebhookUrl = process.env.N8N_PUBLISH_WEBHOOK;
    if (n8nWebhookUrl) {
      await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, personaId, sceneVideos, caption, platforms, scheduledAt, bgmUrl, title }),
      }).catch(() => {});
    }
    return res.status(200).json({ success: true, published: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

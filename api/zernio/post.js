const ZERNIO_BASE = 'https://zernio.com/api/v1';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ZERNIO_API_KEY;
  const profileId = process.env.ZERNIO_PROFILE_ID;
  if (!apiKey) return res.status(500).json({ error: 'ZERNIO_API_KEY not set' });

  try {
    const { text, mediaUrl, platforms, scheduledAt } = req.body;

    const body = {
      profileId: profileId,
      text: text || '',
      platforms: platforms || ['instagram'],
    };

    if (mediaUrl) body.mediaUrl = mediaUrl;
    if (scheduledAt) body.scheduledAt = scheduledAt;

    const zRes = await fetch(`${ZERNIO_BASE}/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await zRes.json();

    if (!zRes.ok) {
      console.error('[Zernio] Post failed:', data);
      return res.status(zRes.status).json({ error: data.message || 'Post failed', details: data });
    }

    console.log(`[Zernio] Post success: platforms=${platforms?.join(',')}`);
    return res.status(200).json({ success: true, post: data });
  } catch (error) {
    console.error('[Zernio] Post error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

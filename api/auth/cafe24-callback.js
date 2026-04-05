import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    console.error('[Cafe24 OAuth] Error:', error);
    return res.redirect('/?cafe24_error=' + encodeURIComponent(error));
  }

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  const mallId = process.env.CAFE24_MALL_ID || 'millius';
  const clientId = process.env.CAFE24_CLIENT_ID;
  const clientSecret = process.env.CAFE24_CLIENT_SECRET;
  const redirectUri = `https://${req.headers.host || 'mine-ai-team.vercel.app'}/api/auth/cafe24-callback`;

  try {
    const tokenRes = await fetch(`https://${mallId}.cafe24api.com/api/v2/oauth/token`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error('[Cafe24 OAuth] Token error:', tokenData);
      return res.redirect('/?cafe24_error=' + encodeURIComponent(tokenData.error_description || tokenData.error));
    }

    // Save tokens to KV
    await Promise.all([
      redis.set('cafe24:access_token', tokenData.access_token, { ex: tokenData.expires_in || 3600 }),
      redis.set('cafe24:refresh_token', tokenData.refresh_token),
      redis.set('cafe24:mall_id', mallId),
      redis.set('cafe24:scopes', tokenData.scopes?.join(',') || ''),
    ]);

    console.log('[Cafe24 OAuth] Token saved, scopes:', tokenData.scopes);

    res.redirect('/?cafe24_connected=true');
  } catch (error) {
    console.error('[Cafe24 OAuth] Callback error:', error.message);
    res.redirect('/?cafe24_error=' + encodeURIComponent(error.message));
  }
}

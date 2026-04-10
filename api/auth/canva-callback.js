import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  const { code, state, error } = req.query;
  if (error) return res.redirect('/?canva_error=' + encodeURIComponent(error));
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    const tokenRes = await fetch('https://api.canva.com/rest/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://mine-ai-team.vercel.app/api/auth/canva-callback',
      }),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      console.error('[Canva OAuth] Error:', tokenData);
      return res.redirect('/?canva_error=' + encodeURIComponent(tokenData.error_description || tokenData.error));
    }

    await Promise.all([
      redis.set('canva:access_token', tokenData.access_token, { ex: tokenData.expires_in || 3600 }),
      tokenData.refresh_token && redis.set('canva:refresh_token', tokenData.refresh_token),
    ]);

    console.log('[Canva OAuth] Token saved');

    if (state === 'show_token') {
      return res.status(200).json({ message: 'Canva token saved', scopes: tokenData.scope });
    }

    res.redirect('/?canva_connected=true');
  } catch (error) {
    console.error('[Canva OAuth]', error.message);
    res.redirect('/?canva_error=' + encodeURIComponent(error.message));
  }
}

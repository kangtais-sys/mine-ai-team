export default function handler(req, res) {
  if (req.method === 'GET') {
    // Parse query params from URL directly (fallback for Vercel parsing issues)
    const url = new URL(req.url, `https://${req.headers.host || 'mine-ai-team.vercel.app'}`);
    const mode = url.searchParams.get('hub.mode') || req.query?.['hub.mode'];
    const token = url.searchParams.get('hub.verify_token') || req.query?.['hub.verify_token'];
    const challenge = url.searchParams.get('hub.challenge') || req.query?.['hub.challenge'];

    console.log('[Meta Webhook] URL:', req.url);
    console.log('[Meta Webhook] Parsed:', { mode, token, challenge });

    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'millimilli2024secret';

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[Meta Webhook] Verified!');
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).end(String(challenge));
    }

    return res.status(403).end('Forbidden');
  }

  if (req.method === 'POST') {
    console.log('[Meta Webhook] Event:', JSON.stringify(req.body, null, 2));
    return res.status(200).json({ received: true });
  }

  return res.status(405).end('Method not allowed');
}

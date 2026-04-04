export default function handler(req, res) {
  // GET: Meta webhook verification
  if (req.method === 'GET') {
    // Vercel may parse "hub.mode" as nested or flat — try both
    const q = req.query || {};
    const mode = q['hub.mode'] || q['hub_mode'] || q.hub?.mode;
    const token = q['hub.verify_token'] || q['hub_verify_token'] || q.hub?.verify_token;
    const challenge = q['hub.challenge'] || q['hub_challenge'] || q.hub?.challenge;

    console.log('[Meta Webhook] GET query keys:', Object.keys(q));
    console.log('[Meta Webhook] Parsed:', { mode, token, challenge });
    console.log('[Meta Webhook] Raw URL:', req.url);

    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'millimilli2024secret';

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[Meta Webhook] ✅ Verified!');
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).end(String(challenge));
    }

    console.log('[Meta Webhook] ❌ Failed. Expected token:', verifyToken?.substring(0, 5) + '...');
    return res.status(403).end('Forbidden');
  }

  // POST: Receive webhook events
  if (req.method === 'POST') {
    const body = req.body;
    console.log('[Meta Webhook] Event:', JSON.stringify(body, null, 2));

    if (body.object === 'instagram') {
      body.entry?.forEach(entry => {
        entry.changes?.forEach(change => {
          if (change.field === 'comments') {
            console.log('[Meta] Comment:', JSON.stringify(change.value));
          }
          if (change.field === 'messages') {
            console.log('[Meta] Message:', JSON.stringify(change.value));
          }
        });
      });
    }

    return res.status(200).json({ received: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default function handler(req, res) {
  // GET: Meta webhook verification
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('[Meta Webhook] Verification request:', { mode, token: token?.substring(0, 5) + '...', challenge });

    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'millimilli2024secret';

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[Meta Webhook] Verified!');
      // Must return challenge as plain text, not JSON
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).end(String(challenge));
    }

    console.log('[Meta Webhook] Verification failed - token mismatch');
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

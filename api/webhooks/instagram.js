export default function handler(req, res) {
  if (req.method === 'GET') {
    const url = req.url || '';
    const queryString = url.includes('?') ? url.split('?')[1] : '';
    const params = Object.fromEntries(new URLSearchParams(queryString));

    const mode = params['hub.mode'];
    const token = params['hub.verify_token'];
    const challenge = params['hub.challenge'];
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

    const body = req.body;
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

  return res.status(405).end('Method not allowed');
}

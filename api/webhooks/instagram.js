export default function handler(req, res) {
  // GET: Meta webhook verification
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      console.log('[Meta Webhook] Verified!');
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  // POST: Receive webhook events
  if (req.method === 'POST') {
    const body = req.body;
    console.log('[Meta Webhook] Received:', JSON.stringify(body, null, 2));

    if (body.object === 'instagram') {
      body.entry?.forEach(entry => {
        entry.changes?.forEach(change => {
          if (change.field === 'comments') {
            console.log('[Meta] New comment:', JSON.stringify(change.value));
          }
          if (change.field === 'messages') {
            console.log('[Meta] New message:', JSON.stringify(change.value));
          }
        });
      });
    }

    return res.status(200).json({ received: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

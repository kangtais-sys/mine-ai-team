export default function handler(req, res) {
  if (req.method === 'GET') {
    const url = req.url || '';
    const queryString = url.includes('?') ? url.split('?')[1] : '';
    const params = Object.fromEntries(new URLSearchParams(queryString));

    const mode = params['hub.mode'];
    const token = params['hub.verify_token'];
    const challenge = params['hub.challenge'];
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'millimilli2024secret';

    // Debug: return all parsed info
    if (!mode && !token) {
      return res.status(200).json({
        debug: true,
        url: req.url,
        queryString,
        params,
        reqQuery: req.query,
      });
    }

    if (mode === 'subscribe' && token === verifyToken) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).end(String(challenge));
    }

    return res.status(403).json({ error: 'Forbidden', mode, tokenMatch: token === verifyToken, envToken: verifyToken?.substring(0, 5) });
  }

  if (req.method === 'POST') {
    console.log('[Meta Webhook] Event:', JSON.stringify(req.body, null, 2));
    return res.status(200).json({ received: true });
  }

  return res.status(405).end('Method not allowed');
}

export const config = {
  maxDuration: 120,
};

export default async function handler(req, res) {
  // Allow both cron (GET with auth) and manual trigger (POST with auth)
  const authHeader = req.headers.authorization;
  const isManual = req.method === 'POST';

  if (!isManual && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const webhookUrl = process.env.N8N_INSTAGRAM_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('[Instagram Cron] N8N_INSTAGRAM_WEBHOOK_URL not set');
    return res.status(500).json({ error: 'N8N_INSTAGRAM_WEBHOOK_URL not set' });
  }

  try {
    console.log(`[Instagram Cron] Triggering n8n webhook (${isManual ? 'manual' : 'cron'})...`);

    const n8nRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trigger: isManual ? 'manual' : 'cron',
        timestamp: new Date().toISOString(),
      }),
    });

    const n8nData = await n8nRes.text();
    console.log(`[Instagram Cron] n8n response: ${n8nRes.status} - ${n8nData.substring(0, 200)}`);

    return res.status(200).json({
      success: true,
      trigger: isManual ? 'manual' : 'cron',
      n8nStatus: n8nRes.status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Instagram Cron] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

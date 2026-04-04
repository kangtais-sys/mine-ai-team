export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.HAPPYTALK_API_KEY) {
    return res.status(200).json({
      status: 'pending',
      message: '해피톡 API 연동 준비 중',
      channels: {
        millimilli: process.env.HAPPYTALK_CHANNEL_ID_MILLI ? 'configured' : 'pending',
        lalaLounge: process.env.HAPPYTALK_CHANNEL_ID_LALA ? 'configured' : 'pending',
      },
    });
  }

  try {
    const channels = [
      { name: '밀리밀리', id: process.env.HAPPYTALK_CHANNEL_ID_MILLI },
      { name: '랄라라운지', id: process.env.HAPPYTALK_CHANNEL_ID_LALA },
    ].filter(c => c.id);

    const results = await Promise.all(channels.map(async (ch) => {
      try {
        const r = await fetch(`https://api.happytalk.io/v1/channels/${ch.id}/tickets?status=open`, {
          headers: { Authorization: `Bearer ${process.env.HAPPYTALK_API_KEY}` },
        });
        const data = await r.json();
        return { name: ch.name, openTickets: data.total || data.length || 0, data: data.tickets || data };
      } catch (e) { return { name: ch.name, error: e.message }; }
    }));

    return res.status(200).json({ status: 'connected', channels: results });
  } catch (error) {
    return res.status(200).json({ status: 'error', error: error.message });
  }
}

const ZERNIO_BASE = 'https://zernio.com/api/v1';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ZERNIO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ZERNIO_API_KEY not set' });

  try {
    const [accountsRes, profilesRes, statsRes] = await Promise.all([
      fetch(`${ZERNIO_BASE}/accounts`, { headers: { 'Authorization': `Bearer ${apiKey}` } }),
      fetch(`${ZERNIO_BASE}/profiles`, { headers: { 'Authorization': `Bearer ${apiKey}` } }),
      fetch(`${ZERNIO_BASE}/usage-stats`, { headers: { 'Authorization': `Bearer ${apiKey}` } }),
    ]);

    const accounts = await accountsRes.json();
    const profiles = await profilesRes.json();
    const stats = await statsRes.json();

    // Filter millimilli profile accounts
    const profileId = process.env.ZERNIO_PROFILE_ID;
    const milliAccounts = (accounts.accounts || []).filter(
      a => a.profileId?._id === profileId || a.profileId === profileId
    );

    return res.status(200).json({
      accounts: milliAccounts.map(a => ({
        id: a._id,
        platform: a.platform,
        username: a.username,
        displayName: a.displayName,
        followers: a.metadata?.profileData?.followersCount || 0,
        isActive: a.isActive,
        profileUrl: a.profileUrl,
      })),
      profiles: profiles.profiles || [],
      stats: stats,
    });
  } catch (error) {
    console.error('[Zernio] Accounts error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

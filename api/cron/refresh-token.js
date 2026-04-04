import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { maxDuration: 30 };

// 매월 1일: Instagram 장기 토큰 갱신
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 현재 토큰 (KV 우선, env fallback)
    const currentToken = await redis.get('instagram_access_token').catch(() => null)
      || process.env.INSTAGRAM_ACCESS_TOKEN;

    if (!currentToken) {
      return res.status(500).json({ error: 'No current token' });
    }

    // Instagram 장기 토큰 갱신
    const refreshRes = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${currentToken}`
    );
    const refreshData = await refreshRes.json();

    if (refreshData.access_token) {
      // KV에 새 토큰 저장
      await redis.set('instagram_access_token', refreshData.access_token);
      console.log(`[Token Refresh] Success, expires_in: ${refreshData.expires_in}s`);

      // Vercel 환경변수도 업데이트 (선택)
      if (process.env.VERCEL_API_TOKEN && process.env.VERCEL_PROJECT_ID) {
        try {
          const checkRes = await fetch(
            `https://api.vercel.com/v10/projects/${process.env.VERCEL_PROJECT_ID}/env?key=INSTAGRAM_ACCESS_TOKEN`,
            { headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` } }
          );
          const checkData = await checkRes.json();
          const existing = checkData.envs?.find(e => e.key === 'INSTAGRAM_ACCESS_TOKEN');

          if (existing) {
            await fetch(
              `https://api.vercel.com/v10/projects/${process.env.VERCEL_PROJECT_ID}/env/${existing.id}`,
              {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: refreshData.access_token }),
              }
            );
            console.log('[Token Refresh] Vercel env updated');
          }
        } catch (e) { console.warn('[Token Refresh] Vercel env update failed:', e.message); }
      }

      return res.status(200).json({
        success: true,
        expires_in: refreshData.expires_in,
        refreshed_at: new Date().toISOString(),
      });
    }

    console.error('[Token Refresh] Failed:', refreshData);
    return res.status(500).json({ error: refreshData.error?.message || 'Refresh failed' });
  } catch (error) {
    console.error('[Token Refresh]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

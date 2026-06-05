import { Redis } from '@upstash/redis';
import { google } from 'googleapis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { maxDuration: 30 };

async function saveHealthAlert(key, message) {
  try {
    await redis.set(`health:alert:${key}`, { message, at: new Date().toISOString() }, { ex: 86400 * 3 });
  } catch (e) { console.warn(`[Refresh] saveHealthAlert ${key} failed:`, e.message); }
}
async function clearHealthAlert(key) {
  try { await redis.del(`health:alert:${key}`); } catch (e) { console.warn(`[Refresh] clearHealthAlert ${key} failed:`, e.message); }
}

async function updateVercelEnv(key, value) {
  if (!process.env.VERCEL_API_TOKEN || !process.env.VERCEL_PROJECT_ID) return;
  try {
    const checkRes = await fetch(
      `https://api.vercel.com/v10/projects/${process.env.VERCEL_PROJECT_ID}/env?key=${key}`,
      { headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` } }
    );
    const checkData = await checkRes.json();
    const existing = checkData.envs?.find(e => e.key === key);
    if (existing) {
      await fetch(
        `https://api.vercel.com/v10/projects/${process.env.VERCEL_PROJECT_ID}/env/${existing.id}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ value }),
        }
      );
    }
  } catch (e) { console.warn(`[Refresh ${key}] Vercel env update failed:`, e.message); }
}

async function refreshInstagram() {
  const currentToken = await redis.get('instagram_access_token').catch(() => null)
    || process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!currentToken) {
    await saveHealthAlert('instagram', 'Instagram 토큰 없음 — Graph API 토큰 재발급 필요');
    return { ok: false, reason: 'no_current_token' };
  }

  try {
    const refreshRes = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${currentToken}`
    );
    const data = await refreshRes.json();
    if (!data.access_token) {
      const msg = data.error?.message || 'Refresh failed';
      await saveHealthAlert('instagram', `Instagram 토큰 갱신 실패: ${msg}`);
      return { ok: false, reason: msg };
    }
    await redis.set('instagram_access_token', data.access_token);
    await updateVercelEnv('INSTAGRAM_ACCESS_TOKEN', data.access_token);
    await clearHealthAlert('instagram');
    return { ok: true, expires_in: data.expires_in };
  } catch (e) {
    await saveHealthAlert('instagram', `Instagram 토큰 갱신 오류: ${e.message}`);
    return { ok: false, reason: e.message };
  }
}

async function refreshGoogle() {
  const refreshToken = await redis.get('google:refresh_token').catch(() => null)
    || process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) {
    await saveHealthAlert('google', 'Google refresh_token 없음 — /api/auth/google 에서 재인증 필요');
    return { ok: false, reason: 'no_refresh_token' };
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return { ok: false, reason: 'no_client_credentials' };
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    if (credentials.access_token) {
      await redis.set('google:access_token', credentials.access_token, {
        ex: Math.max(60, Math.floor((credentials.expiry_date - Date.now()) / 1000) - 60),
      });
    }
    await clearHealthAlert('google');
    return { ok: true, expiry_date: credentials.expiry_date };
  } catch (e) {
    const msg = e.message || 'unknown';
    await saveHealthAlert('google', `Google 토큰 만료 — /api/auth/google 재인증 필요 (${msg})`);
    return { ok: false, reason: msg };
  }
}

async function refreshCafe24() {
  const refreshToken = await redis.get('cafe24:refresh_token').catch(() => null);
  if (!refreshToken) {
    await saveHealthAlert('cafe24', 'Cafe24 refresh_token 없음 — /api/auth/cafe24 재인증 필요');
    return { ok: false, reason: 'no_refresh_token' };
  }
  if (!process.env.CAFE24_CLIENT_ID || !process.env.CAFE24_CLIENT_SECRET) {
    return { ok: false, reason: 'no_client_credentials' };
  }

  try {
    const mallId = (process.env.CAFE24_MALL_ID || 'millius').trim();
    const basic = Buffer.from(`${process.env.CAFE24_CLIENT_ID}:${process.env.CAFE24_CLIENT_SECRET}`).toString('base64');
    const res = await fetch(`https://${mallId}.cafe24api.com/api/v2/oauth/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
    const fresh = await res.json();
    if (!fresh.access_token) {
      const errMsg = fresh.error_description || fresh.error || JSON.stringify(fresh);
      await saveHealthAlert('cafe24', `Cafe24 토큰 만료 — /api/auth/cafe24 재인증 필요 (${errMsg})`);
      return { ok: false, reason: errMsg };
    }
    await Promise.all([
      redis.set('cafe24:access_token', fresh.access_token, { ex: fresh.expires_in || 3600 }),
      fresh.refresh_token ? redis.set('cafe24:refresh_token', fresh.refresh_token) : Promise.resolve(),
    ]);
    await clearHealthAlert('cafe24');
    return { ok: true, expires_in: fresh.expires_in, rotated_refresh: !!fresh.refresh_token };
  } catch (e) {
    await saveHealthAlert('cafe24', `Cafe24 토큰 갱신 오류: ${e.message}`);
    return { ok: false, reason: e.message };
  }
}

// 매일 UTC 15:00 (KST 00:00): 모든 OAuth 토큰 미리 갱신
// — Instagram (60일 만료), Google (access_token 1h, refresh 만료 시 알림),
//    Cafe24 (refresh 2주 만료 — 매일 미리 새로 발급받아 만료 방지)
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = await Promise.allSettled([
    refreshInstagram(),
    refreshGoogle(),
    refreshCafe24(),
  ]);

  const summary = {
    instagram: results[0].status === 'fulfilled' ? results[0].value : { ok: false, reason: results[0].reason?.message },
    google: results[1].status === 'fulfilled' ? results[1].value : { ok: false, reason: results[1].reason?.message },
    cafe24: results[2].status === 'fulfilled' ? results[2].value : { ok: false, reason: results[2].reason?.message },
  };

  console.log('[Refresh Token]', JSON.stringify(summary));
  const allOk = summary.instagram.ok && summary.google.ok && summary.cafe24.ok;
  return res.status(allOk ? 200 : 207).json({ refreshed_at: new Date().toISOString(), summary });
}

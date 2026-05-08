// 임시: Instagram Business 계정 ID 탐색
export default async function handler(req, res) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return res.status(400).json({ error: 'INSTAGRAM_ACCESS_TOKEN not set' });

  const results = {};

  // 1. System user /me
  const me = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${token}`).then(r => r.json()).catch(e => ({ error: e.message }));
  results.fb_me = me;

  // 2. Basic Display /me
  const igMe = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${token}`).then(r => r.json()).catch(e => ({ error: e.message }));
  results.ig_me = igMe;

  // 3. BM의 owned IG 계정
  const bmId = '6230686894709601';
  const bizIg = await fetch(`https://graph.facebook.com/v19.0/${bmId}/owned_instagram_accounts?fields=id,username,followers_count&access_token=${token}`).then(r => r.json()).catch(e => ({ error: e.message }));
  results.biz_ig_accounts = bizIg;

  // 4. BM 연결 IG 계정
  const clientIg = await fetch(`https://graph.facebook.com/v19.0/${bmId}/client_instagram_accounts?fields=id,username,followers_count&access_token=${token}`).then(r => r.json()).catch(e => ({ error: e.message }));
  results.client_ig_accounts = clientIg;

  // 5. mine-ai 시스템 사용자 할당 IG 계정
  const sysUserId = '61589081296104';
  const sysIg = await fetch(`https://graph.facebook.com/v19.0/${sysUserId}/assigned_instagram_accounts?fields=id,username&access_token=${token}`).then(r => r.json()).catch(e => ({ error: e.message }));
  results.sys_user_ig = sysIg;

  return res.status(200).json(results);
}

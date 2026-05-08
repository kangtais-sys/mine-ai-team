// 임시: Instagram Business 계정 ID 탐색
export default async function handler(req, res) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return res.status(400).json({ error: 'INSTAGRAM_ACCESS_TOKEN not set' });

  const results = {};

  // 1. millimilli IG Business ID (확인됨)
  const milliId = '17841437734938544';

  // 2. Business Discovery: lala_lounge_ 탐색
  const lalaDiscover = await fetch(
    `https://graph.facebook.com/v21.0/${milliId}?fields=business_discovery.fields(id,username,followers_count,biography)&username=lala_lounge_&access_token=${token}`
  ).then(r => r.json()).catch(e => ({ error: e.message }));
  results.lala_lounge_discovery = lalaDiscover;

  // 3. instagram /me (Basic Display)
  const igMe = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${token}`).then(r => r.json()).catch(e => ({ error: e.message }));
  results.ig_me = igMe;

  // 4. BM의 owned IG 계정
  const bmId = '6230686894709601';
  const bizIg = await fetch(`https://graph.facebook.com/v19.0/${bmId}/owned_instagram_accounts?fields=id,username&access_token=${token}`).then(r => r.json()).catch(e => ({ error: e.message }));
  results.biz_ig_accounts = bizIg;

  // 5. mine-ai 시스템 사용자 할당 IG 계정
  const sysUserId = '61589081296104';
  const sysIg = await fetch(`https://graph.facebook.com/v19.0/${sysUserId}/assigned_instagram_accounts?fields=id,username&access_token=${token}`).then(r => r.json()).catch(e => ({ error: e.message }));
  results.sys_user_ig = sysIg;

  return res.status(200).json(results);
}

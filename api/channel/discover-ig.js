// 임시: INSTAGRAM_ACCESS_TOKEN으로 IG 비즈니스 계정 ID 탐색
export default async function handler(req, res) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return res.status(400).json({ error: 'INSTAGRAM_ACCESS_TOKEN not set' });

  const results = {};

  // 1. Instagram Basic Display API (/me)
  const me = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${token}`).then(r => r.json()).catch(e => ({ error: e.message }));
  results.instagram_me = me;

  // 2. Facebook Graph API (/me)
  const fbMe = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${token}`).then(r => r.json()).catch(e => ({ error: e.message }));
  results.fb_me = fbMe;

  // 3. Facebook Pages → Instagram 비즈니스 계정
  const pages = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=name,instagram_business_account{id,name,username}&access_token=${token}`).then(r => r.json()).catch(e => ({ error: e.message }));
  results.fb_pages = pages;

  return res.status(200).json(results);
}

// 임시: Instagram Business 계정 ID 탐색
export default async function handler(req, res) {
  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const results = {};

  const milliId = '17841437734938544';
  const lalaId = process.env.IG_USER_ID_YUMINHYE || '17841411572493732';

  // 1. millimilli 확인 (기준값)
  const r1 = await fetch(
    `https://graph.facebook.com/v21.0/${milliId}?fields=id,username,followers_count&access_token=${igToken}`
  ).then(r => r.json()).catch(e => ({ error: e.message }));
  results.millimilli = r1;

  // 2. lala_lounge_ ID로 프로필 직접 조회 (graph.facebook.com)
  const r2 = await fetch(
    `https://graph.facebook.com/v21.0/${lalaId}?fields=id,username,followers_count&access_token=${igToken}`
  ).then(r => r.json()).catch(e => ({ error: e.message }));
  results.lala_fb = r2;

  // 3. lala_lounge_ ID로 media 조회 (graph.facebook.com)
  const r3 = await fetch(
    `https://graph.facebook.com/v21.0/${lalaId}/media?fields=id,timestamp&limit=3&access_token=${igToken}`
  ).then(r => r.json()).catch(e => ({ error: e.message }));
  results.lala_media_fb = r3;

  // 4. lala_lounge_ ID로 media 조회 (graph.instagram.com)
  const r4 = await fetch(
    `https://graph.instagram.com/v25.0/${lalaId}/media?fields=id,timestamp&limit=3&access_token=${igToken}`
  ).then(r => r.json()).catch(e => ({ error: e.message }));
  results.lala_media_ig = r4;

  // 5. graph.instagram.com/me - 현재 토큰이 어떤 계정인지
  const r5 = await fetch(
    `https://graph.instagram.com/me?fields=id,username&access_token=${igToken}`
  ).then(r => r.json()).catch(e => ({ error: e.message }));
  results.ig_me = r5;

  return res.status(200).json(results);
}

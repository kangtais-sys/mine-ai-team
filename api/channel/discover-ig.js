// 임시: Instagram Business 계정 ID 탐색
export default async function handler(req, res) {
  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const metaToken = process.env.META_ACCESS_TOKEN;
  const results = {};

  const milliId = '17841437734938544'; // millimilli IG Business ID (확인됨)
  const sysUserId = '122101078449302709'; // mine-ai system user FB ID (debug_token 에서 확인)
  const bmId = '6230686894709601';

  // 1. 시스템 사용자의 instagram_accounts edge (IG token)
  if (igToken) {
    const r1 = await fetch(
      `https://graph.facebook.com/v21.0/${sysUserId}/instagram_accounts?fields=id,username,followers_count&access_token=${igToken}`
    ).then(r => r.json()).catch(e => ({ error: e.message }));
    results.sys_ig_accounts_ig_token = r1;
  }

  // 2. 시스템 사용자의 instagram_accounts edge (META token)
  if (metaToken) {
    const r2 = await fetch(
      `https://graph.facebook.com/v21.0/${sysUserId}/instagram_accounts?fields=id,username,followers_count&access_token=${metaToken}`
    ).then(r => r.json()).catch(e => ({ error: e.message }));
    results.sys_ig_accounts_meta_token = r2;
  }

  // 3. milliId 계정 기본 정보 확인
  if (igToken) {
    const r3 = await fetch(
      `https://graph.facebook.com/v21.0/${milliId}?fields=id,username,followers_count&access_token=${igToken}`
    ).then(r => r.json()).catch(e => ({ error: e.message }));
    results.millimilli_profile = r3;
  }

  // 4. BM의 FB page 기반 IG 계정 연결 확인 (IG token으로 me/accounts)
  if (igToken) {
    const r4 = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${igToken}`
    ).then(r => r.json()).catch(e => ({ error: e.message }));
    results.me_fb_pages_ig_token = r4;
  }

  // 5. META token으로 BM 연결 FB pages
  if (metaToken) {
    const r5 = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${metaToken}`
    ).then(r => r.json()).catch(e => ({ error: e.message }));
    results.me_fb_pages_meta_token = r5;
  }

  // 6. millimilli IG ID로 팔로워 + 사용 가능한 필드 확인
  if (igToken) {
    const r6 = await fetch(
      `https://graph.facebook.com/v21.0/${milliId}?fields=id,username,biography,followers_count,media_count&access_token=${igToken}`
    ).then(r => r.json()).catch(e => ({ error: e.message }));
    results.millimilli_fields_test = r6;
  }

  return res.status(200).json(results);
}

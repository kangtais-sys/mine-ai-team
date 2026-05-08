// 임시: Instagram Business 계정 ID 탐색
export default async function handler(req, res) {
  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const metaToken = process.env.META_ACCESS_TOKEN;
  const results = {};

  const milliId = '17841437734938544'; // millimilli IG Business ID (확인됨)
  const bmId = '6230686894709601';
  const sysUserId = '61589081296104';

  // 1. IG 토큰으로 millimilli의 Business Discovery → lala_lounge_
  if (igToken) {
    const d1 = await fetch(
      `https://graph.facebook.com/v21.0/${milliId}?fields=business_discovery.fields(id,username,followers_count)&username=lala_lounge_&access_token=${igToken}`
    ).then(r => r.json()).catch(e => ({ error: e.message }));
    results.lala_discovery_ig_token = d1;
  }

  // 2. META 시스템 사용자 토큰으로 BM owned IG 계정 조회
  if (metaToken) {
    const d2 = await fetch(
      `https://graph.facebook.com/v21.0/${bmId}/owned_instagram_accounts?fields=id,username,followers_count&access_token=${metaToken}`
    ).then(r => r.json()).catch(e => ({ error: e.message }));
    results.bm_owned_ig_meta = d2;
  }

  // 3. META 토큰으로 시스템 사용자 할당 IG 계정
  if (metaToken) {
    const d3 = await fetch(
      `https://graph.facebook.com/v21.0/${sysUserId}/assigned_instagram_accounts?fields=id,username&access_token=${metaToken}`
    ).then(r => r.json()).catch(e => ({ error: e.message }));
    results.sys_assigned_ig_meta = d3;
  }

  // 4. IG 토큰으로 시스템 사용자 할당 IG 계정
  if (igToken) {
    const d4 = await fetch(
      `https://graph.facebook.com/v21.0/${sysUserId}/assigned_instagram_accounts?fields=id,username&access_token=${igToken}`
    ).then(r => r.json()).catch(e => ({ error: e.message }));
    results.sys_assigned_ig_token = d4;
  }

  // 5. META 토큰으로 BM client IG 계정
  if (metaToken) {
    const d5 = await fetch(
      `https://graph.facebook.com/v21.0/${bmId}/client_instagram_accounts?fields=id,username&access_token=${metaToken}`
    ).then(r => r.json()).catch(e => ({ error: e.message }));
    results.bm_client_ig_meta = d5;
  }

  // 6. IG 토큰으로 lala_lounge_ 미디어 직접 접근 테스트 (ID 추정)
  // lala_lounge_ 알려진 후보 ID 시도
  const candidates = ['17841467434938544', '17841413734938544'];
  for (const cid of candidates) {
    const d6 = await fetch(
      `https://graph.facebook.com/v21.0/${cid}?fields=id,username&access_token=${igToken}`
    ).then(r => r.json()).catch(e => ({ error: e.message }));
    if (!d6.error) { results[`candidate_${cid}`] = d6; }
  }

  return res.status(200).json(results);
}

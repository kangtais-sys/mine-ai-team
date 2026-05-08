// 임시: Instagram Business 계정 ID 탐색
export default async function handler(req, res) {
  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const metaToken = process.env.META_ACCESS_TOKEN;
  const results = {};

  const milliId = '17841437734938544'; // millimilli IG Business ID (확인됨)
  const sysUserId = '61589081296104';
  const bmId = '6230686894709601';

  // 1. token debug: IG 토큰이 어떤 계정에 접근할 수 있는지 확인
  if (igToken && metaToken) {
    const dbg = await fetch(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${igToken}&access_token=${metaToken}`
    ).then(r => r.json()).catch(e => ({ error: e.message }));
    results.token_debug = dbg;
  }

  // 2. IG 토큰으로 /me 계정 정보 + connected_instagram_accounts
  if (igToken) {
    const me = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name,instagram_accounts&access_token=${igToken}`
    ).then(r => r.json()).catch(e => ({ error: e.message }));
    results.ig_token_me_fb = me;
  }

  // 3. META 토큰으로 시스템 사용자 연결된 IG 계정들
  if (metaToken) {
    const sysMe = await fetch(
      `https://graph.facebook.com/v21.0/${sysUserId}?fields=id,name,instagram_accounts&access_token=${metaToken}`
    ).then(r => r.json()).catch(e => ({ error: e.message }));
    results.sys_user_ig_accounts_meta = sysMe;
  }

  // 4. BM owned pages + 각 페이지의 연결된 IG 계정
  if (metaToken) {
    const pages = await fetch(
      `https://graph.facebook.com/v21.0/${bmId}/owned_pages?fields=id,name,instagram_business_account&limit=20&access_token=${metaToken}`
    ).then(r => r.json()).catch(e => ({ error: e.message }));
    results.bm_owned_pages = pages;
  }

  // 5. millimilli IG 계정의 connected_page 확인 (IG token)
  if (igToken) {
    const milliInfo = await fetch(
      `https://graph.facebook.com/v21.0/${milliId}?fields=id,username,followers_count,connected_instagram_account&access_token=${igToken}`
    ).then(r => r.json()).catch(e => ({ error: e.message }));
    results.millimilli_info = milliInfo;
  }

  // 6. Instagram oEmbed (인증 없이 공개 계정 정보 조회)
  const oembed = await fetch(
    `https://graph.facebook.com/v21.0/instagram_oembed?url=https://www.instagram.com/lala_lounge_/&access_token=${igToken || metaToken}`
  ).then(r => r.json()).catch(e => ({ error: e.message }));
  results.lala_oembed = oembed;

  return res.status(200).json(results);
}

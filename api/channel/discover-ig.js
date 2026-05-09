// 임시: Instagram Business 계정 ID 탐색
export default async function handler(req, res) {
  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const results = {};

  const lalaId = process.env.IG_USER_ID_YUMINHYE || '17841411572493732';

  // env var 확인
  results.env_check = {
    has_ig_token: !!igToken,
    ig_user_id_yuminhye: process.env.IG_USER_ID_YUMINHYE || 'NOT SET',
  };

  // posts.js 와 완전히 동일한 fields + URL로 테스트
  const fields = 'id,caption,timestamp,like_count,comments_count,media_type,permalink';
  const url_fb = `https://graph.facebook.com/v21.0/${lalaId}/media?fields=${fields}&limit=10&access_token=${igToken}`;
  const r1 = await fetch(url_fb).then(r => r.json()).catch(e => ({ error: e.message }));
  results.lala_full_fields_fb = { url_used: url_fb.replace(igToken, 'TOKEN'), result: r1 };

  // fields 없이 단순 media 테스트
  const url_simple = `https://graph.facebook.com/v21.0/${lalaId}/media?fields=id,timestamp&limit=3&access_token=${igToken}`;
  const r2 = await fetch(url_simple).then(r => r.json()).catch(e => ({ error: e.message }));
  results.lala_simple_media = r2;

  // caption만 추가한 버전
  const url_caption = `https://graph.facebook.com/v21.0/${lalaId}/media?fields=id,caption,timestamp&limit=3&access_token=${igToken}`;
  const r3 = await fetch(url_caption).then(r => r.json()).catch(e => ({ error: e.message }));
  results.lala_with_caption = { count: r3.data?.length, first_caption: r3.data?.[0]?.caption?.slice(0,50) };

  return res.status(200).json(results);
}

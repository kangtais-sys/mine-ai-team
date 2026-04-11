import { Redis } from '@upstash/redis';
export const config = { maxDuration: 300 };
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const PROFILE_ID = process.env.SISURU_PROFILE_ID || '69d8a52731c2441246bef194';
const IG_ACCOUNT = process.env.SISURU_IG_ACCOUNT_ID || '69d8a6257dea335c2bd101f6';
const TT_ACCOUNT = process.env.SISURU_TT_ACCOUNT_ID || '69d8a5c27dea335c2bd100ad';

const BB_TEMPLATES = { 1:'1oMJnB5r9QRMZl2wqL', 2:'lzw71BD6ExN950eYkn', 3:'n1MJGd52QzJoZ7LaPV', 4:'ok0l2K5mvegLD3j1Yx', 5:'lzw71BD6ExYg50eYkn', 6:'l9E7G65ko0XY5PLe3R', 7:'vz9ByYbNVYQ0bRGXrw' };

// ─── Claude 기획 ───
async function planSlides(topic) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514', max_tokens: 3000, temperature: 1.0,
      messages: [{ role: 'user', content: `주제: "${topic.title}"

시수르더쿠 7장 카드뉴스. 밀리밀리/브랜드 언급 금지.

## 캐릭터
인생 살아본 언니. 1년에 1억 이상 시술/화장품에 쓰는 중독자.
내돈내산 후기처럼. 광고 티 나면 안 됨.
"이거 3개월 써봤는데 솔직히 처음엔 모르겠었거든? 근데 한 달 지나니까 아 이거구나 싶더라" 이런 느낌.

## 텍스트 규칙
title: 최대 20자. 14자 넘으면 줄바꿈(\\n). 숫자 임팩트 강함. 반전+단정 또는 감탄 구어체.
  예: "1억 써보고 깨달은 것.\\n이거였음." / "이게 말이 됨..?"
subtitle: 15자 이내. 예: "시술 | 경험담", "제품 | 가격비교", "인생 바뀐 후기"
  1장 subtitle: 딱딱한 카테고리명 절대 금지. "돈 아까운 사람만 봐", "피부과 가기 전 필독" 등
body: 경험담+감정+수치 혼합 대화체 7~10줄. 단순 나열 금지.
  "처음에 15만원 주고 샀는데 솔직히 비싸다 생각했거든? 근데 2주 쓰고 나서 아 이건 싸게 산 거다 싶었어"

금지: '추천', '좋아요', '효과적인', '놀라운', '완벽한', '최고의'

## 슬라이드 (6장 본문 + 1장 CTA, 요약장 없음)
1장: subtitle(매력적 부제), title(스크롤 멈추는 후킹), body(""), image_source("google"), image_keyword(영어 감성 키워드)
2장: subtitle("솔직히 말하면"), title(궁금증 폭발), body(""), image_source("google"), image_keyword(영어)
3장: subtitle(""), title(소제목 20자), body(경험담 7~10줄, 가격/수치), image_source("oliveyoung" 또는 "google"), image_keyword(제품명 또는 영어)
4장: subtitle(""), title(소제목), body(7~10줄, 비교), image_source, image_keyword
5장: subtitle(""), title(소제목), body(7~10줄, 단점/주의사항 솔직히), image_source, image_keyword
6장: subtitle(""), title(소제목), body(7~10줄, 결론/느낀점), image_source, image_keyword
7장: subtitle(""), image_source("고정"), image_keyword("")
  CTA 랜덤 택1:
  ① title:"더 솔직한 거\\n알고 싶어?" body:"팔로우하면 매일 올려\\n궁금한 거 댓글에 👇"
  ② title:"1년에 1억 쓴\\n사람 얘기" body:"듣고 싶으면 팔로우\\nDM으로 더 알려줄게 👀"
  ③ title:"이건 저장해둬" body:"나중에 또 볼 거잖아\\n저장 📌 팔로우 🔔"
  ④ title:"다음엔 뭐\\n알려줄까?" body:"댓글에 주제 적어줘\\n만들어줄게 🎯"
  ⑤ title:"친구한테도\\n알려줘" body:"나만 알기 아깝잖아\\n공유하고 같이 예뻐지자 💕"

## 필수 규칙
⚠️ 모든 장의 subtitle은 반드시 채워야 함. 빈 문자열 금지!
  1장: 매력적 부제 ("돈 아까운 사람만 봐", "인생 바뀐 후기")
  2장: 1장 주제를 이어가는 맥락 ("근데 이게 다가 아니야", "솔직히 이게 핵심")
  3~6장: 소제목 또는 맥락 ("가격 비교", "직접 써본 후기", "주의사항", "결론")
  7장: CTA 관련 ("궁금하면")

⚠️ 2장은 1장 주제의 연장선! 1장이 "10만원 립밤" 얘기면 2장도 그 립밤 얘기여야 함.

image_source + image_keyword 규칙:
- "google": 감성/무드 이미지. image_keyword에 영어 (예: "luxury lip balm aesthetic closeup")
- "oliveyoung": 제품 관련. image_keyword에 해당 장에서 다루는 실제 제품/브랜드명
  ⚠️ 주제와 직접 관련된 키워드만! "10만원 립밤"이면 "라메르 립밤" 이런 식으로 구체적.
  일반적인 "립밤" ❌ → 주제에 나온 실제 브랜드/제품명 ✅
- "고정": 7장 CTA

## 캡션
Instagram: 충격/공감 첫 줄 + 본문 3~5줄 + 줄바꿈3 + CTA + 해시태그 5~10개
  첫 줄 예: "이거 진짜임.. 알고 싶지 않았다 🫠" / "돈 아까워서 직접 알아봄. 결과 충격."
TikTok: 후킹 60자 + 해시태그 5~7개

JSON만:
{
  "slides":[
    {"slide":1,"subtitle":"인생 바뀐 후기","title":"...(20자)","body":"","image_source":"google","image_keyword":"luxury lip balm aesthetic"},
    {"slide":2,"subtitle":"근데 이게 다가 아니야","title":"...","body":"","image_source":"google","image_keyword":"..."},
    {"slide":3,"subtitle":"가격 비교","title":"소제목","body":"7~10줄","image_source":"oliveyoung","image_keyword":"라메르 립밤"},
    {"slide":4,"subtitle":"직접 써본 후기","title":"소제목","body":"7~10줄","image_source":"oliveyoung","image_keyword":"구체적 제품명"},
    {"slide":5,"subtitle":"주의사항","title":"소제목","body":"7~10줄","image_source":"google","image_keyword":"..."},
    {"slide":6,"subtitle":"결론","title":"소제목","body":"7~10줄","image_source":"google","image_keyword":"..."},
    {"slide":7,"subtitle":"궁금하면","title":"CTA","body":"CTA","image_source":"고정","image_keyword":""}
  ],
  "instagram_caption":"...(해시태그 5~10개)",
  "tiktok_caption":"...(해시태그 5~7개)"
}` }],
    }),
  });
  const d = await r.json();
  const t = d.content?.[0]?.text || '{}';
  const m = t.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

// ─── 이미지 생성 (Screenshot 우선 → Imagen fallback) ───
async function generateSlideImage(slide) {
  if (slide.image_source === '고정') return null;

  const { getImageUrl } = await import('./utils/screenshot.js');

  // 타입별 이미지 획득 (Pinterest URL 직접 추출 or 올리브영 글로벌 캡처)
  if (slide.image_keyword) {
    const url = await getImageUrl(slide.image_source || 'pinterest', slide.image_keyword);
    if (url) { console.log(`[Img] Slide ${slide.slide}: ${slide.image_source} OK`); return url; }
  }

  // 3순위: Gemini Imagen fallback
  if (process.env.GEMINI_API_KEY && slide.image_keyword) {
    try {
      const prompt = `${slide.image_keyword}. photorealistic, korean beauty, real photo, not illustration, no digital art, no render`;
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: '1:1' } }),
      });
      const d = await r.json();
      const b64 = d.predictions?.[0]?.bytesBase64Encoded;
      if (b64 && process.env.ZERNIO_API_KEY) {
        const formData = new FormData();
        formData.append('files', new Blob([Buffer.from(b64, 'base64')], { type: 'image/png' }), 'bg.png');
        const u = await fetch('https://zernio.com/api/v1/media', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` }, body: formData });
        const url = (await u.json()).files?.[0]?.url;
        if (url) { console.log(`[Img] Slide ${slide.slide}: imagen fallback OK`); return url; }
      }
    } catch {}
  }

  console.warn(`[Img] Slide ${slide.slide}: all failed`);
  return null;
}

// ─── Bannerbear ───
async function generateBannerbearImage(slideNum, slide, bgImageUrl) {
  const uid = BB_TEMPLATES[slideNum];
  if (!uid) return null;
  const mods = [
    slide.title?.trim() && { name: 'title', text: slide.title.trim() },
    slide.subtitle?.trim() && { name: 'subtitle', text: slide.subtitle.trim() },
    slide.body?.trim() && { name: 'body', text: slide.body.trim() },
    bgImageUrl && { name: 'bg_image', image_url: bgImageUrl },
  ].filter(Boolean);
  try {
    const r = await fetch('https://sync.api.bannerbear.com/v2/images', {
      method: 'POST', headers: { 'Authorization': `Bearer ${process.env.BANNERBEAR_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: uid, modifications: mods }),
    });
    const d = await r.json();
    if (d.image_url) return d.image_url;
    console.error(`[BB] ${slideNum}:`, d.message || d.error);
    return null;
  } catch (e) { console.error(`[BB] ${slideNum}:`, e.message); return null; }
}

// ─── Zernio ───
async function publishToZernio(plan, imageUrls, topicSource) {
  let ig = plan.instagram_caption || '';
  if (topicSource && !ig.includes('출처')) ig += `\n\n출처: ${topicSource}`;
  const body = {
    profileId: PROFILE_ID,
    platforms: [
      { platform: 'instagram', accountId: IG_ACCOUNT, platformSpecificData: { caption: ig } },
      { platform: 'tiktok', accountId: TT_ACCOUNT, platformSpecificData: { caption: plan.tiktok_caption } },
    ],
    content: ig.substring(0, 2200),
    status: 'scheduled',
    scheduledFor: new Date(Date.now() + 3 * 3600000).toISOString(),
  };
  if (imageUrls?.length > 0) body.mediaItems = imageUrls.map((url, i) => ({ type: 'image', url, filename: `s${i + 1}.jpg` }));
  const r = await fetch('https://zernio.com/api/v1/posts', {
    method: 'POST', headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

// ─── Handler ───
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const [proposals, selected, draft] = await Promise.all([
      redis.get('sisuru:proposals'), redis.get('sisuru:selected'), redis.get('sisuru:draft'),
    ]);
    const parse = v => v ? (typeof v === 'string' ? JSON.parse(v) : v) : null;
    return res.status(200).json({ proposals: parse(proposals), selected: parse(selected), draft: parse(draft) });
  }

  if (req.method === 'POST') {
    const { id, action } = req.body || {};

    // 주제 선택 → 초안 생성
    if (id && !action) {
      const proposals = await redis.get('sisuru:proposals');
      const data = proposals ? (typeof proposals === 'string' ? JSON.parse(proposals) : proposals) : null;
      if (!data?.proposals) return res.status(200).json({ error: 'No proposals' });
      const topic = data.proposals.find(p => p.id === Number(id));
      if (!topic) return res.status(400).json({ error: `#${id} not found` });

      await redis.set('sisuru:selected', JSON.stringify({ ...topic, selectedAt: new Date().toISOString() }), { ex: 86400 });
      const plan = await planSlides(topic);
      if (!plan) return res.status(200).json({ success: false, error: 'Planning failed' });
      await redis.set('sisuru:draft', JSON.stringify(plan), { ex: 86400 });

      let chatText = `📋 시수르더쿠 카드뉴스 초안\n주제: ${topic.title}\n\n`;
      for (const s of plan.slides || []) {
        chatText += `━━━ ${s.slide}장 ━━━\n`;
        if (s.subtitle) chatText += `소제목: ${s.subtitle}\n`;
        chatText += `제목: ${s.title}\n`;
        if (s.body) chatText += `본문:\n${s.body}\n`;
        chatText += `이미지: ${s.image_source}${s.image_keyword ? ` → "${s.image_keyword}"` : ''}\n\n`;
      }
      chatText += `━━━ 캡션 ━━━\nIG: ${plan.instagram_caption || '(생성 실패)'}\n\nTT: ${plan.tiktok_caption || '(생성 실패)'}\n\n`;
      chatText += `✏️ 수정할 부분 말씀해주세요. "생성해" 라고 하면 이미지 + 발행합니다.`;

      return res.status(200).json({ success: true, action: 'draft', chatText, plan });
    }

    // 생성
    if (action === 'generate') {
      const plan = await redis.get('sisuru:draft').then(d => d ? (typeof d === 'string' ? JSON.parse(d) : d) : null);
      if (!plan?.slides) return res.status(200).json({ error: 'No draft' });

      let slides = plan.slides || [];
      if (slides.length < 7) slides = [...slides, { slide: 7, title: '더 솔직한 거\n알고 싶어?', body: '팔로우하면 매일 올려\n궁금한 거 댓글에 👇', image_source: '고정' }];
      slides = slides.map((s, i) => ({ ...s, slide: s.slide || i + 1 }));

      // 이미지 생성 (병렬)
      console.log('[Select] Generating images...');
      const bgImages = await Promise.all(slides.map(s => generateSlideImage(s)));
      console.log(`[Select] BG: ${bgImages.filter(Boolean).length}/${slides.length}`);

      // Bannerbear 7장
      const bbImages = await Promise.all(slides.map((s, i) => generateBannerbearImage(s.slide, s, bgImages[i])));
      const validImages = bbImages.filter(Boolean);
      console.log(`[Select] Cards: ${validImages.length}`);

      // 발행
      const sel = await redis.get('sisuru:selected').then(d => d ? (typeof d === 'string' ? JSON.parse(d) : d) : null);
      const zernio = await publishToZernio(plan, validImages, sel?.source);
      console.log('[Select]', zernio?.post?.status || zernio?.error);

      return res.status(200).json({ success: true, action: 'published', images: validImages.length, zernio: { status: zernio?.post?.status, id: zernio?.post?._id, error: zernio?.error } });
    }

    return res.status(400).json({ error: 'id or action required' });
  }
  return res.status(405).json({ error: 'GET or POST' });
}

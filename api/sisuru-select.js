import { Redis } from '@upstash/redis';

export const config = { maxDuration: 300 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const PROFILE_ID = process.env.SISURU_PROFILE_ID || '69d8a52731c2441246bef194';
const IG_ACCOUNT = process.env.SISURU_IG_ACCOUNT_ID || '69d8a6257dea335c2bd101f6';
const TT_ACCOUNT = process.env.SISURU_TT_ACCOUNT_ID || '69d8a5c27dea335c2bd100ad';

const BB_TEMPLATES = {
  1: '1oMJnB5r9QRMZl2wqL',
  2: 'lzw71BD6ExN950eYkn',
  3: 'n1MJGd52QzJoZ7LaPV',
  4: '6anBGWDAW0JgZO3812',
  5: 'Aqa9wzDP2jQRZJogk7',
  6: 'l9E7G65ko0XY5PLe3R',
  7: 'vz9ByYbNVYQ0bRGXrw',
};

// ─── 기획 생성 (Claude) ───
async function planSlides(topic) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: `주제: "${topic.title}"
카테고리: ${topic.category}

시수르더쿠(@sisru_doku) 7장 카드뉴스 기획.
톤: 친구처럼 솔직, 도발적. 밀리밀리/브랜드 언급 절대 금지.
title이 14자 넘으면 반드시 줄바꿈(\\n) 넣어서 한 줄 14자 이내로.

1장 후킹: subtitle(카테고리), title(충격 후킹 2줄), image_type(Imagen/Pinterest/올리브영캡처 중 택1), image_prompt(영어 50단어)
2장 후킹심화: subtitle("잠깐만"), title(궁금증 폭발), image_type, image_prompt
3장 STEP1: subtitle("STEP 1"), title(소제목), body(핵심 정보 5~7줄, 구체적 수치/방법 포함), image_type, image_prompt
4장 STEP2: subtitle("STEP 2"), title(소제목), body(5~7줄), image_type, image_prompt
5장 STEP3: subtitle("STEP 3"), title(소제목), body(5~7줄), image_type, image_prompt
6장 요약: subtitle("정리하면"), title("이것만 기억해 ✅"), body(1~5장 핵심을 3~4줄로 요약), image_type("텍스트"), image_prompt("")
7장 CTA: subtitle(""), title("더 솔직한 정보 원해?"), body("댓글에 나도 남겨줘 👇\\nDM으로 직접 알려줄게\\n팔로우하면 매일 이런 정보 받아볼 수 있어"), image_type("고정"), image_prompt("")

Instagram 캡션:
- 후킹 1줄
- (빈줄 3개)
- 본문 요약 3줄
- (빈줄 3개)
- "💬 댓글에 나도 남기면 DM 보내줄게"
- 해시태그 3~5개 (뷰티/시술 관련만)

TikTok 캡션: 후킹 60자 + 해시태그 3~5개

JSON만:
{
  "slides": [
    {"slide":1, "subtitle":"...", "title":"...(14자/줄)", "body":"", "image_type":"Imagen", "image_prompt":"..."},
    {"slide":2, "subtitle":"잠깐만", "title":"...", "body":"", "image_type":"Pinterest", "image_prompt":"..."},
    {"slide":3, "subtitle":"STEP 1", "title":"...", "body":"5~7줄 본문", "image_type":"올리브영캡처", "image_prompt":"검색어"},
    {"slide":4, ...},
    {"slide":5, ...},
    {"slide":6, "subtitle":"정리하면", "title":"이것만 기억해 ✅", "body":"요약 3~4줄", "image_type":"텍스트", "image_prompt":""},
    {"slide":7, "subtitle":"", "title":"더 솔직한 정보 원해?", "body":"댓글에 나도 남겨줘...CTA", "image_type":"고정", "image_prompt":""}
  ],
  "instagram_caption": "...(해시태그 3~5개)",
  "tiktok_caption": "...(해시태그 3~5개)"
}` }],
    }),
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || '{}';
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

// ─── Bannerbear 이미지 생성 ───
async function generateBgImage(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !prompt) return null;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ prompt: `${prompt}. Square 1:1, aesthetic, soft lighting` }], parameters: { sampleCount: 1, aspectRatio: '1:1' } }),
    });
    const data = await res.json();
    const b64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) return null;
    const formData = new FormData();
    formData.append('files', new Blob([Buffer.from(b64, 'base64')], { type: 'image/png' }), 'bg.png');
    const uploadRes = await fetch('https://zernio.com/api/v1/media', {
      method: 'POST', headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` }, body: formData,
    });
    return (await uploadRes.json()).files?.[0]?.url || null;
  } catch { return null; }
}

async function generateBannerbearImage(slideNum, slide, bgImageUrl) {
  const templateUid = BB_TEMPLATES[slideNum];
  if (!templateUid) return null;
  const modifications = slideNum === 7 ? []
    : [
        slide.title && { name: 'title', text: slide.title },
        slide.subtitle && { name: 'subtitle', text: slide.subtitle },
        slide.body && { name: 'body', text: slide.body },
        bgImageUrl && { name: 'bg_image', image_url: bgImageUrl },
      ].filter(Boolean);
  try {
    const res = await fetch('https://sync.api.bannerbear.com/v2/images', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.BANNERBEAR_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: templateUid, modifications }),
    });
    const data = await res.json();
    return data.image_url || null;
  } catch (e) { console.error(`[Select] BB ${slideNum}:`, e.message); return null; }
}

// ─── Zernio 발행 ───
async function publishToZernio(plan, imageUrls) {
  const igCaption = plan.instagram_caption || '';
  const body = {
    profileId: PROFILE_ID,
    platforms: [
      { platform: 'instagram', accountId: IG_ACCOUNT, platformSpecificData: { caption: igCaption } },
      { platform: 'tiktok', accountId: TT_ACCOUNT, platformSpecificData: { caption: plan.tiktok_caption } },
    ],
    content: igCaption.substring(0, 2200),
    status: 'scheduled',
    scheduledFor: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
  };
  if (imageUrls?.length > 0) {
    body.mediaItems = imageUrls.map((url, i) => ({ type: 'image', url, filename: `slide_${i + 1}.png` }));
  }
  const res = await fetch('https://zernio.com/api/v1/posts', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default async function handler(req, res) {
  // GET: 제안 + 선택 + 초안 조회
  if (req.method === 'GET') {
    const proposals = await redis.get('sisuru:proposals');
    const selected = await redis.get('sisuru:selected');
    const draft = await redis.get('sisuru:draft');
    return res.status(200).json({
      proposals: proposals ? (typeof proposals === 'string' ? JSON.parse(proposals) : proposals) : null,
      selected: selected ? (typeof selected === 'string' ? JSON.parse(selected) : selected) : null,
      draft: draft ? (typeof draft === 'string' ? JSON.parse(draft) : draft) : null,
    });
  }

  if (req.method === 'POST') {
    const { id, action, plan: customPlan } = req.body || {};

    // ─── 주제 선택 → 초안 생성 (채팅에 표시) ───
    if (id && !action) {
      const proposals = await redis.get('sisuru:proposals');
      const data = proposals ? (typeof proposals === 'string' ? JSON.parse(proposals) : proposals) : null;
      if (!data?.proposals) return res.status(200).json({ error: 'No proposals' });

      const topic = data.proposals.find(p => p.id === Number(id));
      if (!topic) return res.status(400).json({ error: `Proposal ${id} not found` });

      await redis.set('sisuru:selected', JSON.stringify({ ...topic, selectedAt: new Date().toISOString() }), { ex: 86400 });

      // Claude로 기획 생성
      console.log(`[Select] Planning: ${topic.title}`);
      const plan = await planSlides(topic);
      if (!plan) return res.status(200).json({ success: false, error: 'Planning failed' });

      // KV에 초안 저장
      await redis.set('sisuru:draft', JSON.stringify(plan), { ex: 86400 });

      // 채팅용 텍스트 생성
      let chatText = `📋 시수르더쿠 카드뉴스 초안\n주제: ${topic.title}\n\n`;
      for (const s of plan.slides || []) {
        chatText += `━━━ ${s.slide}장 ━━━\n`;
        if (s.subtitle) chatText += `소제목: ${s.subtitle}\n`;
        chatText += `제목: ${s.title}\n`;
        if (s.body) chatText += `본문:\n${s.body}\n`;
        chatText += `이미지: ${s.image_type || 'Imagen'}${s.image_prompt ? ` (${s.image_prompt.substring(0, 40)})` : ''}\n\n`;
      }
      chatText += `━━━ 캡션 ━━━\nIG: ${plan.instagram_caption}\n\nTT: ${plan.tiktok_caption}\n\n`;
      chatText += `✏️ 수정할 부분 말씀해주세요. "생성해" 라고 하면 이미지 생성 + Zernio 발행합니다.`;

      return res.status(200).json({ success: true, action: 'draft', chatText, plan });
    }

    // ─── "생성해" → 이미지 생성 + 발행 ───
    if (action === 'generate') {
      const plan = customPlan || await redis.get('sisuru:draft').then(d => d ? (typeof d === 'string' ? JSON.parse(d) : d) : null);
      if (!plan?.slides) return res.status(200).json({ error: 'No draft. Select a topic first.' });

      console.log('[Select] Generating images...');

      // 배경 이미지 생성 (image_type이 Imagen인 장만)
      const bgPromises = (plan.slides || []).slice(0, 6).map(s =>
        s.image_type === 'Imagen' || s.image_type === 'imagen' ? generateBgImage(s.image_prompt) : Promise.resolve(null)
      );
      const bgImages = await Promise.all(bgPromises);
      console.log(`[Select] BG: ${bgImages.filter(Boolean).length}`);

      // Bannerbear 7장
      const slides = plan.slides.length >= 7 ? plan.slides : [...plan.slides, { slide: 7, title: '더 솔직한 정보 원해?', body: '댓글에 나도 남겨줘 👇' }];
      const bbPromises = slides.map((s, i) => generateBannerbearImage(s.slide || i + 1, s, bgImages[i] || null));
      const imageUrls = await Promise.all(bbPromises);
      const validImages = imageUrls.filter(Boolean);
      console.log(`[Select] Cards: ${validImages.length}/${slides.length}`);

      // Zernio 발행
      const zernioResult = await publishToZernio(plan, validImages);
      console.log('[Select] Published:', zernioResult?.post?.status || zernioResult?.error);

      return res.status(200).json({
        success: true,
        action: 'published',
        images: validImages.length,
        zernio: { status: zernioResult?.post?.status, id: zernioResult?.post?._id, error: zernioResult?.error },
      });
    }

    return res.status(400).json({ error: 'id or action required' });
  }

  return res.status(405).json({ error: 'GET or POST' });
}

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
  4: 'ok0l2K5mvegLD3j1Yx',
  5: 'lzw71BD6ExYg50eYkn',
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
      temperature: 1.0,
      messages: [{ role: 'user', content: `주제: "${topic.title}"
카테고리: ${topic.category}

시수르더쿠(@sisru_doku) 7장 카드뉴스 기획 (요약장 없음, 6장 구성 + CTA 1장).
밀리밀리/브랜드 언급 절대 금지.
title이 14자 넘으면 반드시 줄바꿈(\\n) 넣어서 한 줄 14자 이내로.

## 캐릭터
인생 좀 살아본 언니. 1년에 1억 이상 시술/화장품에 쓰는 진짜 중독자.
단순 정보 나열 절대 금지. 진짜 사람이 느낀 것처럼, 솔직하고 길게 써.
"이거 3개월 써봤는데 솔직히 처음 2주는 뭐가 달라진 건지 모르겠었거든? 근데 한 달 지나니까 아 이거구나 싶더라" 이런 느낌.
내돈내산 후기처럼. 광고 티 나면 안 됨.

## 주제 방향
제품 후기, 시술 후기, 비용 비교, 직접 써본/맞아본 솔직 리뷰 중심.
"이 제품 3통 째 쓰는 이유" / "50만원 날리고 깨달은 것" / "진짜 인생템 찾았다 (근데 단점도 있음)"

## 후킹 규칙
1장: 스크롤 멈추게 하는 한 마디. 질문형이나 고백형이 좋음.
  "이거 쓰고 인생 바뀜 (진심)" / "50만원 날리고 깨달은 것" / "피부과 원장님이 나한테만 알려준 것" / "3년 다니던 피부과 바꾼 이유"
2장: 궁금증 폭발. "근데 솔직히 말하면..." / "아무한테도 안 말했는데" / "이게 핵심인데 다들 모름"

## 본문 작성법 (3~6장)
- 단순 정보 나열 ❌ → 경험담+감정+수치 혼합 ✅
- "처음에 15만원 주고 샀는데 솔직히 비싸다고 생각했거든? 근데 2주 쓰고 나서 아 이건 싸게 산 거다 싶었어"
- "피부과에서 레이저 토닝 10회 끊었는데 (1회 8만원 × 10 = 80만원) 3회차까지는 차이를 모르겠었어. 근데 5회차 넘어가니까..."
- 한 문단이 자연스럽게 이어지는 대화체로 7~10줄 길게
- 금지: '추천', '좋아요', '효과적인', '놀라운', '완벽한'

## 슬라이드 구성 (7장: 본문6 + CTA1)
1장 후킹: subtitle(매력적 부제 — "돈 아까운 사람만 봐", "인생 바뀐 후기"), title(스크롤 멈추는 후킹), image_type("Pinterest"), image_prompt(영어 검색어, 뷰티/스킨케어 실사)
2장 후킹심화: subtitle("솔직히 말하면"), title(궁금증 폭발), image_type("Pinterest"), image_prompt(영어)
3장: subtitle(""), title(소제목), body(경험담 7~10줄, 대화체), image_type("Pinterest"), image_prompt(영어, 제품/시술 관련)
4장: subtitle(""), title(소제목), body(7~10줄, 가격/수치 포함), image_type("Pinterest"), image_prompt(영어)
5장: subtitle(""), title(소제목), body(7~10줄, 주의사항/단점도 솔직히), image_type("Pinterest"), image_prompt(영어)
6장: subtitle(""), title(소제목), body(7~10줄, 결론/느낀점), image_type("Pinterest"), image_prompt(영어)
7장 CTA: subtitle(""), image_type("고정"), image_prompt("")
  아래 중 랜덤 1개:
  ① title: "더 솔직한 거\\n알고 싶어?" + body: "팔로우하면 매일 올려\\n궁금한 거 댓글에 👇"
  ② title: "1년에 1억 쓴\\n사람 얘기" + body: "듣고 싶으면 팔로우\\nDM으로 더 알려줄게 👀"
  ③ title: "이건 저장해둬" + body: "나중에 또 볼 거잖아\\n저장 📌 팔로우 🔔"
  ④ title: "다음엔 뭐\\n알려줄까?" + body: "댓글에 궁금한 주제 적어줘\\n만들어줄게 🎯"
  ⑤ title: "친구한테도\\n알려줘" + body: "나만 알기 아깝잖아\\n공유하고 같이 예뻐지자 💕"

image_type은 기본 "Pinterest" (실사 캡처). image_prompt에 영어 검색어.
⚠️ 텍스트/글자 많은 이미지 금지. 반분할 금지. 실사 클로즈업, 꽉 채우는 이미지만.

Instagram 캡션:
- 후킹 1줄
- (빈줄 3개)
- 본문 요약 3줄
- (빈줄 3개)
- "💬 댓글에 나도 남기면 DM 보내줄게"
- 출처 필요 시: "출처: ○○○ 2026 리포트" (예: 강남언니, 글로우픽 등)
- 해시태그 3~5개 (뷰티/시술 관련만)

TikTok 캡션: 후킹 60자 + 해시태그 3~5개

JSON만:
{
  "slides": [
    {"slide":1, "subtitle":"인생 바뀐 후기", "title":"이거 쓰고\\n인생 바뀜 (진심)", "body":"", "image_type":"Pinterest", "image_prompt":"korean skincare routine closeup"},
    {"slide":2, "subtitle":"솔직히 말하면", "title":"근데 솔직히\\n이게 핵심이야", "body":"", "image_type":"Pinterest", "image_prompt":"beauty product texture"},
    {"slide":3, "subtitle":"", "title":"소제목", "body":"경험담 7~10줄 대화체", "image_type":"Pinterest", "image_prompt":"skincare before after"},
    {"slide":4, "subtitle":"", "title":"소제목", "body":"가격/수치 포함 7~10줄", "image_type":"Pinterest", "image_prompt":"..."},
    {"slide":5, "subtitle":"", "title":"소제목", "body":"단점도 솔직히 7~10줄", "image_type":"Pinterest", "image_prompt":"..."},
    {"slide":6, "subtitle":"", "title":"소제목", "body":"결론/느낀점 7~10줄", "image_type":"Pinterest", "image_prompt":"..."},
    {"slide":7, "subtitle":"", "title":"CTA제목", "body":"CTA본문", "image_type":"고정", "image_prompt":""}
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
  if (!templateUid) { console.warn(`[BB] No template for slide ${slideNum}`); return null; }
  // 내용 있는 항목만 전달 (빈 문자열/공백 제외 → 템플릿에서 안 보이게)
  const modifications = [
    slide.title?.trim() && { name: 'title', text: slide.title.trim() },
    slide.subtitle?.trim() && { name: 'subtitle', text: slide.subtitle.trim() },
    slide.body?.trim() && { name: 'body', text: slide.body.trim() },
    bgImageUrl && { name: 'bg_image', image_url: bgImageUrl },
  ].filter(Boolean);
  try {
    const res = await fetch('https://sync.api.bannerbear.com/v2/images', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.BANNERBEAR_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: templateUid, modifications }),
    });
    const data = await res.json();
    if (data.image_url) {
      console.log(`[BB] Slide ${slideNum}: OK`);
      return data.image_url;
    }
    console.error(`[BB] Slide ${slideNum} failed:`, data.message || data.error || JSON.stringify(data).substring(0, 100));
    return null;
  } catch (e) { console.error(`[BB] Slide ${slideNum} error:`, e.message); return null; }
}

// ─── Zernio 발행 ───
async function publishToZernio(plan, imageUrls, topicSource) {
  // 출처 추가
  let igCaption = plan.instagram_caption || '';
  if (topicSource && !igCaption.includes('출처')) {
    igCaption += `\n\n출처: ${topicSource}`;
  }
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
      chatText += `━━━ 캡션 ━━━\nIG: ${plan.instagram_caption || '(캡션 생성 실패 — 수동 입력 필요)'}\n\nTT: ${plan.tiktok_caption || '(캡션 생성 실패)'}\n\n`;
      chatText += `✏️ 수정할 부분 말씀해주세요. "생성해" 라고 하면 이미지 생성 + Zernio 발행합니다.`;

      return res.status(200).json({ success: true, action: 'draft', chatText, plan });
    }

    // ─── "생성해" → 이미지 생성 + 발행 ───
    if (action === 'generate') {
      const plan = customPlan || await redis.get('sisuru:draft').then(d => d ? (typeof d === 'string' ? JSON.parse(d) : d) : null);
      if (!plan?.slides) return res.status(200).json({ error: 'No draft. Select a topic first.' });

      console.log('[Select] Generating images...');

      // 7장 보장 (Claude가 6장만 줬을 때 CTA 추가)
      let slides = plan.slides || [];
      if (slides.length < 7) {
        slides = [...slides, { slide: 7, subtitle: '', title: '더 솔직한 정보 원해?', body: '댓글에 나도 남겨줘 👇\nDM으로 직접 알려줄게', image_type: '고정', image_prompt: '' }];
      }
      // slide 번호 보장
      slides = slides.map((s, i) => ({ ...s, slide: s.slide || i + 1 }));

      // 배경 이미지 생성 (타입별 분기)
      const { captureAndUpload } = await import('./utils/screenshot.js');
      const bgPromises = slides.map(async (s) => {
        if (s.image_type === '고정') return null;
        if (s.image_type === '올리브영' || s.image_type === '올리브영캡처' || s.image_type === 'Pinterest' || s.image_type === '핀터레스트') {
          const url = await captureAndUpload(s.image_type, s.image_prompt);
          if (url) return url;
          // fallback to Imagen
        }
        return s.image_prompt ? generateBgImage(s.image_prompt) : null;
      });
      const bgImages = await Promise.all(bgPromises);
      console.log(`[Select] BG: ${bgImages.filter(Boolean).length}`);

      // Bannerbear 7장 병렬
      const bbPromises = slides.map((s, i) => generateBannerbearImage(s.slide, s, bgImages[i] || null));
      const imageUrls = await Promise.all(bbPromises);
      const validImages = imageUrls.filter(Boolean);
      console.log(`[Select] Cards: ${validImages.length}/${slides.length}`);

      // 출처 가져오기
      const selectedData = await redis.get('sisuru:selected');
      const topicSource = selectedData ? (typeof selectedData === 'string' ? JSON.parse(selectedData) : selectedData)?.source : null;

      // Zernio 발행
      const zernioResult = await publishToZernio(plan, validImages, topicSource);
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

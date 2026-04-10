import { Redis } from '@upstash/redis';

export const config = { maxDuration: 300 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const PROFILE_ID = process.env.SISURU_PROFILE_ID || '69d8a52731c2441246bef194';
const IG_ACCOUNT = process.env.SISURU_IG_ACCOUNT_ID || '69d8a6257dea335c2bd101f6';
const TT_ACCOUNT = process.env.SISURU_TT_ACCOUNT_ID || '69d8a5c27dea335c2bd100ad';

// Bannerbear 템플릿 UID (장별)
const BB_TEMPLATES = {
  1: '1oMJnB5r9QRMZl2wqL',
  2: 'lzw71BD6ExN950eYkn',
  3: 'n1MJGd52QzJoZ7LaPV',
  4: '6anBGWDAW0JgZO3812',
  5: 'Aqa9wzDP2jQRZJogk7',
  6: 'l9E7G65ko0XY5PLe3R',
  7: 'vz9ByYbNVYQ0bRGXrw',
};

// ─── Step 3: Claude 7장 기획 ───
async function planSlides(topic) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: `주제: "${topic.title}"
카테고리: ${topic.category}
후킹: "${topic.hook}"

시수르더쿠(@sisru_doku) 7장 카드뉴스 기획.
톤: 친구처럼 솔직, 도발적, 충격적 사실 공유.
주의: 밀리밀리/화장품 브랜드 언급 절대 금지.

1장 후킹: 엄지 멈추는 충격 문구 (예: "이거 모르면 피부과 돈 낭비 🤯" / "보톡스 맞기 전 반드시 알아야 할 것")
2장 후킹심화: 궁금증 폭발 (예: "사실 이게 핵심이었어..." / "돈 아끼려다 더 쓴 사람들")
3장 본론①: 핵심 정보 STEP 1
4장 본론②: 핵심 정보 STEP 2
5장 본론③: 핵심 정보 STEP 3
6장 요약: "정리하면 이거야 ✅"
7장 CTA: 고정 (생략)

Instagram 캡션: 후킹1줄 + (빈줄3) + 본문2줄 + (빈줄3) + "💬 댓글에 나도 남기면 DM 보내줄게" + 해시태그 25개
TikTok 캡션: 후킹 60자 + 해시태그 7개

JSON만:
{
  "slides": [
    {"slide":1, "subtitle":"후킹", "title":"메인텍스트", "body":""},
    {"slide":2, "subtitle":"후킹 심화", "title":"텍스트", "body":""},
    {"slide":3, "subtitle":"STEP 1", "title":"소제목", "body":"본문 내용"},
    {"slide":4, "subtitle":"STEP 2", "title":"소제목", "body":"본문 내용"},
    {"slide":5, "subtitle":"STEP 3", "title":"소제목", "body":"본문 내용"},
    {"slide":6, "subtitle":"정리하면", "title":"요약 제목", "body":"요약 내용"}
  ],
  "instagram_caption": "전체 캡션 (해시태그 25개)",
  "tiktok_caption": "60자 + 해시태그 7개"
}` }],
    }),
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || '{}';
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

// ─── Step 4: Bannerbear 이미지 생성 (7장 병렬) ───
async function generateBannerbearImage(slideNum, slide) {
  const templateUid = BB_TEMPLATES[slideNum];
  if (!templateUid) return null;

  const modifications = slideNum === 7
    ? [] // 7장 CTA 고정
    : [
        slide.title && { name: 'title', text: slide.title },
        slide.subtitle && { name: 'subtitle', text: slide.subtitle },
        slide.body && { name: 'body', text: slide.body },
      ].filter(Boolean);

  try {
    const res = await fetch('https://sync.api.bannerbear.com/v2/images', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.BANNERBEAR_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: templateUid, modifications }),
    });
    const data = await res.json();
    if (data.image_url) {
      console.log(`[Select] Slide ${slideNum}: ${data.image_url.substring(0, 60)}...`);
      return data.image_url;
    }
    console.warn(`[Select] Slide ${slideNum} failed:`, data.message || data.error || 'no image_url');
    return null;
  } catch (e) {
    console.error(`[Select] Slide ${slideNum} error:`, e.message);
    return null;
  }
}

// ─── Step 5: Zernio 발행 ───
async function publishToZernio(plan, imageUrls) {
  // IG 해시태그 안전장치
  const igCaption = plan.instagram_caption || '';
  const hashCount = (igCaption.match(/#/g) || []).length;
  const safeCaption = hashCount > 28 ? igCaption.replace(/(#\S+\s*){5}$/, '').trim() : igCaption;

  const body = {
    profileId: PROFILE_ID,
    platforms: [
      { platform: 'instagram', accountId: IG_ACCOUNT, platformSpecificData: { caption: safeCaption } },
      { platform: 'tiktok', accountId: TT_ACCOUNT, platformSpecificData: { caption: plan.tiktok_caption } },
    ],
    content: safeCaption?.substring(0, 2200) || plan.tiktok_caption,
    status: 'scheduled',
    scheduledFor: new Date(Date.now() + 60000).toISOString(),
    publishNow: true,
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

// ─── Step 6: Google Sheets 기록 ───
async function logToSheets(topic, plan, imageUrls, zernioResult) {
  if (!process.env.CONTENT_LOG_SHEET_ID || !process.env.GOOGLE_REFRESH_TOKEN) return;
  try {
    const { google } = await import('googleapis');
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.CONTENT_LOG_SHEET_ID,
      range: 'A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          new Date().toISOString(),
          topic.category,
          topic.title,
          plan.slides?.[0]?.title || '',
          (plan.instagram_caption || '').substring(0, 100),
          (plan.tiktok_caption || '').substring(0, 60),
          imageUrls.filter(Boolean).join('\n'),
          zernioResult?.post?.status || zernioResult?.error || '-',
        ]],
      },
    });
  } catch (e) { console.warn('[Select] Sheet log failed:', e.message); }
}

// ─── Handler ───
export default async function handler(req, res) {
  // GET: 제안 목록
  if (req.method === 'GET') {
    const proposals = await redis.get('sisuru:proposals');
    const selected = await redis.get('sisuru:selected');
    return res.status(200).json({
      proposals: proposals ? (typeof proposals === 'string' ? JSON.parse(proposals) : proposals) : null,
      selected: selected ? (typeof selected === 'string' ? JSON.parse(selected) : selected) : null,
    });
  }

  // POST: 선택 → 기획 → Bannerbear → Zernio → Sheets
  if (req.method === 'POST') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required (1~5)' });

    const proposals = await redis.get('sisuru:proposals');
    const data = proposals ? (typeof proposals === 'string' ? JSON.parse(proposals) : proposals) : null;
    if (!data?.proposals) return res.status(200).json({ error: 'No proposals. Run trend research first.' });

    const topic = data.proposals.find(p => p.id === Number(id));
    if (!topic) return res.status(400).json({ error: `Proposal ${id} not found` });

    await redis.set('sisuru:selected', JSON.stringify({ ...topic, selectedAt: new Date().toISOString() }), { ex: 86400 });
    console.log(`[Select] #${id}: ${topic.title}`);

    try {
      // Step 3: 기획
      console.log('[Select] Planning slides...');
      const plan = await planSlides(topic);
      if (!plan?.slides) return res.status(200).json({ success: false, error: 'Planning failed' });
      console.log(`[Select] Plan: ${plan.slides.length} slides`);

      // Step 4: Bannerbear 7장 병렬 생성
      console.log('[Select] Generating Bannerbear images...');
      const slides = [...plan.slides, { slide: 7 }]; // 7장 CTA 추가
      const imagePromises = slides.map(s => generateBannerbearImage(s.slide, s));
      const imageUrls = await Promise.all(imagePromises);
      const validImages = imageUrls.filter(Boolean);
      console.log(`[Select] Images: ${validImages.length}/${slides.length}`);

      // Step 5: Zernio 발행
      console.log('[Select] Publishing...');
      const zernioResult = await publishToZernio(plan, validImages);
      console.log('[Select] Published:', zernioResult?.post?.status || zernioResult?.error);

      // Step 6: Sheets 기록
      await logToSheets(topic, plan, validImages, zernioResult);

      // Activity log
      await redis.lpush('activity:log', JSON.stringify({
        agent: 'AI 크리에이터', action: `시수르더쿠 카드뉴스 발행: ${topic.title}`,
        detail: `${validImages.length}장 이미지`, timestamp: Date.now(),
      }));
      await redis.ltrim('activity:log', 0, 49);

      return res.status(200).json({
        success: true,
        topic: topic.title,
        category: topic.category,
        hook: plan.slides?.[0]?.title,
        slides: plan.slides?.length,
        images: validImages.length,
        zernio: { status: zernioResult?.post?.status, id: zernioResult?.post?._id, error: zernioResult?.error },
      });
    } catch (error) {
      console.error('[Select] Error:', error.message);
      return res.status(200).json({ success: false, error: error.message });
    }
  }

  return res.status(405).json({ error: 'GET or POST' });
}

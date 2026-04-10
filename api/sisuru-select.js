import { Redis } from '@upstash/redis';

export const config = { maxDuration: 300 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const PROFILE_ID = process.env.SISURU_PROFILE_ID || '69d8a52731c2441246bef194';
const IG_ACCOUNT = process.env.SISURU_IG_ACCOUNT_ID || '69d8a6257dea335c2bd101f6';
const TT_ACCOUNT = process.env.SISURU_TT_ACCOUNT_ID || '69d8a5c27dea335c2bd100ad';

// Canva 템플릿 element ID
const SLIDES = {
  1: { subtitle: 'PBQnrYjN0zCRC3Qh-LBVwGtM2N0t4XDbL', main: 'PBQnrYjN0zCRC3Qh-LBzWG8127hWWVY46', bg: 'PBQnrYjN0zCRC3Qh' },
  2: { subtitle: 'PB3VCDYPtHydNdT8-LB7917xn6XZcgpjN', main: 'PB3VCDYPtHydNdT8-LBKQ0zWqzn66jH6g', bg: 'PB3VCDYPtHydNdT8' },
  3: { subtitle: 'PBCqmxYrmz7rSD4l-LBWDqLtL3tZy8wd8', body: 'PBCqmxYrmz7rSD4l-LBbqcgKT0CWPGzTB', bg: 'PBCqmxYrmz7rSD4l' },
  4: { subtitle: 'PBJwgDJyb9kLGzXQ-LBpTTZvVGdjv6156', body: 'PBJwgDJyb9kLGzXQ-LBGPTXHzVPXLmB3C', bg: 'PBJwgDJyb9kLGzXQ' },
  5: { subtitle: 'PBLKRZrylx2bpQ8k-LBb02BjHpp8vpMgN', body: 'PBLKRZrylx2bpQ8k-LBZwClRY7j080DJg', bg: 'PBLKRZrylx2bpQ8k' },
  6: { subtitle: 'PBmy6rSmx3gy064x-LBMrQN66JprCStGs', body: 'PBmy6rSmx3gy064x-LBzYknXmH8WsCxH5', bg: 'PBmy6rSmx3gy064x' },
  7: { /* CTA 고정 — 수정 안 함 */ },
};

// ─── Step 1: Claude로 7장 기획 ───
async function planSlides(topic) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: `주제: "${topic.topic}"
후킹: "${topic.hook}"

이 주제로 인스타그램 7장 카드뉴스 슬라이드를 만들어줘.
채널: 시수르더쿠 (@sisru_doku) — 솔직한 뷰티 정보
톤: 친구처럼 직설적, 약간 도발적

각 슬라이드:
1장: 소제목 + 후킹 메인텍스트 (3초 안에 충격/호기심)
2장: 소제목 + 궁금증 심화 텍스트
3장: 소제목(STEP 1) + 본론 ① (핵심 정보)
4장: 소제목(STEP 2) + 본론 ②
5장: 소제목(STEP 3) + 본론 ③
6장: 소제목(정리) + 요약 텍스트
7장: CTA 고정 (생략)

각 슬라이드 이미지 프롬프트도 생성 (영어, 50단어, 뷰티/스킨케어 aesthetic)

Instagram 캡션: 후킹 1줄 + 빈줄3 + 본문 2줄 + 빈줄3 + 댓글 CTA + 해시태그 25개
TikTok 캡션: 60자 + 해시태그 7개

JSON만:
{
  "slides": [
    {"slide":1, "subtitle":"소제목", "text":"메인텍스트", "image_prompt":"영어 프롬프트"},
    {"slide":2, "subtitle":"소제목", "text":"텍스트", "image_prompt":"프롬프트"},
    {"slide":3, "subtitle":"STEP 1", "text":"본론", "image_prompt":"프롬프트"},
    {"slide":4, "subtitle":"STEP 2", "text":"본론", "image_prompt":"프롬프트"},
    {"slide":5, "subtitle":"STEP 3", "text":"본론", "image_prompt":"프롬프트"},
    {"slide":6, "subtitle":"정리하면", "text":"요약", "image_prompt":"프롬프트"}
  ],
  "instagram_caption": "전체 캡션 (해시태그 25개 포함)",
  "tiktok_caption": "60자 + 해시태그 7개"
}` }],
    }),
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || '{}';
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

// ─── Step 2: Gemini Imagen 이미지 생성 ───
async function generateImage(prompt, index) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: `${prompt}. Square format, aesthetic Korean beauty style, clean minimal background, Instagram feed post` }],
          parameters: { sampleCount: 1, aspectRatio: '1:1' },
        }),
      }
    );
    const data = await res.json();
    const b64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) return null;

    // Zernio에 업로드해서 URL 획득
    if (process.env.ZERNIO_API_KEY) {
      const formData = new FormData();
      formData.append('files', new Blob([Buffer.from(b64, 'base64')], { type: 'image/png' }), `slide_${index}.png`);
      const uploadRes = await fetch('https://zernio.com/api/v1/media', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` },
        body: formData,
      });
      const uploadData = await uploadRes.json();
      return uploadData.files?.[0]?.url || null;
    }
    return null;
  } catch (e) {
    console.error(`[Select] Image ${index} error:`, e.message);
    return null;
  }
}

// ─── Step 3: Canva 편집 (연결 시) ───
async function editCanva(slides, imageUrls) {
  try {
    const { createCardNews } = await import('./utils/canva.js');
    return await createCardNews(slides, imageUrls);
  } catch (e) {
    console.warn('[Select] Canva skipped:', e.message);
    return null;
  }
}

// ─── Step 4: Zernio 발행 ───
async function publishToZernio(plan, mediaUrls) {
  const igCaption = (plan.instagram_caption || '');
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

  if (mediaUrls?.length > 0) {
    body.mediaItems = mediaUrls.map((url, i) => ({ type: 'image', url, filename: `slide_${i + 1}.png` }));
  }

  const res = await fetch('https://zernio.com/api/v1/posts', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default async function handler(req, res) {
  // GET: 제안 목록 조회
  if (req.method === 'GET') {
    const proposals = await redis.get('sisuru:proposals');
    const selected = await redis.get('sisuru:selected');
    return res.status(200).json({
      proposals: proposals ? (typeof proposals === 'string' ? JSON.parse(proposals) : proposals) : null,
      selected: selected ? (typeof selected === 'string' ? JSON.parse(selected) : selected) : null,
    });
  }

  // POST: 선택 → 기획 → 이미지 → Canva → 발행
  if (req.method === 'POST') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required (1~5)' });

    const proposals = await redis.get('sisuru:proposals');
    const data = proposals ? (typeof proposals === 'string' ? JSON.parse(proposals) : proposals) : null;
    if (!data?.proposals) return res.status(200).json({ error: 'No proposals. Run /api/cron/sisuru-propose first.' });

    const topic = data.proposals.find(p => p.id === Number(id));
    if (!topic) return res.status(400).json({ error: `Proposal ${id} not found` });

    await redis.set('sisuru:selected', JSON.stringify({ ...topic, selectedAt: new Date().toISOString() }), { ex: 86400 });
    console.log(`[Select] #${id}: ${topic.topic}`);

    try {
      // Step 1: 7장 기획
      console.log('[Select] Planning slides...');
      const plan = await planSlides(topic);
      if (!plan) return res.status(200).json({ success: false, error: 'Planning failed' });

      // Step 2: 이미지 생성 (6장, 7장은 고정)
      console.log('[Select] Generating images...');
      const imagePromises = (plan.slides || []).slice(0, 6).map((s, i) => generateImage(s.image_prompt, i + 1));
      const imageUrls = await Promise.all(imagePromises);
      const validImages = imageUrls.filter(Boolean);
      console.log(`[Select] Images: ${validImages.length}/6`);

      // Step 3: Canva 편집 (연결 시)
      let canvaResult = null;
      let finalMedia = validImages;
      try {
        canvaResult = await editCanva(plan.slides, validImages);
        if (canvaResult?.exportUrl) finalMedia = [canvaResult.exportUrl];
      } catch {}

      // Step 4: Zernio 발행
      console.log('[Select] Publishing...');
      const zernioResult = await publishToZernio(plan, finalMedia);
      console.log('[Select] Published:', zernioResult?.post?.status || zernioResult?.error);

      return res.status(200).json({
        success: true,
        topic: topic.topic,
        hook: plan.slides?.[0]?.text,
        slides: plan.slides?.length,
        images: validImages.length,
        canva: canvaResult ? 'edited' : 'skipped',
        zernio: { status: zernioResult?.post?.status, id: zernioResult?.post?._id, error: zernioResult?.error },
      });
    } catch (error) {
      console.error('[Select] Error:', error.message);
      return res.status(200).json({ success: false, error: error.message });
    }
  }

  return res.status(405).json({ error: 'GET or POST' });
}

import { google } from 'googleapis';
import { Redis } from '@upstash/redis';

export const config = { maxDuration: 300 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const PROFILE_ID = process.env.SISURU_PROFILE_ID || '69d8a52731c2441246bef194';

// ─── Step 1: 트렌드 리서치 + Step 2: 7장 카드뉴스 기획 ───
async function planCardNews() {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: `오늘 인스타그램 카드뉴스 기획을 해줘.

채널: 시수르더쿠 (@sisru_doku) — 솔직한 뷰티/스킨케어 정보 채널
대상: 20~35세 여성, 피부 고민 있는 사람
톤: 친구처럼 솔직하고 직설적, 약간 도발적

## 트렌드 리서치
아래 소스에서 오늘 핫한 뷰티/스킨케어 주제를 찾아줘:
- Reddit: r/SkincareAddiction, r/AsianBeauty 인기 글
- 올리브영 실시간 랭킹 키워드
- 글로우픽 인기 리뷰 키워드
- X(트위터) #스킨케어 #뷰티 트렌드
→ TOP5 키워드에서 오늘의 주제 1개 확정

## 7장 카드뉴스 기획
1장 후킹: 엄지 멈추게 하는 한 줄 (3초 안에 읽히고 충격/호기심/공감 유발)
  예: "이거 모르면 피부과 돈 낭비 🤯" / "한국 여자들이 세안 후 바로 하는 것" / "피부과 의사가 집에서 쓰는 것"
2장 후킹심화: 궁금증 폭발 — "사실 이게 핵심이었어..." / "댓글에 알려줘 남기면 DM 보내줄게 👀"
3장 본론1: 핵심 정보 ①
4장 본론2: 핵심 정보 ②
5장 본론3: 핵심 정보 ③
6장 요약: "정리하면 이거야 ✅" 한눈에 정리
7장 CTA: "더 솔직한 정보 원해? 댓글에 나도 남겨줘 👇 DM으로 직접 알려줄게 팔로우하면 매일 이런 정보 받아볼 수 있어"

## 캡션
Instagram 캡션:
- 1줄 후킹 (1장과 동일)
- (빈줄 3개)
- 본문 요약 2-3줄
- (빈줄 3개)
- "💬 댓글에 나도 남기면 DM 보내줄게"
- 해시태그 25개 이하 (뷰티/스킨케어 한국어+영어 트렌디)

TikTok 캡션:
- 후킹 문구 60자 이내
- 해시태그 7개

JSON만 응답:
{
  "topic": "오늘의 주제",
  "type": "스킨케어팁/제품리뷰/성분분석/루틴/비교 중 택1",
  "trend_keywords": ["키워드1", "키워드2", ...5개],
  "slides": [
    {"slide": 1, "type": "hook", "text": "후킹 텍스트", "image_prompt": "Higgsfield 영어 프롬프트 50단어"},
    {"slide": 2, "type": "hook_deep", "text": "후킹심화 텍스트", "image_prompt": "영어 프롬프트"},
    {"slide": 3, "type": "content", "text": "본론1 텍스트", "image_prompt": "영어 프롬프트"},
    {"slide": 4, "type": "content", "text": "본론2 텍스트", "image_prompt": "영어 프롬프트"},
    {"slide": 5, "type": "content", "text": "본론3 텍스트", "image_prompt": "영어 프롬프트"},
    {"slide": 6, "type": "summary", "text": "요약 텍스트"},
    {"slide": 7, "type": "cta", "text": "CTA 텍스트"}
  ],
  "instagram_caption": "전체 인스타 캡션 (해시태그 25개 이하 포함)",
  "tiktok_caption": "틱톡 캡션 60자 + 해시태그 7개",
  "hashtags_ig": ["#태그", ...30개],
  "hashtags_tt": ["#태그", ...7개]
}` }],
    }),
  });

  const data = await res.json();
  const text = data.content?.[0]?.text || '{}';
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

// ─── Step 3: Google Gemini Imagen 3 이미지 생성 ───
async function generateImage(prompt, index) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('[Sisuru] GEMINI_API_KEY not set, skipping image');
    return null;
  }
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
    if (data.error) {
      console.error(`[Sisuru] Imagen ${index} error:`, data.error.message);
      return null;
    }
    // Imagen returns base64 — upload to Zernio media
    const b64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) {
      console.log(`[Sisuru] Imagen ${index}: no image data`);
      return null;
    }
    // Upload base64 to Zernio media for URL
    if (process.env.ZERNIO_API_KEY) {
      const formData = new FormData();
      const buf = Buffer.from(b64, 'base64');
      formData.append('files', new Blob([buf], { type: 'image/png' }), `slide_${index}.png`);
      const uploadRes = await fetch('https://zernio.com/api/v1/media', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` },
        body: formData,
      });
      const uploadData = await uploadRes.json();
      const url = uploadData.files?.[0]?.url;
      console.log(`[Sisuru] Image ${index}: ${url ? 'uploaded to Zernio' : 'upload failed'}`);
      return url;
    }
    // Fallback: return data URI
    console.log(`[Sisuru] Image ${index}: generated (base64, ${b64.length} chars)`);
    return `data:image/png;base64,${b64.substring(0, 100)}...`; // truncated for log
  } catch (e) {
    console.error(`[Sisuru] Image ${index} error:`, e.message);
    return null;
  }
}

// ─── Step 4: Google Drive 저장 ───
async function saveToDrive(plan, imageUrls) {
  if (!process.env.GOOGLE_REFRESH_TOKEN) return null;
  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth });

    const today = new Date().toISOString().slice(0, 10);
    const parentId = process.env.SISURU_DRIVE_FOLDER_ID;
    if (!parentId) return null;

    // 날짜별 폴더 생성
    const folderRes = await drive.files.create({
      requestBody: { name: today, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id',
    });
    const folderId = folderRes.data.id;

    // 기획 JSON 저장
    await drive.files.create({
      requestBody: { name: 'plan.json', parents: [folderId], mimeType: 'application/json' },
      media: { mimeType: 'application/json', body: JSON.stringify(plan, null, 2) },
    });

    console.log(`[Sisuru] Saved to Drive: ${today}/`);
    return folderId;
  } catch (e) {
    console.error('[Sisuru] Drive save error:', e.message);
    return null;
  }
}

// ─── Step 5: Canva MCP (준비 중) ───
async function createCanvaDesign(plan, imageUrls) {
  // TODO: Canva MCP 서버 연동
  // Template: DAHGRefiPUY (1080x1350)
  // mcp_servers: https://mcp.canva.com/mcp
  console.log('[Sisuru] Canva MCP 준비 중 — 이미지 직접 사용');
  return imageUrls.filter(Boolean);
}

// ─── Step 6: Zernio 발행 ───
async function publishToZernio(plan, mediaUrls) {
  if (!process.env.ZERNIO_API_KEY) throw new Error('ZERNIO_API_KEY not set');

  // IG 해시태그 30개 제한 안전장치
  const igCaption = (plan.instagram_caption || '');
  const hashtagCount = (igCaption.match(/#/g) || []).length;
  const safeCaption = hashtagCount > 28
    ? igCaption.replace(/(#\S+\s*){5}$/, '').trim() // 마지막 5개 제거
    : igCaption;

  const body = {
    profileId: PROFILE_ID,
    platforms: [
      {
        platform: 'instagram',
        accountId: process.env.SISURU_IG_ACCOUNT_ID || '69d8a6257dea335c2bd101f6',
        platformSpecificData: { caption: safeCaption },
      },
      {
        platform: 'tiktok',
        accountId: process.env.SISURU_TT_ACCOUNT_ID || '69d8a5c27dea335c2bd100ad',
        platformSpecificData: { caption: plan.tiktok_caption },
      },
    ],
    content: safeCaption?.substring(0, 2200) || plan.tiktok_caption,
    status: 'scheduled',
    scheduledFor: new Date(Date.now() + 60000).toISOString(),
    publishNow: true,
  };

  if (mediaUrls?.length > 0) {
    body.mediaItems = mediaUrls.map((url, i) => ({
      type: 'image', url, filename: `slide_${i + 1}.jpg`,
    }));
  }

  const res = await fetch('https://zernio.com/api/v1/posts', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── Step 7: Google Sheets 기록 ───
async function logToSheets(plan, result) {
  if (!process.env.GOOGLE_REFRESH_TOKEN || !process.env.CONTENT_LOG_SHEET_ID) return;
  try {
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
          plan.topic,
          plan.type,
          plan.slides?.[0]?.text || '',
          plan.instagram_caption?.substring(0, 100),
          (plan.hashtags_ig || []).slice(0, 5).join(' '),
          result?.post?._id || '-',
          result?.post?.status || '-',
        ]],
      },
    });
  } catch (e) {
    console.warn('[Sisuru] Sheet log failed:', e.message);
  }
}

// ─── Handler ───
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Step 1+2: 트렌드 리서치 + 카드뉴스 기획
    console.log('[Sisuru] Step 1+2: Planning...');
    const plan = await planCardNews();
    if (!plan) return res.status(200).json({ error: 'Planning failed' });
    console.log(`[Sisuru] Topic: ${plan.topic} (${plan.type})`);

    // KV에 기획 저장
    await redis.set('sisuru:latest-plan', JSON.stringify(plan), { ex: 86400 });

    // Step 3: 이미지 생성 (후킹 1장 + 후킹심화 1장 = 최소 2장)
    console.log('[Sisuru] Step 3: Generating images...');
    const imagePromises = (plan.slides || [])
      .filter(s => s.image_prompt)
      .slice(0, 3) // 서버리스 시간 제한으로 최대 3장
      .map((s, i) => generateImage(s.image_prompt, s.slide));
    const imageUrls = await Promise.all(imagePromises);
    const validImages = imageUrls.filter(Boolean);
    console.log(`[Sisuru] Images: ${validImages.length}/${imagePromises.length}`);

    // Step 4: Drive 저장
    const driveFolderId = await saveToDrive(plan, validImages);

    // Step 5: Canva (준비 중)
    const finalMedia = await createCanvaDesign(plan, validImages);

    // Step 6: Zernio 발행
    console.log('[Sisuru] Step 6: Publishing...');
    let zernioResult = null;
    try {
      zernioResult = await publishToZernio(plan, finalMedia);
      console.log(`[Sisuru] Published: ${zernioResult?.post?.status || zernioResult?.error || 'unknown'}`);
    } catch (e) {
      console.error('[Sisuru] Publish error:', e.message);
      zernioResult = { error: e.message };
    }

    // Step 7: Sheets 기록
    await logToSheets(plan, zernioResult);

    return res.status(200).json({
      success: true,
      topic: plan.topic,
      type: plan.type,
      hook: plan.slides?.[0]?.text,
      slides: plan.slides?.length || 0,
      images: validImages.length,
      drive: driveFolderId ? 'saved' : 'skipped',
      zernio: { status: zernioResult?.post?.status, id: zernioResult?.post?._id, error: zernioResult?.error },
    });
  } catch (error) {
    console.error('[Sisuru] Fatal:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

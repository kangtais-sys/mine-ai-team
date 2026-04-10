export const config = { maxDuration: 300 };

// 1. Claude로 오늘의 뷰티 트렌드 기획
async function planContent() {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: `오늘 인스타그램/틱톡/유튜브 쇼츠에 올릴 K-뷰티 콘텐츠를 기획해줘.

채널: 유민혜 크리에이터 (@15초유민혜 / @peerstory)
주의: 밀리밀리/화장품 브랜드 홍보 아님. 트렌디한 뷰티/패션/라이프스타일 콘텐츠.

JSON만 응답:
{
  "type": "뷰티팁/패션/일상 중 택1",
  "topic": "구체적 주제 (예: 여름 데일리 메이크업 루틴)",
  "overlay_text": "영상 위 텍스트 (10자 이내, 임팩트)",
  "instagram_caption": "인스타 캡션 (이모지 포함, 150자 이내)",
  "tiktok_caption": "틱톡 캡션 (이모지 포함, 150자 이내)",
  "youtube_title": "유튜브 제목 (SEO, 50자 이내)",
  "youtube_description": "유튜브 설명 (3줄)",
  "hashtags": ["#태그1", "#태그2", ...8개],
  "image_prompt": "Higgsfield 이미지 생성용 영어 프롬프트 (뷰티/패션 스타일, 50단어 이내)"
}` }],
    }),
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || '{}';
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

// 2. Higgsfield API로 이미지 생성
async function generateImage(prompt) {
  if (!process.env.HIGGSFIELD_API_KEY) {
    console.log('[Sisuru] HIGGSFIELD_API_KEY not set, skipping image generation');
    return null;
  }

  try {
    const res = await fetch('https://api.higgsfield.ai/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.HIGGSFIELD_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, n: 1, size: '1080x1920' }),
    });
    const data = await res.json();
    return data.data?.[0]?.url || null;
  } catch (e) {
    console.error('[Sisuru] Higgsfield error:', e.message);
    return null;
  }
}

// 3. Canva MCP로 템플릿 편집 + PNG export (준비 중)
async function createCanvaDesign(plan, imageUrl) {
  // Canva MCP endpoint: https://mcp.canva.com/mcp
  // Template ID: DAHGRefiPUY
  // TODO: Canva MCP 서버 연동 시 구현
  console.log('[Sisuru] Canva MCP 연동 준비 중 — 이미지 URL로 대체:', imageUrl || 'none');
  return imageUrl; // 현재는 Higgsfield 이미지 직접 사용
}

// 4. Zernio로 멀티플랫폼 발행
async function publishToZernio(plan, mediaUrl) {
  if (!process.env.ZERNIO_API_KEY) throw new Error('ZERNIO_API_KEY not set');

  const content = `${plan.instagram_caption || plan.tiktok_caption}\n${(plan.hashtags || []).join(' ')}`.substring(0, 2200);

  const body = {
    profileId: process.env.ZERNIO_YUMINHYE_PROFILE_ID || '69d08807986d57bb8f72f7e6',
    platforms: [
      {
        platform: 'instagram',
        accountId: '69d08dbbbf4d9161df5463f1', // @millimilli.official (유민혜 인스타 미연결이므로 밀리밀리 사용)
        platformSpecificData: { caption: `${plan.instagram_caption}\n${(plan.hashtags || []).join(' ')}` },
      },
      {
        platform: 'youtube',
        accountId: '69d08acebf4d9161df545c66', // @15초유민혜
        platformSpecificData: {
          title: plan.youtube_title,
          description: `${plan.youtube_description}\n\n${(plan.hashtags || []).join(' ')}`,
          tags: (plan.hashtags || []).map(t => t.replace('#', '')),
        },
      },
      {
        platform: 'tiktok',
        accountId: '69d08abdbf4d9161df545c4b', // @peerstory
        platformSpecificData: { caption: `${plan.tiktok_caption}\n${(plan.hashtags || []).join(' ')}` },
      },
    ],
    content,
    status: 'scheduled',
    scheduledFor: new Date(Date.now() + 60000).toISOString(),
    publishNow: true,
  };

  // 미디어 추가 (이미지 있으면)
  if (mediaUrl) {
    body.mediaItems = [{ type: 'image', url: mediaUrl, filename: 'sisuru-content.jpg' }];
  }

  const res = await fetch('https://zernio.com/api/v1/posts', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// 5. Google Sheets 기록
async function logToSheets(plan, result) {
  if (!process.env.GOOGLE_REFRESH_TOKEN || !process.env.GOOGLE_CLIENT_ID) return;
  try {
    const { google } = await import('googleapis');
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    const sheetId = process.env.CONTENT_LOG_SHEET_ID;
    if (!sheetId) return;

    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          new Date().toISOString(),
          plan.type,
          plan.topic,
          plan.youtube_title,
          plan.tiktok_caption,
          result?.post?._id || '-',
          result?.post?.status || '-',
        ]],
      },
    });
  } catch (e) {
    console.warn('[Sisuru] Sheet log failed:', e.message);
  }
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. 콘텐츠 기획
    console.log('[Sisuru] Step 1: Planning content...');
    const plan = await planContent();
    if (!plan) return res.status(200).json({ error: 'Content planning failed' });
    console.log('[Sisuru] Plan:', plan.type, plan.topic);

    // 2. 이미지 생성
    console.log('[Sisuru] Step 2: Generating image...');
    const imageUrl = await generateImage(plan.image_prompt);
    console.log('[Sisuru] Image:', imageUrl ? 'generated' : 'skipped');

    // 3. Canva 편집 (준비 중 — 이미지 직접 사용)
    const finalMedia = await createCanvaDesign(plan, imageUrl);

    // 4. Zernio 발행
    console.log('[Sisuru] Step 4: Publishing to Zernio...');
    const zernioResult = await publishToZernio(plan, finalMedia);
    console.log('[Sisuru] Published:', zernioResult?.post?.status || zernioResult?.error);

    // 5. 기록
    await logToSheets(plan, zernioResult);

    return res.status(200).json({
      success: true,
      plan: { type: plan.type, topic: plan.topic, title: plan.youtube_title },
      image: imageUrl ? 'generated' : 'skipped',
      zernio: { status: zernioResult?.post?.status, id: zernioResult?.post?._id },
    });
  } catch (error) {
    console.error('[Sisuru] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

export const config = { maxDuration: 120 };

const PROMPT = `이 영상의 첫 프레임을 보고 K-뷰티 SNS 콘텐츠용 메타데이터를 JSON으로 생성해줘.
브랜드: 밀리밀리 (MILLIMILLI), 500달톤 프로틴 스킨케어
응답 형식 (JSON만 출력):
{
  "youtube_title": "(60자 이내, 한국어, SEO 최적화, 궁금증 유발)",
  "youtube_description": "(한국어, 브랜드 소개 + 제품 특징 + 구매링크 안내 포함, 3-4줄)",
  "tiktok_caption": "(150자 이내, 틱톡 스타일, 감성적, 이모지 포함)",
  "hashtags": ["#밀리밀리", "#500달톤", "#K뷰티", "#스킨케어", ...10개],
  "thumbnail_text": "(10자 이내, 임팩트 있는 한국어)"
}`;

async function extractFirstFrame(videoBuffer) {
  // Use sharp-style approach: take first bytes as preview
  // For serverless: use video snapshot via canvas API or external service
  // Fallback: send raw video to Claude (supports video input)
  // Claude Vision accepts video directly — no frame extraction needed
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { videoUrl, imageUrl, imageBase64 } = req.body || {};

  if (!videoUrl && !imageUrl && !imageBase64) {
    return res.status(400).json({ error: 'videoUrl, imageUrl, or imageBase64 required' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  }

  try {
    let imageContent;

    if (imageBase64) {
      // Direct base64 image
      imageContent = {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
      };
    } else if (imageUrl) {
      // URL-based image
      imageContent = {
        type: 'image',
        source: { type: 'url', url: imageUrl },
      };
    } else if (videoUrl) {
      // Download video, take first frame as screenshot
      // For serverless: download and send thumbnail or first frame
      // Google Drive: convert to thumbnail URL
      const driveMatch = videoUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (driveMatch) {
        // Use Google Drive thumbnail
        const fileId = driveMatch[1];
        const thumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1280`;
        imageContent = {
          type: 'image',
          source: { type: 'url', url: thumbUrl },
        };
      } else {
        // Try downloading and using as-is
        const videoRes = await fetch(videoUrl);
        if (!videoRes.ok) return res.status(400).json({ error: `Failed to fetch: ${videoRes.status}` });

        // Check if it's an image
        const ct = videoRes.headers.get('content-type') || '';
        if (ct.startsWith('image/')) {
          const buf = await videoRes.arrayBuffer();
          const base64 = Buffer.from(buf).toString('base64');
          imageContent = {
            type: 'image',
            source: { type: 'base64', media_type: ct, data: base64 },
          };
        } else {
          return res.status(400).json({ error: 'Video URL must be a Google Drive link (for thumbnail) or direct image URL. Use imageUrl or imageBase64 for direct images.' });
        }
      }
    }

    // Call Claude Vision
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [imageContent, { type: 'text', text: PROMPT }],
        }],
      }),
    });

    const claudeData = await claudeRes.json();

    if (!claudeRes.ok) {
      console.error('[VideoAnalyze] Claude error:', JSON.stringify(claudeData));
      return res.status(200).json({ error: claudeData.error?.message || `Claude ${claudeRes.status}`, raw: claudeData });
    }

    const text = claudeData.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const metadata = JSON.parse(jsonMatch[0]);
      console.log('[VideoAnalyze] Generated:', metadata.youtube_title);
      return res.status(200).json({ success: true, ...metadata });
    }

    return res.status(200).json({ success: false, raw: text });
  } catch (error) {
    console.error('[VideoAnalyze] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

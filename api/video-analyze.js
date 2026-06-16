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

// 코어 — 엔드포인트·cron 공용. {success, ...metadata} 또는 {error} 반환(throw 안 함).
export async function analyzeMedia({ videoUrl, imageUrl, imageBase64 } = {}) {
  if (!videoUrl && !imageUrl && !imageBase64) return { error: 'videoUrl, imageUrl, or imageBase64 required' };
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'ANTHROPIC_API_KEY not set' };
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
        if (!videoRes.ok) return { error: `Failed to fetch: ${videoRes.status}` };

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
          return { error: 'Video URL must be a Google Drive link (for thumbnail) or direct image URL. Use imageUrl or imageBase64 for direct images.' };
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
        model: 'claude-sonnet-4-6',
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
      return { error: claudeData.error?.message || `Claude ${claudeRes.status}`, raw: claudeData };
    }

    const text = claudeData.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const metadata = JSON.parse(jsonMatch[0]);
      console.log('[VideoAnalyze] Generated:', metadata.youtube_title);
      return { success: true, ...metadata };
    }

    return { success: false, raw: text };
  } catch (error) {
    console.error('[VideoAnalyze] Error:', error.message);
    return { error: error.message };
  }
}

// 다중프레임(유튜브 스토리보드 1/2/3.jpg = 시작/중간/끝) 씬분석 — Higgsfield HTTP video_analysis 미접근 폴백.
// 비트·전환·타이밍·룩을 떠서 milli² 생성 프롬프트로. 저작권: 크래프트만(원곡/얼굴 1:1 복제 금지).
const SCENE_PROMPT = `이 이미지들은 잘 나가는 뷰티 숏츠의 시작/중간/끝 프레임이다. milli² 500달톤 프로틴 미스트(팔자·물광)로 오리지널 제품화할 거다.
⚠️ 컴플라이언스(절대): 화장품 광고라 '주름 제거/사라짐/없어짐/펴짐/개선/리프팅' 같은 효능 단정 금지. 오직 **수분으로 도톰·물광·라인이 부드러워 보임(겉보기)** 표현만. 임상 입증 범위 내. 위반 워딩 출력 금지.
구조·전환·타이밍·룩을 분석해 JSON만 출력 (마크다운 없이):
{
 "hook": "(3초 궁금증 갭 훅, 한국어 한 줄 — 정보 다 주지 말고 반전/미스터리. 컴플라이언스 준수. 예: '팔자, 주름인 줄 알았죠? 사실 건조였어요')",
 "beats": ["0-3s 비트", "3-6s 비트", "6-9s 비트"],
 "look": "(조명·색감·페이싱·샷타입 요약, 영문)",
 "kling_prompt": "(milli² 미스트 영상 생성용 영문 프롬프트 1~2문장. 위 룩·전환·타이밍 반영 + 미스트 분사→dewy/plumping moisture glow(수분, NOT wrinkle removal/structural change) + KPI 궁금증갭·대세감, photorealistic 9:16 vertical, iPhone handheld. 원곡/원본 얼굴 복제 금지, 크래프트만.)"
}`;

export async function analyzeShortFrames(imageUrls = []) {
  const urls = imageUrls.filter(Boolean).slice(0, 4);
  if (!urls.length) return { error: 'no frames' };
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'ANTHROPIC_API_KEY not set' };
  try {
    const content = urls.map(u => ({ type: 'image', source: { type: 'url', url: u } }));
    content.push({ type: 'text', text: SCENE_PROMPT });
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1024, messages: [{ role: 'user', content }] }),
    });
    const d = await r.json();
    if (!r.ok) return { error: d.error?.message || `Claude ${r.status}` };
    const text = d.content?.[0]?.text || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { error: 'no json', raw: text.slice(0, 200) };
    return { success: true, ...JSON.parse(m[0]) };
  } catch (e) { return { error: e.message }; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (req.query?.frames === '1') return res.status(200).json(await analyzeShortFrames(req.body?.imageUrls || []));
  const out = await analyzeMedia(req.body || {});
  const code = out.error ? (/required|Google Drive|Failed to fetch/.test(out.error) ? 400 : 500) : 200;
  return res.status(code).json(out);
}

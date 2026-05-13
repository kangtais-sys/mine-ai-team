// Gemini 이미지 생성으로 페르소나 캐릭터 이미지 생성
// 1차: Imagen 3 (고품질, 빌링 필요)
// 2차 fallback: gemini-2.0-flash-preview-image-generation
// 3차 fallback: gemini-3.1-flash-image-preview
// env: GOOGLE_API_KEY 또는 GEMINI_API_KEY

const IMAGEN_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict';

// 시도할 Gemini 이미지 모델 순서 (최신 → 구버전)
const GEMINI_IMAGE_MODELS = [
  'gemini-2.0-flash-preview-image-generation',
  'gemini-3.1-flash-image-preview',
];

function buildImagePrompt(persona) {
  const parts = [
    'Korean female beauty creator, virtual influencer',
    'professional portrait photography, soft studio lighting, clean background',
  ];

  if (persona.hairStyle)     parts.push(persona.hairStyle);
  if (persona.signatureLook) parts.push(persona.signatureLook);
  if (persona.typicalOutfit) parts.push(persona.typicalOutfit);
  if (persona.skinType)      parts.push(`${persona.skinType} skin`);
  if (persona.accessories)   parts.push(persona.accessories);

  parts.push(
    'K-beauty aesthetic',
    'natural minimal makeup, glowing skin',
    'warm approachable expression, looking at camera',
    'high quality, photorealistic, sharp focus',
  );

  return parts.filter(Boolean).join(', ');
}

// 응답이 JSON인지 확인 후 파싱
async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`API ${res.status} 비JSON 응답: ${text.substring(0, 200)}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // GOOGLE_API_KEY 또는 GEMINI_API_KEY 둘 다 시도
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error: 'API 키 없음 (GOOGLE_API_KEY 또는 GEMINI_API_KEY 필요)',
      hint: 'Google AI Studio (aistudio.google.com)에서 발급 후 Vercel 환경변수에 추가',
    });
  }

  const { persona = {}, extraPrompt = '' } = req.body || {};
  const prompt = buildImagePrompt(persona) + (extraPrompt ? `, ${extraPrompt}` : '');

  const errors = [];

  try {
    // ── 1차: Imagen 3 ──
    try {
      const imagenRes = await fetch(`${IMAGEN_ENDPOINT}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '3:4',
            safetyFilterLevel: 'block_some',
            personGeneration: 'allow_adult',
          },
        }),
      });

      if (imagenRes.ok) {
        const data = await safeJson(imagenRes);
        const prediction = data.predictions?.[0];
        if (prediction?.bytesBase64Encoded) {
          return res.status(200).json({
            success: true,
            imageUrl: `data:${prediction.mimeType || 'image/png'};base64,${prediction.bytesBase64Encoded}`,
            prompt,
            via: 'imagen3',
          });
        }
      } else {
        const errText = await imagenRes.text();
        errors.push(`Imagen3 ${imagenRes.status}: ${errText.substring(0, 150)}`);
      }
    } catch (e) {
      errors.push(`Imagen3 error: ${e.message}`);
    }

    // ── 2차: Gemini 이미지 모델 순차 시도 ──
    for (const model of GEMINI_IMAGE_MODELS) {
      try {
        console.log('[Persona Image] trying Gemini model:', model);
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseModalities: ['IMAGE'] },
            }),
          }
        );

        const geminiData = await safeJson(geminiRes);
        const inlineData = geminiData.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;

        if (inlineData?.data) {
          return res.status(200).json({
            success: true,
            imageUrl: `data:${inlineData.mimeType || 'image/png'};base64,${inlineData.data}`,
            prompt,
            via: model,
          });
        }

        // 모델이 텍스트만 반환한 경우 (이미지 거부)
        const textPart = geminiData.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
        errors.push(`${model}: 이미지 없음${textPart ? ` (${textPart.substring(0, 100)})` : ''}`);
      } catch (e) {
        errors.push(`${model} error: ${e.message}`);
      }
    }

    // 모든 시도 실패
    console.error('[Persona Image] All attempts failed:', errors);
    return res.status(500).json({
      error: `이미지 생성 실패 — ${errors[errors.length - 1] || '알 수 없는 오류'}`,
      attempts: errors,
    });
  } catch (e) {
    console.error('[Persona Image] Unexpected:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

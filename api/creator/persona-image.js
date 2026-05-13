// Gemini 이미지 생성으로 페르소나 캐릭터 이미지 생성
// 1차: Imagen 3 (고품질, 빌링 필요)
// 2차 fallback: gemini-3.1-flash-image-preview (AI Studio 키로 사용 가능)
// 결과는 base64 data URL로 반환 (세션 표시용, Redis 미저장)
// env: GOOGLE_API_KEY (Google AI Studio에서 발급)

const IMAGEN_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict';

const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

function buildImagePrompt(persona) {
  const parts = [
    'Korean female beauty creator, virtual influencer',
    'professional portrait photography, soft studio lighting, clean background',
  ];

  if (persona.hairStyle)    parts.push(persona.hairStyle);
  if (persona.signatureLook) parts.push(persona.signatureLook);
  if (persona.typicalOutfit) parts.push(persona.typicalOutfit);
  if (persona.skinType)     parts.push(`${persona.skinType} skin`);
  if (persona.accessories)  parts.push(persona.accessories);

  parts.push(
    'K-beauty aesthetic',
    'natural minimal makeup, glowing skin',
    'warm approachable expression, looking at camera',
    'high quality, photorealistic, sharp focus',
  );

  return parts.filter(Boolean).join(', ');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error: 'GOOGLE_API_KEY 없음',
      hint: 'Google AI Studio (aistudio.google.com)에서 API 키를 발급받아 Vercel 환경변수에 추가해주세요.',
    });
  }

  const { persona = {}, extraPrompt = '' } = req.body || {};
  const prompt = buildImagePrompt(persona) + (extraPrompt ? `, ${extraPrompt}` : '');

  try {
    // 1차: Imagen 3
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
      const data = await imagenRes.json();
      const prediction = data.predictions?.[0];
      if (prediction?.bytesBase64Encoded) {
        const mimeType = prediction.mimeType || 'image/png';
        return res.status(200).json({
          success: true,
          imageUrl: `data:${mimeType};base64,${prediction.bytesBase64Encoded}`,
          prompt,
          via: 'imagen3',
        });
      }
    }

    // 2차 fallback: gemini-3.1-flash-image-preview
    console.warn('[Persona Image] Imagen 3 failed, fallback to', GEMINI_IMAGE_MODEL);
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['Image'] },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    const inlineData = geminiData.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;

    if (!inlineData?.data) {
      return res.status(500).json({
        error: '이미지 생성 실패',
        raw: JSON.stringify(geminiData).substring(0, 300),
      });
    }

    return res.status(200).json({
      success: true,
      imageUrl: `data:${inlineData.mimeType || 'image/png'};base64,${inlineData.data}`,
      prompt,
      via: 'gemini-flash',
    });
  } catch (e) {
    console.error('[Persona Image]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

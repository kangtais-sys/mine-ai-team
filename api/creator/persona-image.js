// Gemini Imagen 3으로 페르소나 캐릭터 이미지 생성
// 결과는 base64 data URL로 반환 (세션 표시용, Redis 미저장)
// env: GOOGLE_API_KEY (Google AI Studio에서 발급)

const IMAGEN_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict';

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

  // 요청 body에서 페르소나 정보 받기
  const { persona = {}, extraPrompt = '' } = req.body || {};
  const prompt = buildImagePrompt(persona) + (extraPrompt ? `, ${extraPrompt}` : '');

  try {
    const response = await fetch(`${IMAGEN_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '3:4',          // 세로 포트레이트
          safetyFilterLevel: 'block_some',
          personGeneration: 'allow_adult',
        },
      }),
    });

    if (!response.ok) {
      // Imagen 3 실패 시 Gemini 2.0 Flash 이미지 생성으로 fallback
      console.warn('[Persona Image] Imagen 3 failed, trying Gemini Flash...');
      return await generateWithGeminiFlash(apiKey, prompt, res);
    }

    const data = await response.json();
    const prediction = data.predictions?.[0];
    if (!prediction?.bytesBase64Encoded) {
      return await generateWithGeminiFlash(apiKey, prompt, res);
    }

    const mimeType = prediction.mimeType || 'image/png';
    const dataUrl = `data:${mimeType};base64,${prediction.bytesBase64Encoded}`;

    return res.status(200).json({ success: true, imageUrl: dataUrl, prompt });
  } catch (e) {
    console.error('[Persona Image]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// Fallback: Gemini 2.0 Flash (이미지 생성 모드)
async function generateWithGeminiFlash(apiKey, prompt, res) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
      }
    );

    const data = await response.json();
    const inlineData = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;

    if (!inlineData?.data) {
      return res.status(500).json({
        error: 'Gemini 이미지 생성 실패 — GOOGLE_API_KEY를 확인해주세요.',
        raw: JSON.stringify(data).substring(0, 300),
      });
    }

    const dataUrl = `data:${inlineData.mimeType || 'image/png'};base64,${inlineData.data}`;
    return res.status(200).json({ success: true, imageUrl: dataUrl, prompt, via: 'gemini-flash' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// Gemini 이미지 생성으로 페르소나 캐릭터 이미지 생성
// 모드 A (텍스트): 1차 Imagen 3 → 2차 Gemini 멀티모달 모델 체인
// 모드 B (레퍼런스): referenceImages(base64) + instruction → Gemini 멀티모달
// 생성 성공 시 persona-images API로 자동 저장
// env: GOOGLE_API_KEY 또는 GEMINI_API_KEY

import { Redis } from '@upstash/redis';
import { randomUUID } from 'crypto';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const IMAGES_KEY = 'creator:persona:millimilli:images';
const MAX_IMAGES = 10;

async function saveImageToGallery(imageUrl, prompt, via, label) {
  try {
    const raw = await redis.get(IMAGES_KEY).catch(() => null);
    let images = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];

    const newImage = {
      id: randomUUID(),
      url: imageUrl,
      prompt,
      via,
      label: label || '',
      isPrimary: images.length === 0,
      savedAt: new Date().toISOString(),
    };

    images = [newImage, ...images].slice(0, MAX_IMAGES);
    await redis.set(IMAGES_KEY, images, { ex: 86400 * 90 });
    return newImage;
  } catch (e) {
    console.warn('[Persona Image] 갤러리 저장 실패 (무시):', e.message);
    return null;
  }
}

const IMAGEN_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict';

// 시도할 Gemini 이미지 모델 — 모델마다 responseModalities 케이스가 다름
const GEMINI_IMAGE_MODELS = [
  { id: 'gemini-2.0-flash-preview-image-generation', modalities: ['IMAGE'] },
  { id: 'gemini-3.1-flash-image-preview',            modalities: ['Image'] },
  { id: 'gemini-2.0-flash-exp',                      modalities: ['IMAGE'] },
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

// ── 레퍼런스 이미지 기반 Gemini 멀티모달 생성 ──
async function generateWithReferences(apiKey, referenceImages, instruction, label, errors) {
  // referenceImages: [{ mimeType, data, label }]  (data = base64 string)
  // 각 이미지 앞에 라벨 텍스트를 끼워서 Gemini가 역할을 명확히 인식하게 함
  const LABEL_KO = {
    '모델': 'Model face and overall appearance — match this person\'s facial features and look',
    '헤어': 'Hairstyle reference — replicate this exact hairstyle, color, and texture',
    '피부': 'Skin tone and texture reference — match this skin tone, complexion, and finish',
    '의상': 'Outfit and clothing reference — wear this style of clothing',
    '구도': 'Composition and pose reference — use this exact camera angle, framing, and pose',
  };

  const introPart = {
    text:
      'Generate a high-quality photorealistic portrait of a Korean female beauty creator, ' +
      'incorporating ALL of the following reference images. Each reference has a specific role — ' +
      'carefully apply each one. K-beauty aesthetic, soft studio lighting, sharp focus.\n\n' +
      (instruction ? `Additional instruction: ${instruction}\n\n` : '') +
      'References:',
  };

  // 이미지마다 역할 설명 텍스트 + 이미지 인라인 데이터 교대로 배열
  const interleavedParts = referenceImages.flatMap((img, i) => {
    const roleLabel = LABEL_KO[img.label] || `Reference ${i + 1}`;
    return [
      { text: `[${i + 1}/${referenceImages.length}] ${img.label || `Reference ${i + 1}`}: ${roleLabel}` },
      { inlineData: { mimeType: img.mimeType, data: img.data } },
    ];
  });

  const closingPart = {
    text: 'Now generate the portrait combining ALL the above references faithfully.',
  };

  const parts = [introPart, ...interleavedParts, closingPart];

  for (const model of GEMINI_IMAGE_MODELS) {
    try {
      console.log('[Persona Image] trying reference mode with model:', model.id);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseModalities: model.modalities },
          }),
        }
      );

      if (res.status === 429) {
        errors.push(`[ref] ${model.id}: 요청 한도 초과`);
        continue;
      }

      const data = await safeJson(res);
      const inlineData = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;

      if (inlineData?.data) {
        const imageUrl = `data:${inlineData.mimeType || 'image/png'};base64,${inlineData.data}`;
        const saved = await saveImageToGallery(imageUrl, instruction || 'reference-based', model.id, label);
        return { success: true, imageUrl, prompt: instruction, via: `ref:${model.id}`, savedImage: saved };
      }

      const textReply = data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
      errors.push(`[ref] ${model.id}: 이미지 없음${textReply ? ` (${textReply.substring(0, 80)})` : ''}`);
    } catch (e) {
      errors.push(`[ref] ${model.id} error: ${e.message}`);
    }
  }
  return null;
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

  const { persona = {}, extraPrompt = '', label = '', referenceImages, instruction } = req.body || {};

  const errors = [];

  try {
    // ══ 모드 B: 레퍼런스 이미지 기반 생성 ══
    if (referenceImages && referenceImages.length > 0) {
      // 각 이미지 base64 크기 체크 — 1장당 1MB(base64 기준) 초과 시 경고
      const totalBytes = referenceImages.reduce((sum, img) => sum + (img.data?.length || 0), 0);
      console.log('[Persona Image] reference mode:', referenceImages.length, 'images, total base64 bytes:', totalBytes);
      if (totalBytes > 4 * 1024 * 1024) {
        return res.status(413).json({ error: '레퍼런스 이미지 용량 초과 — 이미지를 더 작게 줄여서 다시 시도하세요' });
      }
      const result = await generateWithReferences(apiKey, referenceImages, instruction, label, errors);
      if (result) return res.status(200).json(result);
      // 레퍼런스 모드 전부 실패 → 에러 반환
      console.error('[Persona Image] Reference mode all failed:', errors);
      return res.status(500).json({
        error: `레퍼런스 기반 생성 실패 — ${errors[errors.length - 1] || '알 수 없는 오류'}`,
        attempts: errors,
      });
    }

    // ══ 모드 A: 텍스트 기반 생성 ══
    const prompt = buildImagePrompt(persona) + (extraPrompt ? `, ${extraPrompt}` : '');

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
          const imageUrl = `data:${prediction.mimeType || 'image/png'};base64,${prediction.bytesBase64Encoded}`;
          const saved = await saveImageToGallery(imageUrl, prompt, 'imagen3', label);
          return res.status(200).json({
            success: true,
            imageUrl,
            prompt,
            via: 'imagen3',
            savedImage: saved,
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
        console.log('[Persona Image] trying Gemini model:', model.id);
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseModalities: model.modalities },
            }),
          }
        );

        // 429 Rate limit 감지
        if (geminiRes.status === 429) {
          errors.push(`${model.id}: 요청 한도 초과 (잠시 후 다시 시도)`);
          continue;
        }

        const geminiData = await safeJson(geminiRes);
        const inlineData = geminiData.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;

        if (inlineData?.data) {
          const imageUrl = `data:${inlineData.mimeType || 'image/png'};base64,${inlineData.data}`;
          const saved = await saveImageToGallery(imageUrl, prompt, model.id, label);
          return res.status(200).json({
            success: true,
            imageUrl,
            prompt,
            via: model.id,
            savedImage: saved,
          });
        }

        // 모델이 텍스트만 반환한 경우 (이미지 거부)
        const textPart = geminiData.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
        errors.push(`${model.id}: 이미지 없음${textPart ? ` (${textPart.substring(0, 80)})` : ''}`);
      } catch (e) {
        errors.push(`${model.id} error: ${e.message}`);
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

// 페르소나 이미지 생성
// 모드 C (Flux Kontext): primaryImageUrl 있으면 → Higgsfield fnf API로 캐릭터 일관성 유지
// 모드 A (텍스트): Imagen3 → Gemini 폴백 (초기 캐릭터 생성)
// 모드 B (레퍼런스): referenceImages(base64) + instruction → Gemini (수동 레퍼런스)
// env: GOOGLE_API_KEY / GEMINI_API_KEY, HIGGSFIELD_CLI_TOKEN

import { Redis } from '@upstash/redis';
import { randomUUID } from 'crypto';

export const config = { maxDuration: 60 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const IMAGES_KEY = 'creator:persona:millimilli:images';
const MAX_IMAGES = 10;
const FNF_BASE = 'https://fnf.higgsfield.ai';

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

// ── 모드 C: Higgsfield Flux Kontext — 캐릭터 일관성 이미지 생성 ──
// primaryImageUrl: HTTP URL 또는 base64 data URL
// prompt: English prompt for the variation
async function generateWithFluxKontext(primaryImageUrl, prompt, label) {
  const token = (process.env.HIGGSFIELD_CLI_TOKEN || '').trim();
  if (!token) throw new Error('HIGGSFIELD_CLI_TOKEN 없음');

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // 1. 업로드 슬롯 생성 (presigned S3 URL 획득)
  const uploadRes = await fetch(`${FNF_BASE}/agents/uploads?type=image`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url: 'placeholder' }),
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Higgsfield upload slot 생성 실패 (${uploadRes.status}): ${err.substring(0, 200)}`);
  }

  const { id: mediaId, upload_url: uploadUrl } = await uploadRes.json();
  if (!mediaId || !uploadUrl) throw new Error('업로드 슬롯 응답 이상');

  // 2. 이미지 바이너리 가져오기 (base64 or HTTP)
  let imageBuffer;
  let mimeType = 'image/png';

  if (primaryImageUrl.startsWith('data:')) {
    // base64 data URL → buffer
    const match = primaryImageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('base64 형식 오류');
    mimeType = match[1];
    imageBuffer = Buffer.from(match[2], 'base64');
  } else {
    // HTTP URL → fetch binary
    const imgRes = await fetch(primaryImageUrl);
    if (!imgRes.ok) throw new Error(`이미지 다운로드 실패: ${imgRes.status}`);
    mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
    const arrayBuf = await imgRes.arrayBuffer();
    imageBuffer = Buffer.from(arrayBuf);
  }

  // 3. S3 presigned URL에 PUT
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: imageBuffer,
  });

  if (!putRes.ok && putRes.status !== 200) {
    const putErr = await putRes.text().catch(() => '');
    throw new Error(`S3 PUT 실패 (${putRes.status}): ${putErr.substring(0, 100)}`);
  }

  // 4. Flux Kontext 잡 생성
  const jobRes = await fetch(`${FNF_BASE}/agents/jobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      job_set_type: 'flux_kontext',
      params: {
        prompt,
        aspect_ratio: label?.includes('전신') ? '3:4' : '3:4',
        input_images: [{ id: mediaId, type: 'media_input' }],
        enhance_prompt: true,
        multi_ref: false,
      },
    }),
  });

  if (!jobRes.ok) {
    const jobErr = await jobRes.text();
    throw new Error(`Flux Kontext 잡 생성 실패 (${jobRes.status}): ${jobErr.substring(0, 200)}`);
  }

  const jobIds = await jobRes.json();
  const jobId = Array.isArray(jobIds) ? jobIds[0] : jobIds.id;
  if (!jobId) throw new Error('잡 ID 없음');

  console.log(`[Persona Image] Flux Kontext 잡 생성: ${jobId}`);

  // 5. 완료 폴링 (최대 55초, 3초 간격)
  const deadline = Date.now() + 55_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));

    const statusRes = await fetch(`${FNF_BASE}/agents/jobs/${jobId}`, { headers });
    if (!statusRes.ok) continue;

    const job = await statusRes.json();
    console.log(`[Persona Image] Flux Kontext 상태: ${job.status}`);

    if (job.status === 'completed' && job.result_url) {
      console.log(`[Persona Image] Flux Kontext 완료: ${job.result_url.substring(0, 60)}`);
      // HTTP URL로 갤러리에 저장
      const saved = await saveImageToGallery(job.result_url, prompt, 'flux_kontext', label);
      return { success: true, imageUrl: job.result_url, prompt, via: 'flux_kontext', savedImage: saved };
    }

    if (job.status === 'failed') {
      throw new Error('Flux Kontext 잡 실패');
    }
  }

  throw new Error('Flux Kontext 타임아웃 (55초 초과)');
}

const IMAGEN_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict';

const GEMINI_IMAGE_MODELS = [
  { id: 'gemini-2.0-flash-preview-image-generation', modalities: ['IMAGE'] },
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

async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`API ${res.status} 비JSON 응답: ${text.substring(0, 200)}`);
  }
}

// ── 레퍼런스 이미지 기반 Gemini 생성 ──
async function generateWithReferences(apiKey, referenceImages, instruction, label, errors) {
  const LABEL_KO = {
    '모델': 'Model face and overall appearance — match this person\'s facial features and look',
    '헤어': 'Hairstyle reference — replicate this exact hairstyle, color, and texture',
    '피부': 'Skin tone and texture reference — match this skin tone, complexion, and finish',
    '의상': 'Outfit and clothing reference — wear this style of clothing',
    '구도': 'Composition and pose reference — use this exact camera angle, framing, and pose',
    '배경': 'Background reference — use this background style, color, and atmosphere',
  };

  const introPart = {
    text:
      'Generate a high-quality photorealistic portrait of a Korean female beauty creator, ' +
      'incorporating ALL of the following reference images. Each reference has a specific role — ' +
      'carefully apply each one. K-beauty aesthetic, soft studio lighting, sharp focus.\n\n' +
      (instruction ? `Additional instruction: ${instruction}\n\n` : '') +
      'References:',
  };

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

  const {
    persona = {},
    extraPrompt = '',
    label = '',
    referenceImages,
    instruction,
    primaryImageUrl,    // 추가: 기존 대표 이미지 URL (HTTP or base64)
    anglePrompt,        // 추가: 영문 각도/씬 프롬프트 (UI에서 전달)
  } = req.body || {};

  const errors = [];

  // ══ 모드 C: Flux Kontext (기존 대표 이미지 기반 캐릭터 일관성 컷 생성) ══
  if (primaryImageUrl && process.env.HIGGSFIELD_CLI_TOKEN) {
    try {
      const fluxPrompt = anglePrompt
        || extraPrompt
        || 'Korean female beauty creator, same character, natural expression, photorealistic, high quality, keep the same facial features and hairstyle';

      console.log(`[Persona Image] Flux Kontext 모드: label=${label}, prompt=${fluxPrompt.substring(0, 80)}`);
      const result = await generateWithFluxKontext(primaryImageUrl, fluxPrompt, label);
      return res.status(200).json(result);
    } catch (e) {
      console.error('[Persona Image] Flux Kontext 실패, Gemini 폴백:', e.message);
      // Flux Kontext 실패 시 Gemini 모드 B로 폴백
      errors.push(`Flux Kontext: ${e.message}`);
    }
  }

  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

  // ══ 모드 B: Gemini 레퍼런스 이미지 기반 생성 ══
  if (referenceImages && referenceImages.length > 0) {
    if (!apiKey) {
      return res.status(400).json({ error: 'API 키 없음 (GOOGLE_API_KEY 또는 GEMINI_API_KEY 필요)' });
    }
    const totalBytes = referenceImages.reduce((sum, img) => sum + (img.data?.length || 0), 0);
    console.log('[Persona Image] reference mode:', referenceImages.length, 'images, total base64 bytes:', totalBytes);
    if (totalBytes > 4 * 1024 * 1024) {
      return res.status(413).json({ error: '레퍼런스 이미지 용량 초과 — 이미지를 더 작게 줄여서 다시 시도하세요' });
    }
    const result = await generateWithReferences(apiKey, referenceImages, instruction, label, errors);
    if (result) return res.status(200).json(result);
    console.error('[Persona Image] Reference mode all failed:', errors);
    return res.status(500).json({
      error: `레퍼런스 기반 생성 실패 — ${errors[errors.length - 1] || '알 수 없는 오류'}`,
      attempts: errors,
    });
  }

  // ══ 모드 A: Gemini 텍스트 기반 생성 ══
  if (!apiKey) {
    return res.status(400).json({
      error: 'API 키 없음 (GOOGLE_API_KEY 또는 GEMINI_API_KEY 필요)',
      hint: 'Google AI Studio (aistudio.google.com)에서 발급 후 Vercel 환경변수에 추가',
    });
  }

  try {
    const prompt = buildImagePrompt(persona) + (extraPrompt ? `, ${extraPrompt}` : '');

    // 1차: Imagen 3
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
          return res.status(200).json({ success: true, imageUrl, prompt, via: 'imagen3', savedImage: saved });
        }
      } else {
        const errText = await imagenRes.text();
        errors.push(`Imagen3 ${imagenRes.status}: ${errText.substring(0, 150)}`);
      }
    } catch (e) {
      errors.push(`Imagen3 error: ${e.message}`);
    }

    // 2차: Gemini 이미지 모델 순차 시도
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

        if (geminiRes.status === 429) {
          errors.push(`${model.id}: 요청 한도 초과 (잠시 후 다시 시도)`);
          continue;
        }

        const geminiData = await safeJson(geminiRes);
        const inlineData = geminiData.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;

        if (inlineData?.data) {
          const imageUrl = `data:${inlineData.mimeType || 'image/png'};base64,${inlineData.data}`;
          const saved = await saveImageToGallery(imageUrl, prompt, model.id, label);
          return res.status(200).json({ success: true, imageUrl, prompt, via: model.id, savedImage: saved });
        }

        const textPart = geminiData.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
        errors.push(`${model.id}: 이미지 없음${textPart ? ` (${textPart.substring(0, 80)})` : ''}`);
      } catch (e) {
        errors.push(`${model.id} error: ${e.message}`);
      }
    }

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

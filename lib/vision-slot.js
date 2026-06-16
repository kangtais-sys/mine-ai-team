// 슬롯 이미지 → 영문 디테일 묘사 (Claude Vision)
//
// 용도: nano-banana-2/edit 의 멀티 레퍼런스 한계를 우회하기 위해,
//      "얼굴 섞일 위험" 있는 슬롯(메이크업/조명)을 이미지 픽셀로 던지지 않고
//      텍스트 묘사로 변환해 prompt 에 박는다.
//
// 슬롯별 추출 포커스:
//   makeup   → 립 색·마감, 아이 메이크업, 브로우, 베이스 마감/광택. 얼굴 정체성·인종·이목구비 묘사 금지
//   lighting → 광원 방향·색온도·강도·그림자·전체 톤. 인물 묘사 금지
//   hair     → 길이/컷/가르마/앞머리/텍스처/컬러/스타일링. 얼굴·메이크업·의상 묘사 금지
//              헤어 슬롯은 옵션 — 변경할 때만 레퍼런스 넣고 Vision 텍스트로 추출.
//              빈 슬롯 = 캐논 헤어 유지 (generate-image.js 가 그 케이스 별도 처리).
//
// 결과는 호출 측에서 cache 권장. 매 장면 호출하면 비용 ↑ (Vision ~$0.001/회).
import Anthropic from '@anthropic-ai/sdk';

const SLOT_FOCUS = {
  makeup: {
    role: 'makeup look',
    extract:
      'Lip color and finish (matte/glossy/tint), eye makeup (shadow color, liner style, mascara emphasis), eyebrow shape and color, base finish (dewy/matte/glow), blush/contour if visible.',
    avoid:
      'Do NOT describe the person\'s face, identity, ethnicity, age, facial structure, skin tone, or any non-makeup features. The face is irrelevant — only the makeup applied to it.',
  },
  lighting: {
    role: 'lighting and color tone',
    extract:
      'Light source direction (front/side/back/overhead), light quality (hard/soft/diffused), color temperature (warm/cool/neutral, approx Kelvin if obvious), shadow placement, overall color cast/tone of the scene.',
    avoid:
      'Do NOT describe the subject, person, outfit, background details, or any subject matter. Only the lighting and color tone properties.',
  },
  hair: {
    role: 'hairstyle',
    extract:
      'Hair length (short/medium/long/etc.), cut and shape (bob, layered, blunt, etc.), parting (center/side/none), bangs or fringe (presence, length, shape), texture (straight/wavy/curly/coily), color (base color and highlights/balayage if any), styling (down, half-up, ponytail, updo, braid, etc.).',
    avoid:
      'Do NOT describe the face, identity, ethnicity, age, skin tone, makeup, outfit, accessories, or background. Only the hair itself.',
  },
};

let _client = null;
function getClient() {
  if (!_client) _client = new Anthropic();
  return _client;
}

/** 이미지 URL 을 fetch 해서 base64 + media_type 으로. */
async function fetchAsBase64(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`이미지 fetch 실패 ${res.status}`);
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const media_type = contentType.split(';')[0].trim();
  const buf = Buffer.from(await res.arrayBuffer());
  return { data: buf.toString('base64'), media_type };
}

/** 슬롯 이미지를 분석해 영문 한 줄 묘사 반환.
 *  - slotKey: 'makeup' | 'lighting'
 *  - imageUrl: 슬롯 이미지 URL (public)
 *  반환: 짧은 영문 묘사 (1~2문장). 실패 시 throw. */
export async function describeSlotImage(slotKey, imageUrl) {
  const focus = SLOT_FOCUS[slotKey];
  if (!focus) throw new Error(`vision-slot: unsupported slotKey ${slotKey}`);
  if (!imageUrl) throw new Error('vision-slot: imageUrl 필수');

  const { data, media_type } = await fetchAsBase64(imageUrl);

  const userText = `You are a visual reference extractor for a generative image pipeline.

Task: From this image, describe ONLY the ${focus.role} in 1-2 concise English sentences.

What to extract:
${focus.extract}

Critical constraints:
${focus.avoid}

Output: 1-2 sentences. No preamble, no bullet points, no labels. Just the description.`;

  const client = getClient();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type, data } },
          { type: 'text', text: userText },
        ],
      },
    ],
  });

  const text = response.content[0]?.text?.trim() || '';
  if (!text) throw new Error('vision-slot: Claude 응답 비어있음');
  return text;
}

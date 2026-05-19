# Creator V2 — Plan A: Backend APIs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 크리에이터 V2에 필요한 백엔드 API 전체 구축 — 다중 페르소나, fal.ai 이미지/영상, ElevenLabs 클로닝, BGM

**Architecture:** 기존 `api/creator/` 구조 유지하면서 신규 엔드포인트 추가. 모든 Redis 읽기에 try-catch 적용. fal.ai queue 방식으로 장시간 작업 처리.

**Tech Stack:** fal.ai (@fal-ai/client), ElevenLabs IVC, Udio API (udioapi.pro), Upstash Redis, Vercel Blob

---

## Task 1: 패키지 설치 및 환경변수 추가

**Files:**
- Modify: `package.json`
- Modify: `.env.local` (로컬)
- Vercel env: FAL_API_KEY, UDIO_API_KEY 추가

- [ ] **Step 1: fal.ai 클라이언트 설치**

```bash
cd /Users/yuminhye/mine-ai-team
npm install @fal-ai/client
```

Expected: `@fal-ai/client` 패키지가 `node_modules`에 설치됨

- [ ] **Step 2: Vercel 환경변수 추가 확인**

```bash
npx vercel env ls 2>&1 | grep -E "FAL|UDIO|ELEVENLABS"
```

`FAL_API_KEY`와 `ELEVENLABS_API_KEY`가 없으면:

```bash
npx vercel env add FAL_API_KEY
# 프롬프트에 fal.ai 대시보드 API Key 입력
npx vercel env add UDIO_API_KEY
# 프롬프트에 udioapi.pro API Key 입력
```

- [ ] **Step 3: 커밋**

```bash
git add package.json package-lock.json
git commit -m "deps: add @fal-ai/client"
```

---

## Task 2: 다중 페르소나 인덱스 API

**Files:**
- Create: `api/creator/personas.js` — 페르소나 ID 목록 관리 (최대 3개)

- [ ] **Step 1: `api/creator/personas.js` 작성**

```js
// GET  → 저장된 페르소나 ID 목록
// POST → 새 페르소나 ID 추가 (최대 3개)
// DELETE ?id=xxx → 페르소나 ID 및 관련 데이터 삭제

import { Redis } from '@upstash/redis';
import { randomUUID } from 'crypto';

const INDEX_KEY = 'creator:personas:index';
const MAX_PERSONAS = 3;

function getRedis() {
  return new Redis({
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export default async function handler(req, res) {
  const redis = getRedis();

  if (req.method === 'GET') {
    try {
      const ids = (await redis.get(INDEX_KEY)) ?? [];
      return res.status(200).json({ ids });
    } catch {
      return res.status(200).json({ ids: [] });
    }
  }

  if (req.method === 'POST') {
    try {
      const ids = (await redis.get(INDEX_KEY)) ?? [];
      if (ids.length >= MAX_PERSONAS) {
        return res.status(400).json({ error: `최대 ${MAX_PERSONAS}개까지 가능합니다` });
      }
      const newId = req.body?.id || randomUUID();
      const updated = [...ids, newId];
      await redis.set(INDEX_KEY, updated);
      return res.status(200).json({ id: newId, ids: updated });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 필수' });
    try {
      const ids = (await redis.get(INDEX_KEY)) ?? [];
      const updated = ids.filter(i => i !== id);
      await redis.set(INDEX_KEY, updated);
      // 관련 key 삭제
      await Promise.allSettled([
        redis.del(`creator:persona:${id}`),
        redis.del(`creator:persona:${id}:images`),
        redis.del(`creator:persona:${id}:lora`),
        redis.del(`creator:persona:${id}:voice`),
      ]);
      return res.status(200).json({ success: true, ids: updated });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
```

- [ ] **Step 2: 로컬 검증**

```bash
curl -s -X POST http://localhost:3000/api/creator/personas \
  -H "Content-Type: application/json" | python3 -m json.tool
```

Expected: `{ "id": "<uuid>", "ids": ["<uuid>"] }`

- [ ] **Step 3: 커밋**

```bash
git add api/creator/personas.js
git commit -m "feat: 다중 페르소나 인덱스 API"
```

---

## Task 3: persona.js — personaId 지원으로 수정

**Files:**
- Modify: `api/creator/persona.js`

- [ ] **Step 1: personaId 파라미터 지원 추가**

기존 파일에서 `REDIS_KEY` 상수를 동적으로 변경:

```js
// 기존: const REDIS_KEY = 'creator:persona:millimilli';
// 수정: req에서 personaId 추출

export default async function handler(req, res) {
  const redis = getRedis();
  // personaId: query(GET/DELETE) 또는 body(PATCH)
  const personaId = req.query?.personaId || req.body?.personaId || 'millimilli';
  const REDIS_KEY = `creator:persona:${personaId}`;

  if (req.method === 'GET') {
    try {
      const stored = await redis.get(REDIS_KEY);
      const persona = stored ?? { ...DEFAULT_PERSONA, id: personaId };
      return res.status(200).json({ persona });
    } catch {
      return res.status(200).json({ persona: { ...DEFAULT_PERSONA, id: personaId }, _fallback: true });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const existing = (await redis.get(REDIS_KEY)) ?? { ...DEFAULT_PERSONA, id: personaId };
      const updated = { ...existing, ...req.body, id: personaId };
      await redis.set(REDIS_KEY, updated, { ex: TTL });
      return res.status(200).json({ success: true, persona: updated });
    } catch {
      return res.status(200).json({ success: false, error: 'Redis unavailable', persona: { ...DEFAULT_PERSONA, id: personaId } });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
```

- [ ] **Step 2: persona-images.js도 동일하게 personaId 지원 추가**

`api/creator/persona-images.js` 상단 `const IMAGES_KEY` 라인을:

```js
// handler 내부로 이동
export default async function handler(req, res) {
  const personaId = req.query?.personaId || req.body?.personaId || 'millimilli';
  const IMAGES_KEY = `creator:persona:${personaId}:images`;
  // ... 나머지 동일
```

- [ ] **Step 3: 검증**

```bash
curl -s "http://localhost:3000/api/creator/persona?personaId=test-123" | python3 -m json.tool
```

Expected: `{ "persona": { "id": "test-123", "name": "밀리 (Milli)", ... } }`

- [ ] **Step 4: 커밋**

```bash
git add api/creator/persona.js api/creator/persona-images.js
git commit -m "feat: persona API에 personaId 다중 지원"
```

---

## Task 4: persona-lora.js — FLUX Portrait Trainer LoRA 훈련

**Files:**
- Create: `api/creator/persona-lora.js`

- [ ] **Step 1: `api/creator/persona-lora.js` 작성**

```js
// POST { personaId, imageUrls: string[] }
// → fal.ai FLUX Portrait Trainer 훈련 시작 → requestId 저장
// GET ?personaId=xxx → 훈련 상태 확인

import { Redis } from '@upstash/redis';

export const config = { maxDuration: 60 };

function getRedis() {
  return new Redis({
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

function falHeaders() {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY 미설정');
  return { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' };
}

export default async function handler(req, res) {
  const redis = getRedis();

  // GET — 훈련 상태 확인
  if (req.method === 'GET') {
    const { personaId } = req.query;
    if (!personaId) return res.status(400).json({ error: 'personaId 필수' });

    try {
      const loraData = await redis.get(`creator:persona:${personaId}:lora`).catch(() => null);
      if (!loraData) return res.status(200).json({ status: 'none' });

      // 훈련 완료된 경우
      if (loraData.status === 'ready') return res.status(200).json(loraData);

      // 훈련 중 — fal.ai에 상태 확인
      const statusRes = await fetch(
        `https://queue.fal.run/fal-ai/flux-lora-portrait-trainer/requests/${loraData.requestId}`,
        { headers: falHeaders() }
      );
      const statusData = await statusRes.json();

      if (statusData.status === 'COMPLETED') {
        const loraUrl = statusData.output?.diffusers_lora_file?.url;
        const updated = { status: 'ready', loraUrl, requestId: loraData.requestId, personaId };
        await redis.set(`creator:persona:${personaId}:lora`, updated, { ex: 86400 * 30 }).catch(() => {});
        return res.status(200).json(updated);
      }

      return res.status(200).json({ status: statusData.status === 'IN_QUEUE' ? 'queued' : 'training', requestId: loraData.requestId });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — 훈련 시작
  if (req.method === 'POST') {
    const { personaId, imageUrls, triggerWord } = req.body || {};
    if (!personaId || !imageUrls?.length) {
      return res.status(400).json({ error: 'personaId, imageUrls 필수' });
    }

    try {
      // fal.ai FLUX Portrait Trainer 비동기 제출
      const submitRes = await fetch('https://queue.fal.run/fal-ai/flux-lora-portrait-trainer', {
        method: 'POST',
        headers: falHeaders(),
        body: JSON.stringify({
          images_data_url: imageUrls[0], // zip URL 또는 단일 이미지
          trigger_word: triggerWord || 'PERSONA',
          learning_rate: 0.0002,
          steps: 1000,
          multiresolution_training: true,
        }),
      });

      if (!submitRes.ok) {
        const err = await submitRes.text();
        return res.status(500).json({ error: `fal.ai 제출 실패: ${err.substring(0, 200)}` });
      }

      const submitData = await submitRes.json();
      const requestId = submitData.request_id;

      // Redis에 상태 저장
      await redis.set(
        `creator:persona:${personaId}:lora`,
        { status: 'queued', requestId, personaId, startedAt: new Date().toISOString() },
        { ex: 86400 * 7 }
      ).catch(() => {});

      return res.status(200).json({ success: true, requestId, status: 'queued' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
```

- [ ] **Step 2: 커밋**

```bash
git add api/creator/persona-lora.js
git commit -m "feat: FLUX Portrait Trainer LoRA 훈련 API"
```

---

## Task 5: persona-imagegen.js — FLUX Ultra 각도별 이미지 생성

**Files:**
- Create: `api/creator/persona-imagegen.js`

- [ ] **Step 1: `api/creator/persona-imagegen.js` 작성**

```js
// POST { personaId, angle, extraPrompt }
// angle: 'front' | 'three-quarter' | 'closeup' | 'fullbody' | 'side'
// → fal.ai FLUX 1.1 Pro Ultra + LoRA → 이미지 URL 반환

import { Redis } from '@upstash/redis';

export const config = { maxDuration: 60 };

function getRedis() {
  return new Redis({
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

const ANGLE_PROMPTS = {
  front:         'front view, looking directly at camera, neutral expression, studio lighting',
  'three-quarter': 'three-quarter view, slight turn to the left, soft smile, cinematic lighting',
  closeup:       'extreme close-up face, skin texture visible, every pore and fine detail, macro photography',
  fullbody:      'full body shot, standing, hands at sides, white background, fashion photography',
  side:          'side profile view, looking left, soft bokeh background, portrait lighting',
};

function falHeaders() {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY 미설정');
  return { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { personaId, angle = 'front', extraPrompt = '', personaDesc = '' } = req.body || {};
  if (!personaId) return res.status(400).json({ error: 'personaId 필수' });

  const redis = getRedis();

  // LoRA 확인
  let loraUrl = null;
  try {
    const loraData = await redis.get(`creator:persona:${personaId}:lora`);
    if (loraData?.status === 'ready') loraUrl = loraData.loraUrl;
  } catch {}

  const anglePrompt = ANGLE_PROMPTS[angle] || ANGLE_PROMPTS.front;
  const basePrompt = [
    'PERSONA',
    'Korean woman, beauty content creator',
    personaDesc,
    anglePrompt,
    extraPrompt,
    'ultra photorealistic, hyperrealistic skin texture, pores visible, 8K, professional photography, natural lighting',
  ].filter(Boolean).join(', ');

  const body = {
    prompt: basePrompt,
    num_images: 1,
    image_size: 'portrait_4_3',
    output_format: 'jpeg',
    safety_tolerance: '2',
  };

  if (loraUrl) {
    body.loras = [{ path: loraUrl, scale: 0.9 }];
  }

  try {
    const genRes = await fetch('https://fal.run/fal-ai/flux-pro/v1.1-ultra', {
      method: 'POST',
      headers: falHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55000),
    });

    if (!genRes.ok) {
      const err = await genRes.text();
      return res.status(500).json({ error: `FLUX 생성 실패: ${err.substring(0, 200)}` });
    }

    const data = await genRes.json();
    const imageUrl = data?.images?.[0]?.url;
    if (!imageUrl) return res.status(500).json({ error: 'FLUX 이미지 URL 없음', raw: JSON.stringify(data).substring(0, 200) });

    return res.status(200).json({ success: true, imageUrl, angle, personaId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add api/creator/persona-imagegen.js
git commit -m "feat: FLUX 1.1 Ultra 각도별 페르소나 이미지 생성 API"
```

---

## Task 6: voice-clone.js — ElevenLabs IVC 목소리 클로닝

**Files:**
- Create: `api/creator/voice-clone.js`

- [ ] **Step 1: `api/creator/voice-clone.js` 작성**

```js
// POST multipart/form-data: personaId, name, audioFile
// → ElevenLabs IVC → voice_id를 Redis에 저장
// GET ?personaId=xxx → 저장된 voice_id 반환

import { Redis } from '@upstash/redis';

export const config = { maxDuration: 60 };

function getRedis() {
  return new Redis({
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export default async function handler(req, res) {
  const redis = getRedis();

  // GET — 저장된 voice_id 조회
  if (req.method === 'GET') {
    const { personaId } = req.query;
    if (!personaId) return res.status(400).json({ error: 'personaId 필수' });
    try {
      const voiceData = await redis.get(`creator:persona:${personaId}:voice`).catch(() => null);
      return res.status(200).json(voiceData || { voiceId: null });
    } catch {
      return res.status(200).json({ voiceId: null });
    }
  }

  // POST — 클로닝 실행
  if (req.method === 'POST') {
    const { personaId, name, audioBase64, mimeType = 'audio/mpeg' } = req.body || {};
    if (!personaId || !audioBase64) return res.status(400).json({ error: 'personaId, audioBase64 필수' });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ELEVENLABS_API_KEY 미설정' });

    try {
      // base64 → Buffer
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      const ext = mimeType.includes('mp3') || mimeType.includes('mpeg') ? 'mp3' : 'wav';

      // multipart form 구성 (native FormData)
      const formData = new FormData();
      formData.append('name', name || `Persona-${personaId.substring(0, 8)}`);
      formData.append('description', `AI 크리에이터 페르소나 — ${personaId}`);
      formData.append('files', new Blob([audioBuffer], { type: mimeType }), `voice-sample.${ext}`);
      formData.append('labels', JSON.stringify({ use_case: 'social_media', language: 'ko' }));

      const cloneRes = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: formData,
        signal: AbortSignal.timeout(55000),
      });

      if (!cloneRes.ok) {
        const err = await cloneRes.text();
        return res.status(500).json({ error: `ElevenLabs 클로닝 실패 ${cloneRes.status}: ${err.substring(0, 300)}` });
      }

      const data = await cloneRes.json();
      const voiceId = data?.voice_id;
      if (!voiceId) return res.status(500).json({ error: 'voice_id 없음', raw: JSON.stringify(data).substring(0, 200) });

      // Redis 저장
      await redis.set(
        `creator:persona:${personaId}:voice`,
        { voiceId, name: data.name, personaId, createdAt: new Date().toISOString() },
        { ex: 86400 * 365 }
      ).catch(() => {});

      return res.status(200).json({ success: true, voiceId, name: data.name });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
```

- [ ] **Step 2: 커밋**

```bash
git add api/creator/voice-clone.js
git commit -m "feat: ElevenLabs IVC 목소리 클로닝 API"
```

---

## Task 7: scene-video.js — Kling 3.0 장면 영상 생성

**Files:**
- Create: `api/creator/scene-video.js`

- [ ] **Step 1: `api/creator/scene-video.js` 작성**

```js
// POST { sceneId, personaImageUrl, visualPrompt, duration }
// → Kling 3.0 Pro image-to-video → requestId 반환 (비동기)
// GET ?requestId=xxx → 완료 시 videoUrl 반환

export const config = { maxDuration: 60 };

function falHeaders() {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY 미설정');
  return { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' };
}

// Kling 전용 영문 프롬프트 변환 (한국어 → 영어 포함)
function buildKlingPrompt(visualPrompt, dialogue) {
  // Kling은 영문 프롬프트가 더 잘 먹힘 — 기본 영문 구조 추가
  return [
    visualPrompt,
    dialogue ? `speaking dialogue naturally` : '',
    'photorealistic, cinematic quality, 9:16 vertical, smooth motion, professional lighting',
  ].filter(Boolean).join(', ');
}

export default async function handler(req, res) {
  // GET — 상태 확인
  if (req.method === 'GET') {
    const { requestId } = req.query;
    if (!requestId) return res.status(400).json({ error: 'requestId 필수' });

    try {
      const statusRes = await fetch(
        `https://queue.fal.run/fal-ai/kling-video/v2.1/pro/image-to-video/requests/${requestId}`,
        { headers: falHeaders() }
      );
      const data = await statusRes.json();

      if (data.status === 'COMPLETED') {
        const videoUrl = data.output?.video?.url;
        return res.status(200).json({ status: 'completed', videoUrl });
      }
      if (data.status === 'FAILED') {
        return res.status(200).json({ status: 'failed', error: data.error });
      }
      return res.status(200).json({ status: data.status === 'IN_QUEUE' ? 'queued' : 'processing' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — 영상 생성 시작
  if (req.method === 'POST') {
    const {
      personaImageUrl,
      visualPrompt,
      dialogue = '',
      duration = 5,   // 5 or 10
    } = req.body || {};

    if (!personaImageUrl || !visualPrompt) {
      return res.status(400).json({ error: 'personaImageUrl, visualPrompt 필수' });
    }

    const prompt = buildKlingPrompt(visualPrompt, dialogue);

    try {
      const submitRes = await fetch(
        'https://queue.fal.run/fal-ai/kling-video/v2.1/pro/image-to-video',
        {
          method: 'POST',
          headers: falHeaders(),
          body: JSON.stringify({
            image_url: personaImageUrl,
            prompt,
            duration: String(duration),
            aspect_ratio: '9:16',
          }),
          signal: AbortSignal.timeout(55000),
        }
      );

      if (!submitRes.ok) {
        const err = await submitRes.text();
        return res.status(500).json({ error: `Kling 제출 실패 ${submitRes.status}: ${err.substring(0, 300)}` });
      }

      const data = await submitRes.json();
      const requestId = data?.request_id;
      if (!requestId) return res.status(500).json({ error: 'requestId 없음', raw: JSON.stringify(data).substring(0, 200) });

      return res.status(200).json({ success: true, requestId, status: 'queued' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
```

- [ ] **Step 2: 커밋**

```bash
git add api/creator/scene-video.js
git commit -m "feat: Kling 3.0 장면별 영상 생성 API"
```

---

## Task 8: bgm.js — Udio API 배경음악 생성

**Files:**
- Create: `api/creator/bgm.js`

- [ ] **Step 1: `api/creator/bgm.js` 작성**

```js
// POST { topic, language, durationSec }
// → Udio API → BGM MP3 URL 반환

export const config = { maxDuration: 60 };

const BGM_PROMPTS = {
  beauty: 'Korean beauty tutorial background music, soft upbeat electronic, modern pop, no vocals, 120 BPM',
  ingredient: 'science documentary background, subtle electronic ambient, minimal, professional',
  behind: 'behind the scenes casual vibe, light acoustic guitar, warm, friendly',
  trend: 'trendy K-pop inspired instrumental, energetic, modern, youthful',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { topic = 'beauty', durationSec = 30 } = req.body || {};
  const apiKey = process.env.UDIO_API_KEY;

  // API 키 없으면 fallback URL 반환 (무료 royalty-free 샘플)
  if (!apiKey) {
    return res.status(200).json({
      success: true,
      audioUrl: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3',
      _fallback: true,
    });
  }

  const prompt = BGM_PROMPTS[topic] || BGM_PROMPTS.beauty;

  try {
    const genRes = await fetch('https://udioapi.pro/api/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, duration: durationSec }),
      signal: AbortSignal.timeout(55000),
    });

    if (!genRes.ok) {
      const err = await genRes.text();
      // Udio 실패 시 fallback
      console.warn(`[BGM] Udio 실패 ${genRes.status}: ${err.substring(0, 100)}`);
      return res.status(200).json({ success: true, audioUrl: null, _fallback: true });
    }

    const data = await genRes.json();
    const audioUrl = data?.audio_url || data?.url;
    return res.status(200).json({ success: true, audioUrl });
  } catch (e) {
    console.warn('[BGM] 오류:', e.message);
    return res.status(200).json({ success: true, audioUrl: null, _fallback: true });
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add api/creator/bgm.js
git commit -m "feat: Udio BGM 생성 API (fallback 포함)"
```

---

## Task 9: generate.js — 스토리보드 카드 형식 + 언어 지원

**Files:**
- Modify: `api/creator/generate.js`

- [ ] **Step 1: 스토리보드 카드 출력 형식으로 수정**

`handler` 함수 내 Claude 프롬프트 부분을 찾아 교체. Claude에게 장면 카드 배열을 반환하도록 변경:

```js
// generate.js handler 내 Claude 호출 부분 교체
const { topic, language = 'ko', personaId, contentImages = [], notes = '' } = req.body || {};

const langInstruction = language === 'en'
  ? 'Write all dialogue and captions in English.'
  : '모든 대사와 캡션은 한국어로 작성해.';

const systemPrompt = `당신은 K뷰티 숏츠 콘텐츠 디렉터입니다. ${langInstruction}`;

const userPrompt = `
주제: ${topic}
${notes ? `추가 지시: ${notes}` : ''}
${trendContext ? `트렌드 컨텍스트: ${trendContext}` : ''}

다음 JSON 형식으로 5개 장면 카드를 만들어주세요:
{
  "scenes": [
    {
      "order": 1,
      "startSec": 0,
      "endSec": 5,
      "visualPrompt": "카메라 각도, 모델 동작, 조명, 배경을 영어로 상세히 기술 (예: front view, walking toward camera, warm studio lighting from left, white lab coat, laboratory background)",
      "dialogue": "${language === 'en' ? 'dialogue in English' : '한국어 대사'}",
      "cameraAngle": "front|three-quarter|closeup|fullbody|side 중 하나"
    }
  ],
  "caption": "SNS 캡션 (${language === 'en' ? '영어' : '한국어'})",
  "hashtags": ["태그1", "태그2"],
  "title": "영상 제목"
}

visualPrompt는 반드시 영문으로 작성 (Kling AI에 직접 전달됨).
총 영상 길이는 25~30초.
`;
```

그리고 응답 파싱 후 `scenes` 배열을 포함해서 반환:

```js
// 응답에서 JSON 파싱
let parsed;
try {
  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
} catch {
  parsed = {};
}

return res.status(200).json({
  success: true,
  scenes: parsed.scenes || [],
  caption: parsed.caption || '',
  hashtags: parsed.hashtags || [],
  title: parsed.title || topic,
  language,
});
```

- [ ] **Step 2: 검증**

```bash
curl -s -X POST http://localhost:3000/api/creator/generate \
  -H "Content-Type: application/json" \
  -d '{"topic":"500달톤 성분 설명","language":"ko"}' | python3 -m json.tool | head -40
```

Expected: `{ "scenes": [ { "order": 1, "startSec": 0, "visualPrompt": "front view...", ... } ] }`

- [ ] **Step 3: 커밋**

```bash
git add api/creator/generate.js
git commit -m "feat: generate API 스토리보드 카드 형식 + 한/영 지원"
```

---

## Task 10: 전체 배포 및 백엔드 검증

- [ ] **Step 1: 배포**

```bash
git push origin main
```

- [ ] **Step 2: 배포 완료 확인 후 API 검증**

```bash
# personas 인덱스
curl -s https://mine-ai-team.vercel.app/api/creator/personas | python3 -m json.tool

# persona 조회 (personaId 파라미터)
curl -s "https://mine-ai-team.vercel.app/api/creator/persona?personaId=millimilli" | python3 -m json.tool

# scene-video (FAL_API_KEY 있어야 동작)
curl -s -X POST https://mine-ai-team.vercel.app/api/creator/scene-video \
  -H "Content-Type: application/json" \
  -d '{"personaImageUrl":"https://picsum.photos/400/600","visualPrompt":"front view, standing, studio lighting","duration":5}' \
  | python3 -m json.tool
```

- [ ] **Step 3: Vercel env에 FAL_API_KEY 추가 (미설정 시)**

```bash
npx vercel env add FAL_API_KEY production
npx vercel env add FAL_API_KEY preview
npx vercel env add FAL_API_KEY development
# 재배포 트리거
git commit --allow-empty -m "chore: trigger redeploy after env vars"
git push origin main
```

---

**Plan A 완료.** 다음: Plan B (페르소나 UI) 작성 후 구현.

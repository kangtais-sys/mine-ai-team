// 숏츠 풀 자동화 cron (2패스 비동기). 릴스 슬롯 = 화·목(주 2일), 오늘~D+1.
//  Pass2(먼저): status 'generating' + kling job → 폴링 → 완료 footage → overlay-short(동그라미+자막) → review
//  Pass1: status 'draft' shorts → refUrl 있으면 video-analyze(썸네일) 컨셉, 없으면 shorts-format-library 폴백(로테이션)
//         → generate-image-ref(시작이미지) → scene-video(kling-v2-1-master image2video) 잡 시작 → generating 저장
//  검증 부품 전부 재사용: analyzeMedia / soul text2image / kling(/v1/image2video/kling) / overlayShortCore.
//  컴플라이언스: AI연출·임상 입증 범위·KR 수치만·1+1 24,900. 음악 원곡 금지(원음). KPI: 궁금증 갭 훅 + 대세감.
// 인증: Bearer CRON_SECRET. ?dry=1 = 대상만. ?only=<id> = 그 드래프트만.
import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';
import { getSupabase } from '../../lib/supabase.js';
import { analyzeShortFrames } from '../video-analyze.js';
import { overlayShortCore } from '../creator/overlay-short.js';

const anthropic = new Anthropic();
// 릴스 발행 캡션·해시태그 자동 생성(KR) — 보드에 리뷰레디로 도착(MINE이 매번 안 써도 됨). KPI: 훅+댓글가르기+저장/공유 유도, 제품 은근.
async function genReelCaption(fmt, hook, region = 'kr') {
  const us = region === 'us';
  try {
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 500,
      system: us
        ? 'Caption writer for MILLIMILLI 500 Dalton protein mist reels. English (US market). KPI = comments/saves/shares (no salesy tone). First line = curiosity-gap hook + info value + a comment-splitting question + save/share nudge. Mention product subtly once. Claims only within 24h hydration / barrier / texture range. Disclose AI-generated. No ad copy. Do NOT mix KR prices/numbers.'
        : 'MILLIMILLI(밀리밀리) 500달톤 단백질 미스트 릴스 캡션 작가. 한국어. KPI=댓글·저장·공유(판매 톤 금지). 궁금증 갭 훅 첫 줄 + 정보가치 + 댓글 가르는 질문 + 저장/공유 유도. 제품 은근 1곳. 클레임은 24h보습·장벽·결정돈 범위 내. AI 연출 명시. 광고 문구 금지.',
      messages: [{ role: 'user', content: us
        ? `Reel format: ${fmt.key}. Hook: ${hook || fmt.captionsEn?.[0]?.text || 'mist tip'}.\nReturn pure JSON only: {"caption":"IG/TikTok caption (with emojis, <200 chars, first line hook + comment question + save/share)","hashtags":"#millimilli + 10-15 relevant tags, space-separated"}`
        : `릴스 포맷: ${fmt.key}. 훅: ${hook || (fmt.captions?.[0]?.text) || '미스트 꿀팁'}.\n순수 JSON만 반환: {"caption":"인스타/틱톡 캡션(이모지 포함 200자내, 첫줄 후킹+댓글질문+저장/공유)","hashtags":"#밀리밀리 외 관련 10-15개 공백구분"}` }],
    });
    const m = (r.content[0]?.text || '').match(/\{[\s\S]*\}/);
    if (!m) return { caption: '', hashtags: '' };
    const p = JSON.parse(m[0]);
    return { caption: p.caption || '', hashtags: p.hashtags || '' };
  } catch { return { caption: '', hashtags: '' }; }
}

export const config = { maxDuration: 300 };

const redis = new Redis({ url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL, token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN });
const HF = 'https://platform.higgsfield.ai';
const hfHeaders = () => {
  const key = (process.env.HIGGSFIELD_API_KEY || '').replace(/^["']|["']$/g, '').trim();
  if (!key) throw new Error('HIGGSFIELD_API_KEY 없음');
  return { 'hf-api-key': key, 'Content-Type': 'application/json', 'Accept': 'application/json', 'Origin': 'https://cloud.higgsfield.ai', 'Referer': 'https://cloud.higgsfield.ai/' };
};
// v2 자격증명(seedance 등 제품충실 모델용). Authorization: Key KEY_ID:KEY_SECRET (docs.higgsfield.ai).
const HF_KEY_ID = (process.env.HF_KEY_ID || '').replace(/^["']|["']$/g, '').trim();
const HF_KEY_SECRET = (process.env.HF_KEY_SECRET || '').replace(/^["']|["']$/g, '').trim();
const hasV2 = () => !!(HF_KEY_ID && HF_KEY_SECRET);
const hfV2Headers = () => ({ 'Authorization': `Key ${HF_KEY_ID}:${HF_KEY_SECRET}`, 'Content-Type': 'application/json', 'Accept': 'application/json' });
// 히어로 단백질 미스트 진짜 제품컷(product-assets.md 4a56fcd8). ⚠️ 만료 가능 → 만료 시 재업로드/Blob 미러.
const HERO_MIST_URL = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38PAdEfRanROtVrNU82Klb8ZOSl/4a56fcd8-478d-4860-b722-03934e6eaf3f.png';
// 릴스 슬롯 시더 대상 채널(화·목). KR=한국어 자막/캡션 · US=영문(captionsEn + EN 캡션).
const envTrim = (k, fb = '') => String(process.env[k] ?? fb).replace(/\\[rn]/g, '').replace(/^["'\s]+|["'\s]+$/g, '');
const PROFILE = {
  kr: envTrim('ZERNIO_MILLIMILLI_PROFILE_ID', '69d08cc1986d57bb8f733102'),
  us: envTrim('ZERNIO_MILLIMILLI_US_PROFILE_ID', '69fbfcd01fc1fdb66f249aa8'),
};
const REEL_SEED_CHANNELS = [
  { key: 'kr_ig', region: 'kr', platform: 'instagram' },
  { key: 'kr_tt', region: 'kr', platform: 'tiktok' },
  { key: 'us_ig', region: 'us', platform: 'instagram' },
  { key: 'us_tt', region: 'us', platform: 'tiktok' },
];
// ⚠️ 2026-06-15: 릴스 일시 중단 — 품질 재설계(Cowork)로 자동 시드/생성 OFF. 재개 시 [2,4](화·목) 복원.
const reelDay = (ds) => false; // eslint-disable-line no-unused-vars
const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const dateNDaysAhead = (n) => new Date(Date.now() + 9 * 3600000 + n * 86400000).toISOString().slice(0, 10);
const isShorts = (d) => d.slotType === 'shorts' || ['reel', 'shorts'].includes(d.format);
function ytId(url) { const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:shorts\/|watch\?v=|embed\/|live\/|v\/))([A-Za-z0-9_-]{11})/); return m ? m[1] : null; }
// 스토리보드 프레임(시작1·중간2·끝3) + hqdefault → 씬 다중분석용
function ytFrames(url) { const id = ytId(url); return id ? ['1', '2', '3', 'hqdefault'].map(f => `https://img.youtube.com/vi/${id}/${f}.jpg`) : []; }

// shorts-format-library.md 바이럴 포맷 라이브러리(로테이션). 컴플라이언스·KPI 내장.
//   ⚠️ #6 실후기는 실제 캡처 필요(가짜 후기 금지) → 자동 로테이션 제외, Cowork 실캡처 경로로 별도.
//   엔드카드(라벨 정확)는 전 포맷 공통 표준 마지막 비트 → endcard/endcardEn.
const DISC_KR = { text: 'AI 연출 · 임상 입증 범위 내', top: 1835, size: 26, color: '#D6D6D6' };
const DISC_EN = { text: 'AI-generated · within clinical claims', top: 1835, size: 24, color: '#D6D6D6' };
const EC_KR = { text: '500 DALTON 단백질 미스트', sub: '프로필 링크 · 1+1 24,900' };
const EC_EN = { text: '500 Dalton Protein Mist', sub: 'link in bio · 1+1' };
const FORMATS = [
  { // #1 반전 토킹 — 궁금증 갭(최강)
    key: 'talking',
    imagePrompt: 'Ultra realistic vertical 9:16 UGC selfie, fresh modern Korean woman talking to camera in a cozy bright room, holding a frosted milky-white milli² protein mist loosely in one hand (NOT raised to camera), natural glass skin, authentic phone-camera feel. No text.',
    klingPrompt: 'she talks to camera with a friendly expressive face as if revealing a surprising tip, then lightly spritzes a fine cool mist over her face at the end, dewy glow. curiosity-gap reveal pacing.',
    productRefUrl: HERO_MIST_URL, circle_xy: null,
    captions: [
      { text: '미스트 뿌릴수록 더 당겨요?', top: 150, size: 56 },
      { text: '순서를 거꾸로 쓴 거예요', top: 235, size: 50, color: '#FFE9A8' }, DISC_KR,
    ],
    captionsEn: [
      { text: 'Mist making skin drier?', top: 150, size: 56 },
      { text: "You're using it backwards", top: 235, size: 48, color: '#FFE9A8' }, DISC_EN,
    ],
    endcard: { ...EC_KR, sub: '댓글: 넌 세수 후 몇 초에 뿌려?' }, endcardEn: { ...EC_EN, sub: 'comment: when do you mist?' },
  },
  { // #2 팔자/속건조 Before·After — 만족 변신 + 시그니처 동그라미(오버레이)
    key: 'palja',
    imagePrompt: 'Ultra realistic vertical 9:16 UGC beauty close-up, Korean woman cheek and smile-line area, a frosted milky-white milli² protein mist loosely in hand, soft warm natural light, glass-skin dewy look, authentic phone-camera feel. No text.',
    klingPrompt: 'she spritzes a fine cool mist on the smile-line area, the skin looks more hydrated, plumper and softer (moisture, not structural change), satisfying dewy glass-skin glow, gentle ASMR. curiosity-gap reveal.',
    productRefUrl: HERO_MIST_URL, circle_xy: { x: 560, y: 880, w: 380, h: 320 },
    captions: [
      { text: '팔자, 주름인 줄 알았죠?', top: 150, size: 60 },
      { text: "사실 '건조'였어요", top: 240, size: 50, color: '#FFE9A8' }, DISC_KR,
    ],
    captionsEn: [
      { text: 'Smile lines? Think again.', top: 150, size: 58 },
      { text: 'It was just dryness 💧', top: 240, size: 48, color: '#FFE9A8' }, DISC_EN,
    ],
    endcard: { ...EC_KR, sub: '저장해두고 팔자 건조할 때' }, endcardEn: { ...EC_EN, sub: 'save for dry days' },
  },
  { // #3 Split 동시대비 — 3초 즉시 대비
    key: 'split',
    imagePrompt: 'Ultra realistic vertical 9:16 split-screen UGC skincare, left side dull dry cakey matte skin closeup, right side dewy glass-skin glow with a frosted milky-white milli² protein mist, bright medical-clean light. No text.',
    klingPrompt: 'left dull matte dry skin, right side a milli² mist spray and the skin blooms into dewy glass-skin water-glow, smooth satisfying before/after, ASMR. curiosity-gap + momentum.',
    productRefUrl: HERO_MIST_URL, circle_xy: null,
    captions: [
      { text: '왼쪽 나, 오른쪽 나', top: 150, size: 58 },
      { text: '차이는 미스트 한 번', top: 235, size: 50, color: '#FFE9A8' }, DISC_KR,
    ],
    captionsEn: [
      { text: 'Same face.', top: 150, size: 58 },
      { text: 'One side got the mist', top: 235, size: 50, color: '#FFE9A8' }, DISC_EN,
    ],
    endcard: { ...EC_KR, sub: '댓글: 세수 후 몇 초에 뿌려?' }, endcardEn: { ...EC_EN, sub: 'comment: when do you mist?' },
  },
  { // #4 ASMR 30초 결과(매크로) — retention + 만족
    key: 'asmr',
    imagePrompt: 'Extreme macro vertical 9:16 of fresh dewy skin texture and fine mist droplets, no face no person, soft natural light, photoreal, glass-skin glow. No text.',
    klingPrompt: 'fine cool mist particles settle on skin and absorb into a dewy glass-skin glow, satisfying slow macro ASMR, result-first reveal.',
    productRefUrl: HERO_MIST_URL, circle_xy: null,
    captions: [
      { text: '30초 만에 물광, 실화?', top: 150, size: 58 },
      { text: '입자가 흡수되는 순간 🫧', top: 235, size: 48, color: '#FFE9A8' }, DISC_KR,
    ],
    captionsEn: [
      { text: 'Glass skin in 30s — real?', top: 150, size: 54 },
      { text: 'watch it absorb 🫧', top: 235, size: 48, color: '#FFE9A8' }, DISC_EN,
    ],
    endcard: { ...EC_KR, sub: '저장 · 30초 물광 루틴' }, endcardEn: { ...EC_EN, sub: 'save · 30s glow' },
  },
  { // #5 꿀팁 N(저장각) — 저장(최강)
    key: 'tips',
    imagePrompt: 'Ultra realistic vertical 9:16 UGC, Korean woman doing a quick skincare routine in a bright bathroom, a frosted milky-white milli² protein mist among the items, clean modern, authentic phone-camera feel. No text.',
    klingPrompt: 'quick snappy cuts of three skincare steps, the last step a milli² mist spritz sealing a dewy glow, energetic save-worthy pacing.',
    productRefUrl: HERO_MIST_URL, circle_xy: null,
    captions: [
      { text: '물광 24시간 가는 3가지', top: 150, size: 56 },
      { text: '마지막이 진짜 핵심', top: 235, size: 50, color: '#FFE9A8' }, DISC_KR,
    ],
    captionsEn: [
      { text: '3 ways to lock in glow', top: 150, size: 54 },
      { text: '#3 is the one', top: 235, size: 50, color: '#FFE9A8' }, DISC_EN,
    ],
    endcard: { ...EC_KR, sub: '저장 필수 · 물광 24h' }, endcardEn: { ...EC_EN, sub: 'save this · 24h glow' },
  },
  { // #7 POV 상황극 — 공유(최강)
    key: 'pov',
    imagePrompt: 'Ultra realistic vertical 9:16 POV UGC, a young Korean woman with tired dehydrated skin after a long day in an air-conditioned office, a frosted milky-white milli² protein mist on the desk, relatable cozy. No text.',
    klingPrompt: 'POV: skin looks tired and dry after hours in AC, she spritzes a milli² mist and the skin resets to a dewy fresh glow, relatable transformation.',
    productRefUrl: HERO_MIST_URL, circle_xy: null,
    captions: [
      { text: '에어컨방 6시간 버틴', top: 150, size: 56 },
      { text: '내 피부 POV', top: 235, size: 52, color: '#FFE9A8' }, DISC_KR,
    ],
    captionsEn: [
      { text: 'POV: 6 hours in AC air', top: 150, size: 54 },
      { text: 'my skin be like', top: 235, size: 50, color: '#FFE9A8' }, DISC_EN,
    ],
    endcard: { ...EC_KR, sub: '공유 · 에어컨방 동료 태그' }, endcardEn: { ...EC_EN, sub: 'tag your AC-office friend' },
  },
  { // #8 트렌드 편승 — 대세감 + 알고리즘 (트렌드는 분기 갱신)
    key: 'trend',
    imagePrompt: 'Ultra realistic vertical 9:16 trendy UGC skincare transition, modern Korean woman, a frosted milky-white milli² protein mist, dynamic on-trend look. No text.',
    klingPrompt: 'a trendy quick transition: dull skin flips to glass-skin glow on a milli² mist spritz, momentum, on-trend pacing.',
    productRefUrl: HERO_MIST_URL, circle_xy: null,
    captions: [
      { text: '요즘 다들 한다는', top: 150, size: 56 },
      { text: '미스트 물광 전환 ✨', top: 235, size: 50, color: '#FFE9A8' }, DISC_KR,
    ],
    captionsEn: [
      { text: 'everyone’s doing the', top: 150, size: 54 },
      { text: 'mist glow transition ✨', top: 235, size: 50, color: '#FFE9A8' }, DISC_EN,
    ],
    endcard: { ...EC_KR, sub: '댓글로 알려줘' }, endcardEn: { ...EC_EN, sub: 'tell me in comments' },
  },
];

// ── Higgsfield: soul text2image(9:16) → 시작 이미지 URL (동기 폴링) ──
async function genStartImage(prompt) {
  const sub = await fetch(`${HF}/v1/text2image/soul`, { method: 'POST', headers: hfHeaders(), body: JSON.stringify({ params: { prompt, width_and_height: '1152x2048' } }) });
  if (!sub.ok) throw new Error(`이미지 제출 ${sub.status}: ${(await sub.text()).slice(0, 150)}`);
  const id = (await sub.json()).id;
  const deadline = Date.now() + 110000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const r = await fetch(`${HF}/v1/job-sets/${id}`, { headers: hfHeaders() });
    if (!r.ok) continue;
    const d = await r.json(); const job = d.jobs?.[0]; const st = job?.status || d.status;
    if (st === 'completed') { const rr = job?.results || {}; const u = rr.raw?.url || rr.min?.url || rr.image?.url || rr.url; if (u) return u; throw new Error('이미지 완료지만 URL 없음'); }
    if (['failed', 'nsfw', 'canceled'].includes(st)) throw new Error(`이미지 ${st}`);
  }
  throw new Error('이미지 생성 타임아웃');
}

// ── Higgsfield: kling image2video 잡 시작 → jobSetId ──
async function startKling(imageUrl, prompt) {
  const body = { params: { prompt: `${prompt} photorealistic 9:16 vertical, smooth motion, no warping, shot on iPhone handheld subtle shake, royalty-free/original audio only`, input_image: { type: 'image_url', image_url: imageUrl }, model: 'kling-v2-1-master', duration: 5 } };
  const r = await fetch(`${HF}/v1/image2video/kling`, { method: 'POST', headers: hfHeaders(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`kling 제출 ${r.status}: ${(await r.text()).slice(0, 150)}`);
  const d = await r.json();
  const id = d.id || d.request_id || d.jobs?.[0]?.id;
  if (!id) throw new Error(`kling jobSetId 없음: ${JSON.stringify(d).slice(0, 120)}`);
  return id;
}

// ── kling 상태 1회 확인 (Pass2, 비차단) ──
async function pollKling(jobSetId) {
  const r = await fetch(`${HF}/v1/job-sets/${jobSetId}`, { headers: hfHeaders() });
  if (!r.ok) return { status: 'processing' };
  const d = await r.json(); const job = d.jobs?.[0]; const st = job?.status || d.status;
  if (st === 'completed') return { status: 'completed', videoUrl: job?.results?.raw?.url || job?.results?.video?.url || job?.results?.min?.url || job?.results?.url || d.video?.url || null };
  if (['failed', 'nsfw', 'canceled'].includes(st)) return { status: 'failed', error: job?.error || st };
  return { status: 'processing' };
}

// ── Higgsfield v2: seedance image2video(진짜 제품 레퍼 유지) → request_id ──
//  진짜 제품 이미지를 image_url 로 넣고, 프롬프트로 인물이 그 제품을 쓰는 9:16 사용장면 생성 → 라벨 충실.
const SEEDANCE_URL = 'https://platform.higgsfield.ai/bytedance/seedance/v1/pro/image-to-video';
async function startSeedance(imageUrl, prompt) {
  const body = { image_url: imageUrl, prompt, duration: 5, aspect_ratio: '9:16' };
  const r = await fetch(SEEDANCE_URL, { method: 'POST', headers: hfV2Headers(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`seedance 제출 ${r.status}: ${(await r.text()).slice(0, 150)}`);
  const d = await r.json();
  const id = d.request_id || d.id;
  if (!id) throw new Error(`seedance request_id 없음: ${JSON.stringify(d).slice(0, 120)}`);
  return id;
}
// ── seedance 상태 1회 확인 (Pass2, 비차단). /requests/{id}/status ──
async function pollSeedance(requestId) {
  const r = await fetch(`https://platform.higgsfield.ai/requests/${requestId}/status`, { headers: hfV2Headers() });
  if (!r.ok) return { status: 'processing' };
  const d = await r.json(); const st = d.status;
  if (st === 'completed') return { status: 'completed', videoUrl: d.video?.url || d.images?.[0]?.url || null };
  if (['failed', 'nsfw', 'canceled'].includes(st)) return { status: 'failed', error: st };
  return { status: 'processing' };
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  const dry = req.query?.dry === '1';
  const only = req.query?.only || null;
  const results = { pass0: [], pass2: [], pass1: [] };

  try {
    const sb = getSupabase();
    const { data: rows } = await sb.from('creator_drafts').select('id, data').limit(500);
    const all = (rows || []).map(r => r.data).filter(Boolean);
    const today = kstToday(); const dmax = dateNDaysAhead(1); // 내일(D+1)까지만 — 3일후 아님
    const inWindow = (d) => d.date >= today && d.date <= dmax;

    // ── Pass0: 화·목 릴스 슬롯 자동 시드 — 빈 shorts draft 없으면 생성(→ Pass1이 집어 seedance 생성). ──
    //  이게 있어야 릴스가 손 안 대고 매주 화·목 자동 생성됨(캐러셀의 carousel-daily 시더와 동형).
    if (!only) {
      for (let n = 0; n <= 1; n++) { // 오늘·내일만 — 3일후 아님
        const ds = dateNDaysAhead(n);
        if (!reelDay(ds)) continue;
        for (const ch of REEL_SEED_CHANNELS) {
          if (all.some(d => d.version === 'milli-v1' && isShorts(d) && d.channel === ch.key && d.date === ds)) continue;
          if (dry) { results.pass0.push({ would: 'seed', channel: ch.key, date: ds }); continue; }
          const id = `milli_${ch.key}_${ds}_shorts_${Date.now().toString(36)}`;
          const draft = { id, version: 'milli-v1', channel: ch.key, region: ch.region, platform: ch.platform, date: ds, slotType: 'shorts', status: 'draft', format: 'reel', caption: '', hashtags: '', mediaUrl: null, mediaUrls: [], source: 'shorts-daily-seed', profileId: PROFILE[ch.region], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          await sb.from('creator_drafts').insert({ id, persona_id: null, data: draft });
          all.push(draft); // 같은 런 Pass1이 바로 집을 수 있게
          results.pass0.push({ action: 'seeded', channel: ch.key, date: ds });
        }
      }
    }

    // ── Pass2: generating + 영상잡 폴링 → 완료 시 overlay → review ── (seedance=videoReqId / 레거시=klingJobId)
    const gen = all.filter(d => d.version === 'milli-v1' && isShorts(d) && d.status === 'generating' && (d.videoReqId || d.klingJobId) && (!only || d.id === only));
    for (const d of gen) {
      try {
        const j = d.videoReqId ? await pollSeedance(d.videoReqId) : await pollKling(d.klingJobId);
        if (j.status === 'completed' && j.videoUrl) {
          if (dry) { results.pass2.push({ id: d.id, would: 'overlay+review' }); continue; }
          const m = d.shortsMeta || {};
          const out = await overlayShortCore({ footage_url: j.videoUrl, circle_xy: m.circle_xy, captions: m.captions || [], channel: d.channel, date: d.date, slotType: 'shorts', caption: m.caption, hashtags: m.hashtags,
            endcard_url: m.endcard_url, endcard_text: m.endcard_text, endcard_sub: m.endcard_sub });
          results.pass2.push({ id: d.id, action: 'completed', mediaUrl: out.mediaUrl });
        } else if (j.status === 'failed') {
          if (!dry) { d.status = 'failed'; d.error = `${d.videoProvider || 'kling'} ${j.error}`; d.updatedAt = new Date().toISOString(); await sb.from('creator_drafts').update({ data: d }).eq('id', d.id); }
          results.pass2.push({ id: d.id, failed: j.error });
        } else {
          results.pass2.push({ id: d.id, status: 'still_generating' });
        }
      } catch (e) { results.pass2.push({ id: d.id, error: e.message }); }
    }

    // ── Pass1: draft shorts(오늘~D+1) → 1개 시작 ── (릴스는 화·목만 — reelDay 상단 정의)
    const drafts = all.filter(d => d.version === 'milli-v1' && isShorts(d) && d.status === 'draft' && inWindow(d) && (reelDay(d.date) || only === d.id) && (!only || d.id === only));
    const target = drafts[0]; // 런당 1개(타임아웃 방지)
    if (target) {
      try {
        // 컨셉: refUrl 있으면 3프레임 씬분석(비트·전환·룩→프롬프트), 없으면 포맷 로테이션
        let fmt = FORMATS[0]; let hook = null; let sceneMeta = null;
        if (target.refUrl) {
          fmt = { ...FORMATS[0] }; // 팔자 베이스(circle_xy·captions 구조 유지)
          const frames = ytFrames(target.refUrl);
          if (frames.length) {
            const meta = await analyzeShortFrames(frames).catch(() => null);
            if (meta?.success) {
              if (meta.kling_prompt) fmt.klingPrompt = meta.kling_prompt; // 씬분석 기반 생성 프롬프트로 교체
              if (meta.hook) hook = meta.hook;                            // 궁금증 갭 훅
              sceneMeta = { beats: meta.beats, look: meta.look };
            }
          }
        } else {
          const n = Number(await redis.get('creator:shorts:rotation').catch(() => 0)) || 0;
          fmt = FORMATS[n % FORMATS.length];
          if (!dry) await redis.set('creator:shorts:rotation', n + 1).catch(() => {});
        }
        const isUs = target.region === 'us'; // US 채널 = 영문 자막/캡션
        const baseCaps = (isUs && fmt.captionsEn) ? fmt.captionsEn : fmt.captions;
        const captions = JSON.parse(JSON.stringify(baseCaps));
        if (hook && captions[0]) captions[0].text = hook; // 분석 훅으로 첫 자막 교체(궁금증 갭)

        const useSeedance = hasV2() && !!fmt.productRefUrl; // v2 키 + 제품 레퍼 있으면 진짜 제품 사용장면(seedance)
        if (dry) { results.pass1.push({ id: target.id, would: useSeedance ? 'seedance(real-product)' : 'soul+kling', format: fmt.key, refUrl: !!target.refUrl }); }
        else {
          target.status = 'generating';
          // 하이브리드: 모션 비트에선 병 클로즈업 금지(라벨은 엔드카드의 실제 이미지가 담당 → AI 글자 뭉갬 회피).
          let started = false;
          if (useSeedance) {
            // seedance(진짜 제품 레퍼) 우선 시도. ⚠️ platform seedance REST 가 404 나면 kling 으로 폴백(검증된 경로).
            try {
              const personPrefix = fmt.key === 'asmr'
                ? 'Photoreal extreme macro skincare footage, no face no person, soft natural daylight.'
                : 'A young, fresh, modern Korean woman, photoreal skin with natural texture, soft natural daylight, authentic UGC handheld selfie feel.';
              const seedPrompt = `${personPrefix} ${fmt.klingPrompt} The product (from the reference image) appears only loosely in hand and is NOT raised toward the camera — do not feature the bottle label up close. Vertical 9:16, no on-screen text, royalty-free/original audio only.`;
              target.videoReqId = await startSeedance(fmt.productRefUrl, seedPrompt);
              target.videoProvider = 'seedance';
              target.productRefUrl = fmt.productRefUrl;
              started = true;
            } catch (e) { console.error('[shorts-daily] seedance 실패 → kling 폴백:', e.message); }
          }
          if (!started) {
            // kling 폴백/기본: soul 시작이미지 → kling image2video. 제품 정확도는 엔드카드가 보장.
            const startImg = await genStartImage(fmt.imagePrompt);
            target.klingJobId = await startKling(startImg, fmt.klingPrompt);
            target.videoProvider = 'kling';
            target.startImage = startImg;
          }
          // 발행 캡션·해시태그 자동 생성(리뷰레디) — 기존에 입력된 값 있으면 유지.
          let cap = target.caption || '', tags = target.hashtags || '';
          if (!cap) { const g = await genReelCaption(fmt, hook, target.region); cap = g.caption; if (!tags) tags = g.hashtags; }
          const ec = (isUs && fmt.endcardEn) ? fmt.endcardEn : (fmt.endcard || {});
          target.shortsMeta = { circle_xy: fmt.circle_xy, captions, format: fmt.key, scene: sceneMeta, klingPrompt: fmt.klingPrompt, caption: cap, hashtags: tags,
            endcard_url: fmt.productRefUrl, endcard_text: ec.text || '', endcard_sub: ec.sub || '' };
          target.caption = cap; target.hashtags = tags;
          target.source = 'shorts-daily';
          target.updatedAt = new Date().toISOString();
          await sb.from('creator_drafts').update({ data: target }).eq('id', target.id);
          results.pass1.push({ id: target.id, action: 'started', format: fmt.key, provider: target.videoProvider, jobId: target.videoReqId || target.klingJobId });
        }
      } catch (e) { results.pass1.push({ id: target.id, error: e.message }); }
    }

    return res.status(200).json({ ok: true, today, window: [today, dmax], dry, ...results });
  } catch (e) {
    console.error('[shorts-daily]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

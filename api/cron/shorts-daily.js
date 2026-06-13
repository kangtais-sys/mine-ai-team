// 숏츠 풀 자동화 cron (2패스 비동기). 화·목·금·일 shorts 슬롯, 오늘~D+3.
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
// 릴스 슬롯 시더 대상 채널(화·금). KR=한국어 자막/캡션 · US=영문(captionsEn + EN 캡션).
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
const reelDay = (ds) => [2, 5].includes(new Date(ds + 'T12:00:00Z').getUTCDay()); // 화=2·금=5 (정오UTC+getUTCDay=달력요일, TZ독립)
const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const dateNDaysAhead = (n) => new Date(Date.now() + 9 * 3600000 + n * 86400000).toISOString().slice(0, 10);
const isShorts = (d) => d.slotType === 'shorts' || ['reel', 'shorts'].includes(d.format);
function ytId(url) { const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:shorts\/|watch\?v=|embed\/|live\/|v\/))([A-Za-z0-9_-]{11})/); return m ? m[1] : null; }
// 스토리보드 프레임(시작1·중간2·끝3) + hqdefault → 씬 다중분석용
function ytFrames(url) { const id = ytId(url); return id ? ['1', '2', '3', 'hqdefault'].map(f => `https://img.youtube.com/vi/${id}/${f}.jpg`) : []; }

// shorts-format-library.md 폴백 포맷(로테이션). 컴플라이언스·KPI 내장.
const FORMATS = [
  {
    key: 'palja',
    imagePrompt: 'Ultra realistic vertical 9:16 UGC beauty close-up, Korean woman cheek and smile-line area, holding a frosted milky-white milli² protein face mist bottle near her face, soft warm natural light, glass-skin dewy look, authentic phone-camera feel. Skin natural texture, no text.',
    klingPrompt: 'she spritzes a fine cool mist on the smile-line area, the skin looks more hydrated, plumper and softer (moisture, not structural change), satisfying dewy glass-skin glow, gentle ASMR feel. curiosity-gap reveal pacing.',
    productRefUrl: HERO_MIST_URL, // 진짜 제품(라벨 정확) — seedance 레퍼
    circle_xy: { x: 560, y: 880, w: 380, h: 320 },
    captions: [
      { text: '팔자, 주름인 줄 알았죠?', top: 150, size: 60 },
      { text: "사실 '건조'였어요", top: 240, size: 50, color: '#FFE9A8' },
      { text: '1+1 · 24,900원', top: 1660, size: 56 },
      { text: 'AI 연출 · 임상 입증 범위 내', top: 1835, size: 26, color: '#D6D6D6' },
    ],
    captionsEn: [
      { text: 'Smile lines? Think again.', top: 150, size: 58 },
      { text: 'It was just dryness 💧', top: 240, size: 48, color: '#FFE9A8' },
      { text: 'milli² protein mist', top: 1660, size: 52 },
      { text: 'AI-generated · within clinical claims', top: 1835, size: 24, color: '#D6D6D6' },
    ],
  },
  {
    key: 'split',
    imagePrompt: 'Ultra realistic vertical 9:16 split-screen UGC skincare, left side dull dry cakey matte skin closeup, right side dewy glass-skin glow with a frosted milky-white milli² protein mist bottle, bright medical-clean light. No text.',
    klingPrompt: 'left dull matte dry skin, right side a milli² mist spray and the skin blooms into dewy glass-skin water-glow, smooth satisfying before/after, ASMR. curiosity-gap + momentum feel.',
    productRefUrl: HERO_MIST_URL, // 진짜 제품(라벨 정확) — seedance 레퍼
    circle_xy: null,
    captions: [
      { text: '세수 후 몇 초에 뿌려?', top: 150, size: 58 },
      { text: 'one mist →', top: 235, size: 52, color: '#FFE9A8' },
      { text: '1+1 · 24,900원', top: 1660, size: 56 },
      { text: 'AI 연출 · 임상 입증 범위 내', top: 1835, size: 26, color: '#D6D6D6' },
    ],
    captionsEn: [
      { text: 'How many seconds after cleansing?', top: 150, size: 50 },
      { text: 'one mist →', top: 235, size: 52, color: '#FFE9A8' },
      { text: 'milli² protein mist', top: 1660, size: 52 },
      { text: 'AI-generated · within clinical claims', top: 1835, size: 24, color: '#D6D6D6' },
    ],
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

    // ── Pass0: 화·금 릴스 슬롯 자동 시드 — 빈 shorts draft 없으면 생성(→ Pass1이 집어 seedance 생성). ──
    //  이게 있어야 릴스가 손 안 대고 매주 화·금 자동 생성됨(캐러셀의 carousel-daily 시더와 동형).
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
          const out = await overlayShortCore({ footage_url: j.videoUrl, circle_xy: m.circle_xy, captions: m.captions || [], channel: d.channel, date: d.date, slotType: 'shorts', caption: m.caption, hashtags: m.hashtags });
          results.pass2.push({ id: d.id, action: 'completed', mediaUrl: out.mediaUrl });
        } else if (j.status === 'failed') {
          if (!dry) { d.status = 'failed'; d.error = `${d.videoProvider || 'kling'} ${j.error}`; d.updatedAt = new Date().toISOString(); await sb.from('creator_drafts').update({ data: d }).eq('id', d.id); }
          results.pass2.push({ id: d.id, failed: j.error });
        } else {
          results.pass2.push({ id: d.id, status: 'still_generating' });
        }
      } catch (e) { results.pass2.push({ id: d.id, error: e.message }); }
    }

    // ── Pass1: draft shorts(오늘~D+3) → 1개 시작 ── (릴스는 화·금만 — reelDay 상단 정의)
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
          if (useSeedance) {
            // 진짜 제품 이미지 → 인물이 그 제품 쓰는 9:16 사용장면(라벨 충실). 제품은 절대 텍스트로 그리지 않음.
            const seedPrompt = `A young, fresh, modern Korean woman, photoreal skin with natural texture, soft natural daylight, authentic UGC handheld selfie feel. ${fmt.klingPrompt} She holds and uses THIS exact product shown in the reference image — keep the bottle shape, proportions and label exactly as the reference, label readable and unchanged. Vertical 9:16, no on-screen text, royalty-free/original audio only.`;
            target.videoReqId = await startSeedance(fmt.productRefUrl, seedPrompt);
            target.videoProvider = 'seedance';
            target.productRefUrl = fmt.productRefUrl;
          } else {
            const startImg = await genStartImage(fmt.imagePrompt);
            target.klingJobId = await startKling(startImg, fmt.klingPrompt);
            target.startImage = startImg;
          }
          // 발행 캡션·해시태그 자동 생성(리뷰레디) — 기존에 입력된 값 있으면 유지.
          let cap = target.caption || '', tags = target.hashtags || '';
          if (!cap) { const g = await genReelCaption(fmt, hook, target.region); cap = g.caption; if (!tags) tags = g.hashtags; }
          target.shortsMeta = { circle_xy: fmt.circle_xy, captions, format: fmt.key, scene: sceneMeta, klingPrompt: fmt.klingPrompt, caption: cap, hashtags: tags };
          target.caption = cap; target.hashtags = tags;
          target.source = 'shorts-daily';
          target.updatedAt = new Date().toISOString();
          await sb.from('creator_drafts').update({ data: target }).eq('id', target.id);
          results.pass1.push({ id: target.id, action: 'started', format: fmt.key, provider: useSeedance ? 'seedance' : 'kling', jobId: target.videoReqId || target.klingJobId });
        }
      } catch (e) { results.pass1.push({ id: target.id, error: e.message }); }
    }

    return res.status(200).json({ ok: true, today, window: [today, dmax], dry, ...results });
  } catch (e) {
    console.error('[shorts-daily]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// 숏츠 풀 자동화 cron (2패스 비동기). 화·목·금·일 shorts 슬롯, 오늘~D+3.
//  Pass2(먼저): status 'generating' + kling job → 폴링 → 완료 footage → overlay-short(동그라미+자막) → review
//  Pass1: status 'draft' shorts → refUrl 있으면 video-analyze(썸네일) 컨셉, 없으면 shorts-format-library 폴백(로테이션)
//         → generate-image-ref(시작이미지) → scene-video(kling-v2-1-master image2video) 잡 시작 → generating 저장
//  검증 부품 전부 재사용: analyzeMedia / soul text2image / kling(/v1/image2video/kling) / overlayShortCore.
//  컴플라이언스: AI연출·임상 입증 범위·KR 수치만·1+1 24,900. 음악 원곡 금지(원음). KPI: 궁금증 갭 훅 + 대세감.
// 인증: Bearer CRON_SECRET. ?dry=1 = 대상만. ?only=<id> = 그 드래프트만.
import { Redis } from '@upstash/redis';
import { getSupabase } from '../../lib/supabase.js';
import { analyzeShortFrames } from '../video-analyze.js';
import { overlayShortCore } from '../creator/overlay-short.js';

export const config = { maxDuration: 300 };

const redis = new Redis({ url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL, token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN });
const HF = 'https://platform.higgsfield.ai';
const hfHeaders = () => {
  const key = (process.env.HIGGSFIELD_API_KEY || '').replace(/^["']|["']$/g, '').trim();
  if (!key) throw new Error('HIGGSFIELD_API_KEY 없음');
  return { 'hf-api-key': key, 'Content-Type': 'application/json', 'Accept': 'application/json', 'Origin': 'https://cloud.higgsfield.ai', 'Referer': 'https://cloud.higgsfield.ai/' };
};
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
    circle_xy: { x: 560, y: 880, w: 380, h: 320 },
    captions: [
      { text: '팔자, 주름인 줄 알았죠?', top: 150, size: 60 },
      { text: "사실 '건조'였어요", top: 240, size: 50, color: '#FFE9A8' },
      { text: '1+1 · 24,900원', top: 1660, size: 56 },
      { text: 'AI 연출 · 임상 입증 범위 내', top: 1835, size: 26, color: '#D6D6D6' },
    ],
  },
  {
    key: 'split',
    imagePrompt: 'Ultra realistic vertical 9:16 split-screen UGC skincare, left side dull dry cakey matte skin closeup, right side dewy glass-skin glow with a frosted milky-white milli² protein mist bottle, bright medical-clean light. No text.',
    klingPrompt: 'left dull matte dry skin, right side a milli² mist spray and the skin blooms into dewy glass-skin water-glow, smooth satisfying before/after, ASMR. curiosity-gap + momentum feel.',
    circle_xy: null,
    captions: [
      { text: '세수 후 몇 초에 뿌려?', top: 150, size: 58 },
      { text: 'one mist →', top: 235, size: 52, color: '#FFE9A8' },
      { text: '1+1 · 24,900원', top: 1660, size: 56 },
      { text: 'AI 연출 · 임상 입증 범위 내', top: 1835, size: 26, color: '#D6D6D6' },
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

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  const dry = req.query?.dry === '1';
  const only = req.query?.only || null;
  const results = { pass2: [], pass1: [] };

  try {
    const sb = getSupabase();
    const { data: rows } = await sb.from('creator_drafts').select('id, data').limit(500);
    const all = (rows || []).map(r => r.data).filter(Boolean);
    const today = kstToday(); const dmax = dateNDaysAhead(3);
    const inWindow = (d) => d.date >= today && d.date <= dmax;

    // ── Pass2: generating + kling job 폴링 → 완료 시 overlay → review ──
    const gen = all.filter(d => d.version === 'milli-v1' && isShorts(d) && d.status === 'generating' && d.klingJobId && (!only || d.id === only));
    for (const d of gen) {
      try {
        const j = await pollKling(d.klingJobId);
        if (j.status === 'completed' && j.videoUrl) {
          if (dry) { results.pass2.push({ id: d.id, would: 'overlay+review' }); continue; }
          const m = d.shortsMeta || {};
          const out = await overlayShortCore({ footage_url: j.videoUrl, circle_xy: m.circle_xy, captions: m.captions || [], channel: d.channel, date: d.date, slotType: 'shorts', caption: m.caption, hashtags: m.hashtags });
          results.pass2.push({ id: d.id, action: 'completed', mediaUrl: out.mediaUrl });
        } else if (j.status === 'failed') {
          if (!dry) { d.status = 'failed'; d.error = `kling ${j.error}`; d.updatedAt = new Date().toISOString(); await sb.from('creator_drafts').update({ data: d }).eq('id', d.id); }
          results.pass2.push({ id: d.id, failed: j.error });
        } else {
          results.pass2.push({ id: d.id, status: 'still_generating' });
        }
      } catch (e) { results.pass2.push({ id: d.id, error: e.message }); }
    }

    // ── Pass1: draft shorts(오늘~D+3) → 1개 시작 ──
    // 릴스는 주2회(화·금)만 — 그 외 요일 날짜의 shorts 드래프트는 생성 대상에서 제외(2026-06-13 카덴스).
    const reelDay = (ds) => [2, 5].includes(new Date(ds + 'T12:00:00Z').getUTCDay()); // 화=2·금=5 (정오UTC+getUTCDay=달력요일, TZ독립)
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
        const captions = JSON.parse(JSON.stringify(fmt.captions));
        if (hook && captions[0]) captions[0].text = hook; // 분석 훅으로 첫 자막 교체(궁금증 갭)

        if (dry) { results.pass1.push({ id: target.id, would: 'gen+kling', format: fmt.key, refUrl: !!target.refUrl }); }
        else {
          const startImg = await genStartImage(fmt.imagePrompt);
          const klingJobId = await startKling(startImg, fmt.klingPrompt);
          target.status = 'generating';
          target.klingJobId = klingJobId;
          target.startImage = startImg;
          target.shortsMeta = { circle_xy: fmt.circle_xy, captions, format: fmt.key, scene: sceneMeta, klingPrompt: fmt.klingPrompt, caption: target.caption || '', hashtags: target.hashtags || '' };
          target.source = 'shorts-daily';
          target.updatedAt = new Date().toISOString();
          await sb.from('creator_drafts').update({ data: target }).eq('id', target.id);
          results.pass1.push({ id: target.id, action: 'started', format: fmt.key, klingJobId });
        }
      } catch (e) { results.pass1.push({ id: target.id, error: e.message }); }
    }

    return res.status(200).json({ ok: true, today, window: [today, dmax], dry, ...results });
  } catch (e) {
    console.error('[shorts-daily]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// POST /api/creator/overlay-short — 숏츠 오버레이 렌더러 (docs/shorts-format-library.md "🖍️ 오버레이 단계").
// 입력 {footage_url, circle_xy, captions[], channel, date, slotType?, sound?, caption?, hashtags?}
//  ① 시그니처 팔자 동그라미(손그림 ellipse) + 자막을 9:16 투명 PNG로 렌더(satori+resvg, render-card 스택)
//  ② 단일 ffmpeg overlay 로 footage(cloudfront)에 합성 (compose.js 검증 패턴: fluent-ffmpeg + @ffmpeg-installer)
//  ③ Blob 호스팅 → 보드(ingest 계약) 시드(slotType 'shorts', status review)
// 사운드 정책: footage 원음 유지(Higgsfield 생성음/로열티프리). 원곡 굽기 금지. sound:'mute' 면 무음.
// 인증: Authorization: Bearer CREATOR_INGEST_SECRET. Cowork milli-shorts-daily-fill 가 호출.
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { put } from '@vercel/blob';
import { promises as fs } from 'fs';
import { getSupabase } from '../../lib/supabase.js';
import { loadFonts } from './render-card.js';

export const config = { maxDuration: 120 };

const W = 1080, H = 1920;

// 손그림 거친 타원(render-card roughEllipse 스타일) — 시그니처 펜써클.
function roughEllipseSvg(w, h, color, sw) {
  const p = `M ${w * .52} ${h * .1} C ${w * .92} ${h * .04} ${w * 1.0} ${h * .62} ${w * .56} ${h * .9} C ${w * .12} ${h * 1.04} ${w * .0} ${h * .42} ${w * .46} ${h * .12} C ${w * .62} ${h * .04} ${w * .8} ${h * .08} ${w * .9} ${h * .2}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><path d="${p}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// 투명 오버레이 PNG 렌더 (동그라미 + 자막)
export async function renderOverlayPng({ circle_xy, captions = [] }) {
  const fonts = await loadFonts();
  const children = [];

  // 시그니처 팔자 동그라미 (circle_xy = {x,y,w,h} px, 1080x1920 기준). color 기본 잉크블랙.
  if (circle_xy && circle_xy.w && circle_xy.h) {
    const c = circle_xy;
    const sw = Math.max(6, Math.round(c.w * 0.02));
    children.push({
      type: 'img',
      props: { src: roughEllipseSvg(c.w, c.h, c.color || '#111111', sw), style: { position: 'absolute', left: c.x || 0, top: c.y || 0, width: c.w, height: c.h } },
    });
  }

  // 자막 burn-in (각 {text, top, x, size, color, weight, align}). 가독 위해 그림자.
  captions.forEach((cap, i) => {
    if (!cap || !cap.text) return;
    const size = cap.size || 64;
    const top = cap.top != null ? cap.top : (160 + i * (size + 40));
    children.push({
      type: 'div',
      props: {
        style: {
          position: 'absolute', top, left: cap.x != null ? cap.x : 60, width: cap.x != null ? undefined : W - 120,
          display: 'flex', justifyContent: cap.align || 'center',
          fontFamily: 'Pretendard', fontWeight: cap.weight || 900, fontSize: size,
          color: cap.color || '#FFFFFF', lineHeight: 1.15, letterSpacing: -1,
          textShadow: '0 3px 14px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.8)',
          textAlign: cap.align === 'flex-start' ? 'left' : 'center',
        },
        children: cap.text,
      },
    });
  });

  const vdom = { type: 'div', props: { style: { width: W, height: H, display: 'flex', position: 'relative' }, children } };
  const svg = await satori(vdom, { width: W, height: H, fonts }); // 배경 없음 → 투명
  return new Resvg(svg, { fitTo: { mode: 'width', value: W }, background: 'rgba(0,0,0,0)' }).render().asPng();
}

// 엔드카드 PNG (하이브리드 마지막 비트) — 진짜 제품 이미지(라벨 정확) + 스펙 1줄 + CTA.
//   라벨은 실제 이미지라 100% 정확(AI 영상은 글자를 뭉갬 → 라벨은 여기에만). 블랙 배경 프리미엄.
export async function renderEndcardPng({ endcardDataUri, endcard_text = '', endcard_sub = '' }) {
  const fonts = await loadFonts();
  const children = [
    // 제품 이미지 (상단 ~62%, contain)
    { type: 'div', props: { style: { display: 'flex', width: W, height: Math.round(H * 0.6), justifyContent: 'center', alignItems: 'center', marginTop: 120 },
      children: endcardDataUri ? [{ type: 'img', props: { src: endcardDataUri, style: { width: 680, height: Math.round(H * 0.56), objectFit: 'contain' } } }] : [] } },
    // 텍스트 블록 (하단)
    { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: W, marginTop: 24 }, children: [
      endcard_text ? { type: 'div', props: { style: { display: 'flex', fontFamily: 'Pretendard', fontWeight: 900, fontSize: 76, color: '#FFFFFF', letterSpacing: -1, textAlign: 'center' }, children: endcard_text } } : null,
      endcard_sub ? { type: 'div', props: { style: { display: 'flex', fontFamily: 'Pretendard', fontWeight: 600, fontSize: 42, color: '#C7C7C7', marginTop: 20, textAlign: 'center' }, children: endcard_sub } } : null,
      { type: 'div', props: { style: { display: 'flex', fontFamily: 'Pretendard', fontWeight: 700, fontSize: 30, color: '#8A8A8A', marginTop: 40, letterSpacing: 1 }, children: 'milli²' } },
      { type: 'div', props: { style: { display: 'flex', fontFamily: 'Pretendard', fontWeight: 400, fontSize: 22, color: '#6A6A6A', marginTop: 10 }, children: '*AI 연출 · 입증 범위 내' } },
    ].filter(Boolean) } },
  ];
  const vdom = { type: 'div', props: { style: { width: W, height: H, display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#0A0A0A' }, children } };
  const svg = await satori(vdom, { width: W, height: H, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}

// footage + overlay PNG (+ 선택: 엔드카드) → ffmpeg 합성.
//   endcardPath 있으면 모션클립 끝에 라벨정확 엔드카드를 endcardSec 만큼 concat(단일 재인코딩).
//   주의: 비(非)mute 일 때 footage 에 오디오 스트림이 있다고 가정(seedance/kling sound:on 은 항상 있음).
export async function composeOverlay(footagePath, overlayPath, outPath, { mute, endcardPath = null, endcardSec = 1.8 }) {
  const ffmpeg = (await import('fluent-ffmpeg')).default;
  const { path: ffmpegPath } = await import('@ffmpeg-installer/ffmpeg');
  ffmpeg.setFfmpegPath(ffmpegPath);
  const SC = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1';
  // footage 오디오 스트림 유무 판정 (seedance=유음 / kling=무음) — 엔드카드 합성 시 오디오 분기에 사용.
  let hasAudio = false;
  if (!mute && endcardPath) {
    try {
      const { spawnSync } = await import('child_process');
      const probe = spawnSync(ffmpegPath, ['-hide_banner', '-i', footagePath], { encoding: 'utf8' });
      hasAudio = /Stream #\d+:\d+.*: Audio:/.test(`${probe.stderr || ''}${probe.stdout || ''}`);
    } catch { /* 판정 실패 → 무음 취급 */ }
  }
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg().input(footagePath).input(overlayPath);
    let filter, outOpts;
    if (!endcardPath) {
      // 기존: 단일 클립 오버레이
      filter = `[0:v]${SC}[bg];[bg][1:v]overlay=0:0:format=auto[v]`;
      outOpts = ['-map [v]', mute ? '-an' : '-map 0:a?'];
    } else {
      // 하이브리드: [모션+오버레이] + [엔드카드] concat
      cmd.input(endcardPath).inputOptions(['-loop 1', `-t ${endcardSec}`]);
      const vGraph =
        `[0:v]${SC},fps=30[bg];[bg][1:v]overlay=0:0:format=auto[va];` +
        `[2:v]${SC},fps=30,format=yuv420p[vb];[va][vb]concat=n=2:v=1:a=0[v]`;
      if (mute) {
        filter = vGraph;
        outOpts = ['-map [v]', '-an'];
      } else if (hasAudio) {
        // footage 유음(seedance) → footage 오디오 + 엔드카드 무음 concat
        cmd.input('anullsrc=channel_layout=stereo:sample_rate=44100').inputOptions(['-f lavfi', `-t ${endcardSec}`]);
        filter = vGraph + `;[0:a]aresample=44100[a0];[a0][3:a]concat=n=2:v=0:a=1[a]`;
        outOpts = ['-map [v]', '-map [a]'];
      } else {
        // footage 무음(kling) → 전체 무음 트랙 합성(-shortest 로 영상 길이에 맞춤). 발행 시 트렌딩 사운드 입힘.
        cmd.input('anullsrc=channel_layout=stereo:sample_rate=44100').inputOptions(['-f lavfi']);
        filter = vGraph;
        outOpts = ['-map [v]', '-map 3:a', '-shortest'];
      }
    }
    cmd
      .complexFilter(filter)
      .outputOptions([
        ...outOpts,
        '-c:v libx264', '-preset veryfast', '-crf 20', '-pix_fmt yuv420p',
        '-c:a aac', '-movflags +faststart', '-y',
      ])
      .output(outPath)
      .on('start', c => console.log('[overlay-short] ffmpeg:', c.slice(0, 160)))
      .on('end', resolve)
      .on('error', e => reject(e))
      .run();
  });
}

async function seedDraft(sb, { channel, date, mediaUrl, caption, hashtags, slotType }) {
  const region = channel.startsWith('us') ? 'us' : 'kr';
  const platform = channel.endsWith('tt') ? 'tiktok' : 'instagram';
  const PROFILE = {
    kr: (process.env.ZERNIO_MILLIMILLI_PROFILE_ID || '69d08cc1986d57bb8f733102').replace(/\\[rn]/g, '').trim(),
    us: (process.env.ZERNIO_MILLIMILLI_US_PROFILE_ID || '69fbfcd01fc1fdb66f249aa8').replace(/\\[rn]/g, '').trim(),
  };
  const { data: rows } = await sb.from('creator_drafts').select('id, data').limit(300);
  const existing = (rows || []).find(r => r.data && r.data.version === 'milli-v1' && r.data.channel === channel && r.data.date === date && (r.data.slotType || 'shorts') === slotType);
  if (existing) {
    const d = existing.data;
    d.mediaUrl = mediaUrl; d.format = 'reel'; d.status = 'review';
    if (caption != null) d.caption = caption;
    if (hashtags != null) d.hashtags = hashtags;
    d.source = 'overlay-short'; d.updatedAt = new Date().toISOString();
    await sb.from('creator_drafts').update({ data: d }).eq('id', existing.id);
    return { channel, id: existing.id, action: 'updated' };
  }
  const id = `milli_${channel}_${date}_${Date.now().toString(36)}`;
  const draft = {
    id, version: 'milli-v1', channel, region, platform, date, slotType, status: 'review', format: 'reel',
    caption: caption || '', hashtags: hashtags || '', mediaUrl, mediaUrls: [], source: 'overlay-short',
    profileId: PROFILE[region], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await sb.from('creator_drafts').insert({ id, persona_id: null, data: draft });
  return { channel, id, action: 'created' };
}

// 코어(엔드포인트·cron 공용): 오버레이 PNG → ffmpeg 합성 → (returnBuffer면 버퍼, 아니면 Blob+보드시드)
export async function overlayShortCore({ footage_url, circle_xy, captions = [], channel, date, slotType = 'shorts', sound, caption, hashtags, endcard_url, endcard_text, endcard_sub }, { returnBuffer = false } = {}) {
  if (!footage_url) throw new Error('footage_url 필수');
  const sid = (channel || 'short') + '_' + Date.now().toString(36);
  const footagePath = `/tmp/${sid}_src.mp4`;
  const overlayPath = `/tmp/${sid}_ovl.png`;
  const endcardPath = `/tmp/${sid}_ec.png`;
  const outPath = `/tmp/${sid}_out.mp4`;
  const cleanup = async () => { for (const p of [footagePath, overlayPath, endcardPath, outPath]) await fs.unlink(p).catch(() => {}); };
  try {
    const png = await renderOverlayPng({ circle_xy, captions });
    await fs.writeFile(overlayPath, png);
    // 엔드카드(라벨 정확) — endcard_url 있으면 제품 이미지를 data URI 로 받아 카드 렌더.
    let useEndcard = false;
    if (endcard_url) {
      try {
        const er = await fetch(endcard_url, { signal: AbortSignal.timeout(20000) });
        if (er.ok) {
          const ct = er.headers.get('content-type') || 'image/png';
          const dataUri = `data:${ct};base64,${Buffer.from(await er.arrayBuffer()).toString('base64')}`;
          const ecPng = await renderEndcardPng({ endcardDataUri: dataUri, endcard_text, endcard_sub });
          await fs.writeFile(endcardPath, ecPng);
          useEndcard = true;
        }
      } catch (e) { console.error('[overlay-short] endcard skip:', e.message); }
    }
    const r = await fetch(footage_url, { signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error(`footage 다운로드 실패 ${r.status}`);
    await fs.writeFile(footagePath, Buffer.from(await r.arrayBuffer()));
    await composeOverlay(footagePath, overlayPath, outPath, { mute: sound === 'mute', endcardPath: useEndcard ? endcardPath : null });
    const buf = await fs.readFile(outPath);
    if (returnBuffer) { await cleanup(); return { buffer: buf }; }
    const blob = await put(`shorts/${channel || 'short'}-${date || 'x'}-${Date.now()}.mp4`, buf, { access: 'public', contentType: 'video/mp4', addRandomSuffix: true });
    let draft = null;
    if (channel && date) draft = await seedDraft(getSupabase(), { channel, date, mediaUrl: blob.url, caption, hashtags, slotType });
    await cleanup();
    return { ok: true, mediaUrl: blob.url, draft };
  } catch (e) { await cleanup().catch(() => {}); throw e; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.CREATOR_INGEST_SECRET;
  if (!secret) return res.status(503).json({ error: 'Service misconfigured (CREATOR_INGEST_SECRET)' });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.body?.footage_url) return res.status(400).json({ error: 'footage_url 필수' });
  try {
    if (req.query?.preview === 'true') {
      const { buffer } = await overlayShortCore(req.body, { returnBuffer: true });
      res.setHeader('Content-Type', 'video/mp4');
      return res.status(200).end(buffer);
    }
    const out = await overlayShortCore(req.body);
    return res.status(200).json(out);
  } catch (e) {
    console.error('[overlay-short]', e.message);
    return res.status(/필수|다운로드/.test(e.message) ? 400 : 500).json({ error: e.message });
  }
}

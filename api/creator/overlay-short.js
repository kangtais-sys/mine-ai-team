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

// footage + overlay PNG → 단일 ffmpeg overlay 합성
export async function composeOverlay(footagePath, overlayPath, outPath, { mute }) {
  const ffmpeg = (await import('fluent-ffmpeg')).default;
  const { path: ffmpegPath } = await import('@ffmpeg-installer/ffmpeg');
  ffmpeg.setFfmpegPath(ffmpegPath);
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(footagePath)
      .input(overlayPath)
      .complexFilter('[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[bg];[bg][1:v]overlay=0:0:format=auto[v]')
      .outputOptions([
        '-map [v]',
        mute ? '-an' : '-map 0:a?',
        '-c:v libx264', '-preset veryfast', '-crf 20', '-pix_fmt yuv420p',
        '-c:a aac', '-movflags +faststart', '-y',
      ])
      .output(outPath)
      .on('start', c => console.log('[overlay-short] ffmpeg:', c.slice(0, 140)))
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
export async function overlayShortCore({ footage_url, circle_xy, captions = [], channel, date, slotType = 'shorts', sound, caption, hashtags }, { returnBuffer = false } = {}) {
  if (!footage_url) throw new Error('footage_url 필수');
  const sid = (channel || 'short') + '_' + Date.now().toString(36);
  const footagePath = `/tmp/${sid}_src.mp4`;
  const overlayPath = `/tmp/${sid}_ovl.png`;
  const outPath = `/tmp/${sid}_out.mp4`;
  const cleanup = async () => { for (const p of [footagePath, overlayPath, outPath]) await fs.unlink(p).catch(() => {}); };
  try {
    const png = await renderOverlayPng({ circle_xy, captions });
    await fs.writeFile(overlayPath, png);
    const r = await fetch(footage_url, { signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error(`footage 다운로드 실패 ${r.status}`);
    await fs.writeFile(footagePath, Buffer.from(await r.arrayBuffer()));
    await composeOverlay(footagePath, overlayPath, outPath, { mute: sound === 'mute' });
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

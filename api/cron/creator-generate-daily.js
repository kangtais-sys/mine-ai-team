// 데일리 작업 — 보드(creator_drafts) 의 review_hook / trend_info 슬롯만 자동 채움.
//  ⚠️ shorts 슬롯은 Cowork 스케줄 작업(milli-shorts-daily-fill, Higgsfield)이 담당 — 앱은 절대 건드리지 않음(충돌 방지).
//  refUrl 있으면 → 썸네일 → /api/video-analyze(Claude Vision) → 캡션·해시태그·훅 생성 → status review
//  refUrl 없으면 → 라이브러리 폴백(redis creator:library:{slotType}) → 있으면 mediaUrl, 없으면 스킵
// 멱등: 같은 refUrl 재분석 안 함. status review/approved/scheduled/published 는 건드리지 않음.
// 인증: Bearer CRON_SECRET (미들웨어 /api/cron/* 통과). ?dry=1 = 대상·동작만 반환(변경 없음).
import { Redis } from '@upstash/redis';
import { getSupabase } from '../../lib/supabase.js';
import { analyzeMedia } from '../video-analyze.js';

export const config = { maxDuration: 300 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
// 앱 담당 슬롯 = review_hook / trend_info 만. shorts 는 Cowork 담당이라 제외(충돌 방지).
const APP_SLOTS = new Set(['review_hook', 'trend_info']);
const isAppSlot = (d) => APP_SLOTS.has(d.slotType) && d.slotType !== 'shorts' && !['reel', 'shorts'].includes(d.format);

// 유튜브 링크 → 썸네일 URL (hqdefault 는 항상 존재). shorts/watch/youtu.be 모두 처리.
function ytThumb(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:shorts\/|watch\?v=|embed\/|live\/|v\/))([A-Za-z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const dry = req.query?.dry === '1';
  const today = kstToday();

  try {
    const sb = getSupabase();
    const { data: rows } = await sb.from('creator_drafts').select('id, data').limit(300);
    const targets = (rows || [])
      .map(r => r.data)
      .filter(d => d && d.version === 'milli-v1' && d.date === today && isAppSlot(d) && ['draft', 'generating'].includes(d.status));

    const results = [];
    for (const d of targets) {
      try {
        if (d.refUrl) {
          if (d.analyzedFrom === d.refUrl) { results.push({ id: d.id, skipped: 'already_analyzed' }); continue; }
          const thumb = ytThumb(d.refUrl);
          if (!thumb) { results.push({ id: d.id, error: 'invalid_youtube_url', refUrl: d.refUrl }); continue; }
          if (dry) { results.push({ id: d.id, would: 'analyze', channel: d.channel, slotType: d.slotType, thumb }); continue; }

          const meta = await analyzeMedia({ imageUrl: thumb });
          if (meta && meta.success) {
            d.caption = meta.tiktok_caption || meta.youtube_description || d.caption || '';
            d.hashtags = Array.isArray(meta.hashtags) ? meta.hashtags.join(' ') : (meta.hashtags || d.hashtags || '');
            d.hook = meta.thumbnail_text || d.hook || '';
            d.analysisMeta = { title: meta.youtube_title, thumbnailText: meta.thumbnail_text };
            d.analyzedFrom = d.refUrl;
            d.source = 'video_analysis';
            d.status = 'review';
            d.updatedAt = new Date().toISOString();
            await sb.from('creator_drafts').update({ data: d }).eq('id', d.id);
            results.push({ id: d.id, action: 'analyzed', channel: d.channel, title: meta.youtube_title });
          } else {
            results.push({ id: d.id, error: 'analyze_failed', detail: meta?.error || 'no_metadata' });
          }
        } else {
          // 라이브러리 폴백: redis creator:library:{slotType} (검증 영상 URL 목록)
          const lib = await redis.lrange(`creator:library:${d.slotType}`, 0, -1).catch(() => []);
          const pick = (lib && lib.length) ? lib[0] : null;
          if (!pick) { results.push({ id: d.id, skipped: 'no_ref_no_library', slotType: d.slotType }); continue; }
          if (dry) { results.push({ id: d.id, would: 'library_fallback', channel: d.channel, pick }); continue; }
          const url = typeof pick === 'string' ? pick : (pick.url || null);
          if (!url) { results.push({ id: d.id, error: 'library_entry_no_url' }); continue; }
          d.mediaUrl = url;
          d.source = 'library_fallback';
          d.status = 'review';
          d.updatedAt = new Date().toISOString();
          await sb.from('creator_drafts').update({ data: d }).eq('id', d.id);
          results.push({ id: d.id, action: 'library_fallback', channel: d.channel });
        }
      } catch (e) {
        results.push({ id: d.id, error: e.message });
      }
    }

    const summary = { ok: true, date: today, dry, candidates: targets.length, processed: results.length, results };
    if (!dry) { try { await redis.set('creator:generate-daily:latest', { ...summary, at: new Date().toISOString() }, { ex: 86400 * 3 }); } catch {} }
    return res.status(200).json(summary);
  } catch (e) {
    console.error('[creator-generate-daily]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

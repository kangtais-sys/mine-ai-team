// api/creator/calendar.js — 주간 콘텐츠 캘린더 (요일×4채널)
// GET  ?week=YYYY-MM-DD → 해당 주(월~일) creator_drafts(version 'milli-v1')
// POST { action, ... }  → save | approve | schedule | publish | delete | generate
// 저장소: Supabase creator_drafts(data JSON). 발행: Zernio /posts.

import { getSupabase } from '../../lib/supabase.js';

const ZERNIO = 'https://zernio.com/api/v1';

// region → Zernio 프로필 (accounts.js와 동일)
const PROFILE = {
  kr: process.env.ZERNIO_MILLIMILLI_PROFILE_ID || '69d08cc1986d57bb8f733102',
  us: process.env.ZERNIO_MILLIMILLI_US_PROFILE_ID || '69fbfcd01fc1fdb66f249aa8',
};

const zPost = (body) =>
  fetch(`${ZERNIO}/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json());

function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function iso(d) { return new Date(d).toISOString().slice(0, 10); }

// 시장별 타임존 (US ET는 서머타임 자동 반영)
const TZ = { kr: 'Asia/Seoul', us: 'America/New_York' };

// 'YYYY-MM-DD' + 'HH:MM'을 해당 타임존의 벽시계로 해석 → 절대 UTC 인스턴트
function localWallClockToUTC(dateStr, timeStr, timeZone) {
  const [Y, M, D] = dateStr.split('-').map(Number);
  const [h, m] = (timeStr || '09:00').split(':').map(Number);
  const asUTC = Date.UTC(Y, M - 1, D, h, m, 0);
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(asUTC)).reduce((a, x) => (a[x.type] = x.value, a), {});
  const seen = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour % 24), +p.minute, +p.second);
  const offset = seen - asUTC; // 해당 tz가 UTC보다 앞선 ms
  return new Date(asUTC - offset).toISOString();
}

// 드래프트에 현지시각(표시용) + UTC(스케줄용) 동시 기록
function setSchedule(draft, dateStr, timeStr) {
  const tz = TZ[draft.region] || TZ.kr;
  const time = timeStr || (draft.scheduledLocal || '').slice(11, 16) || '09:00';
  draft.tz = tz;
  draft.scheduledLocal = `${dateStr}T${time}`;          // 화면 표시용(현지 벽시계)
  draft.scheduledAt = localWallClockToUTC(dateStr, time, tz); // Zernio/cron용(UTC 절대시각)
}

function buildMediaItems(draft) {
  if ((draft.format === 'reel' || draft.format === 'shorts') && draft.mediaUrl)
    return [{ type: 'video', url: draft.mediaUrl, filename: 'content.mp4' }];
  if (draft.format === 'cardnews' && draft.mediaUrls?.length)
    return draft.mediaUrls.map((url, i) => ({ type: 'image', url, filename: `slide_${i + 1}.jpg` }));
  if (draft.mediaUrl) return [{ type: 'image', url: draft.mediaUrl, filename: 'content.jpg' }];
  return [];
}

export default async function handler(req, res) {
  const sb = getSupabase();

  // ─── GET: 주간 조회 ───
  if (req.method === 'GET') {
    const week = req.query.week || iso(new Date());
    const weekEnd = iso(addDays(week, 6));
    try {
      const { data, error } = await sb
        .from('creator_drafts')
        .select('id, data, created_at')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      const drafts = (data || [])
        .map(r => r.data)
        .filter(d => d && d.version === 'milli-v1' && d.date >= week && d.date <= weekEnd);
      return res.status(200).json({ drafts });
    } catch (e) {
      console.error('[Calendar GET]', e.message);
      return res.status(200).json({ drafts: [] });
    }
  }

  // ─── POST: 액션 ───
  if (req.method === 'POST') {
    const { action } = req.body || {};
    const payload = req.body || {};

    try {
      // generate: 빈 슬롯에 초안 행 생성 (실제 미디어 생성은 별도 파이프라인)
      if (action === 'generate') {
        const channel = payload.channel; // 'kr_ig' 등
        const region = channel?.startsWith('us') ? 'us' : 'kr';
        const platform = channel?.endsWith('tt') ? 'tiktok' : 'instagram';
        const id = `milli_${channel}_${payload.date}_${Date.now().toString(36)}`;
        const draft = {
          id, version: 'milli-v1', channel, region, platform,
          date: payload.date, slotType: payload.slotType || null,
          status: 'draft', format: payload.format || 'reel',
          caption: '', hashtags: '', mediaUrl: null, mediaUrls: [],
          profileId: PROFILE[region],
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        setSchedule(draft, payload.date, '09:00'); // 기본 현지 09:00
        await sb.from('creator_drafts').insert({ id, persona_id: null, data: draft });
        return res.status(200).json({ ok: true, draft });
      }

      // 이하 액션은 기존 행 대상
      const id = payload.id || payload.draft?.id;
      if (!id) return res.status(400).json({ error: 'id 필수' });
      const { data: row } = await sb.from('creator_drafts').select('data').eq('id', id).single();
      if (!row) return res.status(404).json({ error: '드래프트 없음' });
      let draft = row.data;

      const patchMeta = () => {
        if (payload.caption != null) draft.caption = payload.caption;
        if (payload.hashtags != null) draft.hashtags = payload.hashtags;
        if (payload.time) setSchedule(draft, draft.date, payload.time);
        draft.updatedAt = new Date().toISOString();
      };

      if (action === 'delete') {
        await sb.from('creator_drafts').delete().eq('id', id);
        return res.status(200).json({ ok: true, deleted: id });
      }

      if (action === 'save')     { patchMeta(); }
      if (action === 'approve')  { patchMeta(); draft.status = 'approved'; }
      if (action === 'schedule') { patchMeta(); draft.status = 'scheduled'; }

      // 자연어 수정 요청 → 재생성 큐로 (외부 파이프라인이 status 'generating' + lastRevisionNote를 읽어 처리)
      if (action === 'revise') {
        patchMeta();
        draft.status = 'generating';
        draft.lastRevisionNote = payload.revisionNote || '';
        draft.revisions = [...(draft.revisions || []), { note: payload.revisionNote || '', at: new Date().toISOString() }];
      }

      if (action === 'publish') {
        patchMeta();
        if (!process.env.ZERNIO_API_KEY) return res.status(500).json({ error: 'ZERNIO_API_KEY 없음' });
        const text = [draft.caption, draft.hashtags].filter(Boolean).join('\n\n');
        const mediaItems = buildMediaItems(draft);
        const body = {
          profileId: draft.profileId || PROFILE[draft.region] || PROFILE.kr,
          text,
          platforms: [{ platform: draft.platform, platformSpecificData: { caption: text.substring(0, 2200) } }],
          status: 'published',
          ...(mediaItems.length && { mediaItems }),
        };
        const result = await zPost(body);
        if (result.error || (result.message && /error/i.test(result.message))) {
          draft.status = 'failed'; draft.error = result.error || result.message;
          await sb.from('creator_drafts').update({ data: draft }).eq('id', id);
          return res.status(500).json({ error: draft.error });
        }
        draft.status = 'published';
        draft.publishedAt = new Date().toISOString();
        draft.publishResult = { postId: result._id || result.id, via: 'zernio' };
      }

      await sb.from('creator_drafts').update({ data: draft }).eq('id', id);
      return res.status(200).json({ ok: true, draft });
    } catch (e) {
      console.error('[Calendar POST]', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// api/creator/calendar.js — 주간 콘텐츠 캘린더 (요일×4채널)
// GET  ?week=YYYY-MM-DD → 해당 주(월~일) creator_drafts(version 'milli-v1')
// POST { action, ... }  → save | approve | schedule | publish | delete | generate
// 저장소: Supabase creator_drafts(data JSON). 발행: Zernio /posts.

import { getSupabase } from '../../lib/supabase.js';

const ZERNIO = 'https://zernio.com/api/v1';

// env 값 끝 개행/공백 방어 (§2 — Vercel env 의 \n 으로 인한 Zernio 발행 실패 차단)
const envTrim = (k, fb = '') => (process.env[k] || fb).trim();

// region → Zernio 프로필 (accounts.js와 동일)
const PROFILE = {
  kr: envTrim('ZERNIO_MILLIMILLI_PROFILE_ID', '69d08cc1986d57bb8f733102'),
  us: envTrim('ZERNIO_MILLIMILLI_US_PROFILE_ID', '69fbfcd01fc1fdb66f249aa8'),
};

const zPost = (body) =>
  fetch(`${ZERNIO}/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${envTrim('ZERNIO_API_KEY')}`, 'Content-Type': 'application/json' },
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

// 다양한 IPv4 표기(점10진/단일10진/16진/8진)를 정수로 정규화 — 우회 차단용
function ipv4ToInt(h) {
  if (/^\d+$/.test(h)) return Number(h) >>> 0;                 // 2130706433
  if (/^0x[0-9a-f]+$/i.test(h)) return parseInt(h, 16) >>> 0;  // 0x7f000001
  if (/^0[0-7]+$/.test(h)) return parseInt(h, 8) >>> 0;        // 017700000001
  const p = h.split('.');
  if (p.length === 4 && p.every(x => /^\d+$/.test(x) && +x < 256))
    return ((+p[0] << 24) | (+p[1] << 16) | (+p[2] << 8) | +p[3]) >>> 0;
  return null;
}
function isPrivateV4Int(n) {
  const a = (n >>> 24) & 255, b = (n >>> 16) & 255;
  return a === 0 || a === 10 || a === 127                       // 와일드카드/사설/루프백
    || (a === 169 && b === 254)                                 // 링크로컬
    || (a === 192 && b === 168)                                 // 사설
    || (a === 172 && b >= 16 && b <= 31)                        // 사설
    || (a === 100 && b >= 64 && b <= 127);                      // CGNAT
}

// SSRF 가드(방어심화) — 외부로 발행할 미디어 URL은 공개 https 만 허용.
// ※ 이 URL은 우리 서버가 fetch하지 않고 Zernio(제3자)에 문자열로 전달됨 →
//   연결시점(DNS resolve-then-connect) 방어는 비적용. 여기선 명백한 내부지정 차단에 집중.
function isSafePublicHttpsUrl(u) {
  let url;
  try { url = new URL(u); } catch { return false; }
  if (url.protocol !== 'https:') return false;
  let host = url.hostname.toLowerCase();
  if (host === 'localhost') return false;
  // IPv6
  if (host.startsWith('[') || host.includes(':')) {
    const h6 = host.replace(/^\[|\]$/g, '');
    if (h6 === '::1' || h6 === '::') return false;                 // 루프백/미지정
    if (/^(f[cd][0-9a-f]{2}:|fe80:)/.test(h6)) return false;       // ULA/링크로컬
    if (/::ffff:/i.test(h6)) return false;                         // IPv4-mapped 전면 거부(정상 미디어 미사용)
    return true;
  }
  // IPv4(점10진/단일10진/16진/8진) 정규화 후 사설대역 검사
  const n = ipv4ToInt(host);
  if (n != null) return !isPrivateV4Int(n);
  // 그 외는 호스트명 — 통과(우리가 fetch하지 않으므로 DNS 리바인딩 비해당)
  return true;
}

function buildMediaItems(draft) {
  if ((draft.format === 'reel' || draft.format === 'shorts') && draft.mediaUrl)
    return [{ type: 'video', url: draft.mediaUrl, filename: 'content.mp4' }];
  if (draft.format === 'cardnews' && draft.mediaUrls?.length)
    return draft.mediaUrls.map((url, i) => ({ type: 'image', url, filename: `slide_${i + 1}.jpg` }));
  if (draft.mediaUrl) return [{ type: 'image', url: draft.mediaUrl, filename: 'content.jpg' }];
  return [];
}

// §4 — 드래프트를 Zernio 즉시 발행 (publish 액션 + 정시 발행 cron 공용 단일 경로).
// draft 의 status/publishedAt/publishResult/error 를 변경. dryRun 이면 Zernio 호출 없이 payload만 반환.
export async function publishDraftToZernio(draft, { dryRun = false } = {}) {
  if (!envTrim('ZERNIO_API_KEY')) return { ok: false, error: 'ZERNIO_API_KEY 없음', code: 500 };
  const text = [draft.caption, draft.hashtags].filter(Boolean).join('\n\n');
  const mediaItems = buildMediaItems(draft);
  const unsafe = mediaItems.find(m => !isSafePublicHttpsUrl(m.url));
  if (unsafe) {
    draft.status = 'failed'; draft.error = `안전하지 않은 미디어 URL 차단: ${unsafe.url}`;
    return { ok: false, error: draft.error, code: 400 };
  }
  const body = {
    profileId: (draft.profileId || PROFILE[draft.region] || PROFILE.kr || '').trim(),
    text,
    platforms: [{ platform: draft.platform, platformSpecificData: { caption: text.substring(0, 2200) } }],
    status: 'published',
    ...(mediaItems.length && { mediaItems }),
  };
  if (dryRun) return { ok: true, dryRun: true, body };
  const result = await zPost(body);
  if (result.error || (result.message && /error/i.test(result.message))) {
    draft.status = 'failed'; draft.error = result.error || result.message;
    return { ok: false, error: draft.error, result, code: 500 };
  }
  draft.status = 'published';
  draft.publishedAt = new Date().toISOString();
  draft.publishResult = { postId: result._id || result.id, via: 'zernio' };
  return { ok: true, result };
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
        // §3 — 보드에서 Blob 업로드한 미디어 URL 저장
        if (payload.mediaUrl !== undefined) draft.mediaUrl = payload.mediaUrl;
        if (payload.mediaUrls !== undefined) draft.mediaUrls = payload.mediaUrls;
        if (payload.format) draft.format = payload.format;
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
        const pr = await publishDraftToZernio(draft);
        if (!pr.ok) {
          await sb.from('creator_drafts').update({ data: draft }).eq('id', id);
          return res.status(pr.code || 500).json({ error: pr.error });
        }
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

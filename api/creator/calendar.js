// api/creator/calendar.js — 주간 콘텐츠 캘린더 (요일×4채널)
// GET  ?week=YYYY-MM-DD → 해당 주(월~일) creator_drafts(version 'milli-v1')
// POST { action, ... }  → save | approve | schedule | publish | delete | generate
// 저장소: Supabase creator_drafts(data JSON). 발행: Zernio /posts.

import { getSupabase } from '../../lib/supabase.js';

export const config = { maxDuration: 120 }; // US 승인 시 드라이브 업로드 포함 가능

const ZERNIO = 'https://zernio.com/api/v1';

// 요일별 슬롯 정의 (2026-06-13 재설계 — 캐러셀 매일 + 릴스 주2[화·금]). 프론트 WEEKDAYS 와 동일하게 유지.
//  캐러셀(매일): 월·금=실후기(Cowork 캡처) · 수=프로모(wed-promo) · 화·목·토·일=정보성꿀팁(carousel-daily)
//  릴스(화·금만): reel:true → shorts-daily(화·금 게이트)
const SLOTS = [
  { key: 'mon', label: '월', slotType: 'review_hook', concept: '실후기 후킹' },
  { key: 'tue', label: '화', slotType: 'info_tip',    concept: '정보성 꿀팁', reel: true },
  { key: 'wed', label: '수', slotType: 'promo',       concept: '프로모(자사몰/아마존)' },
  { key: 'thu', label: '목', slotType: 'info_tip',    concept: '정보성 꿀팁' },
  { key: 'fri', label: '금', slotType: 'review_hook', concept: '실후기 후킹', reel: true },
  { key: 'sat', label: '토', slotType: 'info_tip',    concept: '정보성 꿀팁' },
  { key: 'sun', label: '일', slotType: 'info_tip',    concept: '정보성 꿀팁' },
];

// env 값 끝 개행/공백 방어 (§2 — Vercel env 의 \n 으로 인한 Zernio 발행 실패 차단).
// 실제 토큰/리터럴 '\n'(역슬래시+n)·실개행·따옴표 모두 제거 — Vercel 저장값 오염 방어.
const envTrim = (k, fb = '') => String(process.env[k] ?? fb).replace(/\\[rn]/g, '').replace(/^["'\s]+|["'\s]+$/g, '');

// region → Zernio 프로필 (accounts.js와 동일, Zernio 연결 실측 2026-06-09 일치)
const PROFILE = {
  kr: envTrim('ZERNIO_MILLIMILLI_PROFILE_ID', '69d08cc1986d57bb8f733102'), // @millimilli.kr (IG+TikTok)
  us: envTrim('ZERNIO_MILLIMILLI_US_PROFILE_ID', '69fbfd0692b3d8e85f86d882'), // @millimilli.us (Zernio 실측 — 발행 검증됨)
};
// ⚠️ Zernio 발행 platforms[].accountId = '소셜 계정(account) _id' (프로필 id 아님!).
//   /v1/accounts 실측(2026-06-15): 프로필 id 를 보내면 "accounts do not belong to this user" 거부됨.
//   region+platform 별 정확한 account _id 로 매핑.
const ACCOUNTS = {
  kr: {
    instagram: envTrim('ZERNIO_MILLI_KR_IG_ACCOUNT_ID', '69fbfc1992b3d8e85f86d277'),
    tiktok:    envTrim('ZERNIO_MILLI_KR_TT_ACCOUNT_ID', '69d08d11bf4d9161df546260'),
  },
  us: {
    instagram: envTrim('ZERNIO_MILLI_US_IG_ACCOUNT_ID', '69fbfd0692b3d8e85f86d882'),
    // millimilli.us TikTok 계정 없음 → Zernio 자동발행 불가(드라이브 수동발행 경로).
  },
};

// 채널별 발행 라우팅 (§12 유저 확정 2026-06-09 + Zernio 연결 실측 2026-06-09):
//  kr_ig/kr_tt → @millimilli.kr Zernio 자동
//  us_ig       → @millimilli.us Zernio 자동 (Zernio가 IG 토큰으로 서버 발행 → 호출자 egress 무관).
//                ※ US_IG_PUBLISH=drive 로 두면 검증 전까지 드라이브 폴백.
//  us_tt       → Zernio 미연결(US TikTok Shop 기기+IP 필요) → to-drive 수동.
function publishRoute(channel) {
  if (channel === 'us_tt') return 'drive';
  if (channel === 'us_ig') return envTrim('US_IG_PUBLISH', 'auto') === 'drive' ? 'drive' : 'zernio';
  return 'zernio'; // kr_ig, kr_tt
}

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
  // accountId = region+platform 별 소셜 계정 _id (draft.accountId 명시값 우선). 프로필 id 폴백 금지(거부됨).
  const pid = (draft.accountId || ACCOUNTS[draft.region]?.[draft.platform] || '').trim();
  if (!pid) {
    draft.status = 'failed';
    draft.error = `Zernio 발행 계정 없음 (${draft.region}/${draft.platform}) — 수동 발행 대상이거나 계정 미연결`;
    return { ok: false, error: draft.error, code: 400 };
  }
  // Zernio /v1/posts (검증 2026-06-14): 본문=content(text 아님), platforms[].accountId=소셜 계정 ID 필수,
  //   publishNow:true 없으면 무조건 draft 로 저장됨(게시 안 됨).
  let body;
  if (draft.platform === 'tiktok') {
    // 틱톡 포토: content=슬라이드 제목(90자 자동잘림) + platformSpecificData.description=전체 캡션(별도 칸).
    const coverHead = draft.slides?.[0]?.headline?.text
      || (typeof draft.slides?.[0]?.headline === 'string' ? draft.slides[0].headline : '')
      || (draft.caption || '').split('\n')[0] || '';
    const title = String(coverHead).slice(0, 88);
    body = {
      content: title,
      platforms: [{ platform: 'tiktok', accountId: pid, platformSpecificData: { description: text } }],
      publishNow: true,
      ...(mediaItems.length && { mediaItems }),
    };
  } else {
    body = {
      content: text,
      platforms: [{ platform: draft.platform, accountId: pid }],
      publishNow: true,
      ...(mediaItems.length && { mediaItems }),
    };
  }
  if (dryRun) return { ok: true, dryRun: true, body };
  const result = await zPost(body);
  if (result.error || (result.message && /error/i.test(result.message))) {
    draft.status = 'failed'; draft.error = result.error || result.message;
    return { ok: false, error: draft.error, result, code: 500 };
  }
  draft.status = 'published';
  draft.publishedAt = new Date().toISOString();
  draft.publishResult = { postId: result.post?._id || result.post?.id || result._id || result.id, via: 'zernio' };
  return { ok: true, result };
}

// 드래프트 미디어를 드라이브로 업로드하고 draft.drive 기록(카루셀 mediaUrls[] 전부).
async function sendDraftToDrive(draft) {
  const { uploadDraftToDrive } = await import('./to-drive.js');
  const r = await uploadDraftToDrive(draft);
  draft.drive = {
    files: r.files, count: r.count, folderId: r.folderId,
    fileId: r.fileId, link: r.webViewLink, uploadedAt: new Date().toISOString(),
  };
  delete draft.driveError;
  return r;
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
      return res.status(200).json({ drafts, slots: SLOTS });
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
      // wipe: 보드 전체 비우기(milli-v1 전부 삭제). 파괴적이라 CRON_SECRET 게이트.
      if (action === 'wipe') {
        if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
          return res.status(401).json({ error: 'Unauthorized (wipe requires CRON_SECRET)' });
        }
        const { data: rows } = await sb.from('creator_drafts').select('id, data').limit(1000);
        const ids = (rows || []).filter(r => r.data && r.data.version === 'milli-v1').map(r => r.id);
        for (let i = 0; i < ids.length; i += 100) {
          await sb.from('creator_drafts').delete().in('id', ids.slice(i, i + 100));
        }
        return res.status(200).json({ ok: true, deleted: ids.length });
      }

      // copy-to-sibling: 같은 미디어를 형제 채널(IG↔TT, 같은 지역)에 복사. 캡션·해시태그는 독립(따로 편집).
      if (action === 'copy-to-sibling') {
        const srcId = payload.id || payload.draft?.id;
        if (!srcId) return res.status(400).json({ error: 'id 필수' });
        const { data: srcRow } = await sb.from('creator_drafts').select('data').eq('id', srcId).single();
        if (!srcRow) return res.status(404).json({ error: '원본 드래프트 없음' });
        const src = srcRow.data;
        const SIB = { kr_ig: 'kr_tt', kr_tt: 'kr_ig', us_ig: 'us_tt', us_tt: 'us_ig' };
        const sibCh = SIB[src.channel];
        if (!sibCh) return res.status(400).json({ error: '형제 채널 없음' });
        const region = sibCh.startsWith('us') ? 'us' : 'kr';
        const platform = sibCh.endsWith('tt') ? 'tiktok' : 'instagram';
        const media = { mediaUrl: src.mediaUrl || null, mediaUrls: src.mediaUrls || [], refUrl: src.refUrl || null, format: src.format || 'reel', slotType: src.slotType || null };
        const hasMedia = !!(media.mediaUrl || (media.mediaUrls && media.mediaUrls.length) || media.refUrl);
        const { data: rows } = await sb.from('creator_drafts').select('id, data').limit(300);
        const existing = (rows || []).find(r => r.data && r.data.version === 'milli-v1' && r.data.channel === sibCh && r.data.date === src.date);
        if (existing) {
          const d = existing.data;
          Object.assign(d, media); // 미디어만 동기화
          if (!d.caption && src.caption) d.caption = src.caption;       // 캡션 비어있을 때만 시드(이후 독립 편집)
          if (!d.hashtags && src.hashtags) d.hashtags = src.hashtags;
          if (hasMedia && ['draft', 'generating'].includes(d.status)) d.status = 'review';
          d.updatedAt = new Date().toISOString();
          await sb.from('creator_drafts').update({ data: d }).eq('id', existing.id);
          return res.status(200).json({ ok: true, action: 'updated', id: existing.id, draft: d });
        }
        const newId = `milli_${sibCh}_${src.date}_${Date.now().toString(36)}`;
        const draft = {
          id: newId, version: 'milli-v1', channel: sibCh, region, platform, date: src.date,
          ...media, status: hasMedia ? 'review' : 'draft',
          caption: src.caption || '', hashtags: src.hashtags || '', // 초기엔 복사, 이후 채널별로 따로 수정
          profileId: PROFILE[region], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        setSchedule(draft, src.date, src.scheduledLocal?.slice(11, 16) || '09:00');
        await sb.from('creator_drafts').insert({ id: newId, persona_id: null, data: draft });
        return res.status(200).json({ ok: true, action: 'created', id: newId, draft });
      }

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
          // 생성 시 입력한 값(링크·캡션·해시태그) 같이 저장 — 빈 슬롯만 만들고 날리지 않도록
          caption: payload.caption || '', hashtags: payload.hashtags || '', mediaUrl: null, mediaUrls: [],
          refUrl: payload.refUrl ? String(payload.refUrl).trim() : null, // shorts 레퍼런스 유튜브 링크
          profileId: PROFILE[region],
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        setSchedule(draft, payload.date, payload.time || '09:00'); // 입력 시각 or 기본 09:00
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
        // shorts 레퍼런스 유튜브 링크(데일리 작업이 video_analysis→제품화). 빈 문자열이면 null(라이브러리 폴백)
        if (payload.refUrl !== undefined) draft.refUrl = payload.refUrl ? String(payload.refUrl).trim() : null;
        draft.updatedAt = new Date().toISOString();
      };

      if (action === 'delete') {
        await sb.from('creator_drafts').delete().eq('id', id);
        return res.status(200).json({ ok: true, deleted: id });
      }

      if (action === 'save')     { patchMeta(); }
      if (action === 'approve')  {
        patchMeta(); draft.status = 'approved';
        // 드라이브 라우팅 채널(us_tt, 옵션상 us_ig)은 승인 시 미디어를 드라이브로 자동 업로드(수동 발행용).
        // 카루셀이면 mediaUrls[] 전부 올림. 실패해도 승인은 유지.
        if (publishRoute(draft.channel) === 'drive' && (draft.mediaUrl || draft.mediaUrls?.length)) {
          try { await sendDraftToDrive(draft); }
          catch (e) { draft.driveError = e.message; console.error('[approve→drive]', e.message); }
        }
      }
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
        // 수동 채널(us_tt 등)은 Zernio 미발행 → 드라이브 업로드만(유저가 미국 VPN으로 직접 게시).
        if (publishRoute(draft.channel) === 'drive') {
          try {
            await sendDraftToDrive(draft);
            draft.status = 'approved'; // 실제 게시는 유저 수동 → approved 유지 + 드라이브 링크 제공
          } catch (e) {
            draft.driveError = e.message;
            await sb.from('creator_drafts').update({ data: draft }).eq('id', id);
            return res.status(500).json({ error: `드라이브 업로드 실패: ${e.message}` });
          }
          await sb.from('creator_drafts').update({ data: draft }).eq('id', id);
          return res.status(200).json({ ok: true, route: 'drive', manual: true, drive: draft.drive, draft });
        }
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

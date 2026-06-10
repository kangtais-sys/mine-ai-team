// #2 — US 드래프트 영상을 구글 드라이브 폴더에 업로드 (폰에서 받아 수동 발행용).
// 미국 인스타/틱톡샵은 미국 기기+IP 필수라 자동 발행 불가 → 영상을 드라이브로 올려두면
// 유민혜가 폰 드라이브 앱에서 받아 미국 VPN 으로 직접 게시.
import { google } from 'googleapis';
import { Readable } from 'stream';
import { promises as dns } from 'dns';
import { Redis } from '@upstash/redis';
import { getGoogleRefreshToken } from '../utils/google-auth.js';

export const config = { maxDuration: 120 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const FOLDER_NAME = '밀리밀리 US 수동발행';
const CH_LABEL = { us_ig: 'US-IG', us_tt: 'US-TT', kr_ig: 'KR-IG', kr_tt: 'KR-TT' };

// SSRF 가드 — 우리 서버가 mediaUrl 을 직접 fetch 하므로 공개 https 만 허용(내부/사설 IP 차단).
function ipv4ToInt(h) {
  if (/^\d+$/.test(h)) return Number(h) >>> 0;
  if (/^0x[0-9a-f]+$/i.test(h)) return parseInt(h, 16) >>> 0;
  if (/^0[0-7]+$/.test(h)) return parseInt(h, 8) >>> 0;
  const p = h.split('.');
  if (p.length === 4 && p.every(x => /^\d+$/.test(x) && +x < 256)) return ((+p[0] << 24) | (+p[1] << 16) | (+p[2] << 8) | +p[3]) >>> 0;
  return null;
}
function isPrivateV4Int(n) {
  const a = (n >>> 24) & 255, b = (n >>> 16) & 255;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
}
function isPrivateAddr(address, family) {
  if (family === 4) { const n = ipv4ToInt(address); return n == null || isPrivateV4Int(n); }
  const a = (address || '').toLowerCase();
  return a === '::1' || a === '::' || /^(f[cd][0-9a-f]{2}:|fe80:)/.test(a) || /^::ffff:/.test(a);
}
// SSRF — https 강제 + 호스트를 실제 DNS 해석해 사설/내부 IP 로 풀리면 거부.
async function isSafePublicHttpsUrl(u) {
  let url; try { url = new URL(u); } catch { return false; }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost') return false;
  // 리터럴 IP 즉시 검사
  const litV4 = ipv4ToInt(host);
  if (litV4 != null) return !isPrivateV4Int(litV4);
  if (host.includes(':')) return !isPrivateAddr(host, 6);
  // 호스트명 → 전체 IP 해석 후 하나라도 사설이면 거부
  let addrs; try { addrs = await dns.lookup(host, { all: true }); } catch { return false; }
  if (!addrs.length) return false;
  return !addrs.some(a => isPrivateAddr(a.address, a.family));
}

async function getDrive() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI,
  );
  oauth2Client.setCredentials({ refresh_token: await getGoogleRefreshToken() });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

async function findOrCreateFolder(drive) {
  const cached = await redis.get('creator:us-drive-folder').catch(() => null);
  if (cached) return cached;
  const found = await drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  let id = found.data.files?.[0]?.id;
  if (!id) {
    const f = await drive.files.create({
      requestBody: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    });
    id = f.data.id;
  }
  await redis.set('creator:us-drive-folder', id, { ex: 60 * 60 * 24 * 30 });
  return id;
}

// 단일 URL → 드라이브 업로드 1건. 반환 { fileId, webViewLink }
async function uploadOneToDrive(drive, folderId, url, { draft, index, total }) {
  if (!(await isSafePublicHttpsUrl(url))) throw new Error(`안전하지 않은 URL(공개 https 아님): ${url}`);
  // 미디어 받아서 스트림 업로드. 리다이렉트는 수동 처리(내부 호스트 우회 방지).
  const resp = await fetch(url, { redirect: 'manual' });
  if (resp.status >= 300 && resp.status < 400) throw new Error(`리다이렉트 거부(${resp.status}) — 직접 URL 필요`);
  if (!resp.ok || !resp.body) throw new Error(`미디어 fetch 실패: ${resp.status}`);
  const mimeType = resp.headers.get('content-type') || 'application/octet-stream';
  const ext = /\.(mp4|mov|webm|m4v|jpg|jpeg|png|webp)(\?|$)/i.exec(url)?.[1] || (mimeType.includes('image') ? 'jpg' : 'mp4');

  const capShort = (draft.caption || '').replace(/[\\/:*?"<>|\n]/g, ' ').trim().slice(0, 30) || '무제';
  const seq = total > 1 ? ` ${String(index + 1).padStart(2, '0')}-${total}` : '';
  const name = `[${CH_LABEL[draft.channel] || draft.channel}] ${draft.date}${seq} ${capShort}.${ext}`;
  const description = [
    draft.caption || '',
    draft.hashtags || '',
    `— 채널: ${CH_LABEL[draft.channel] || draft.channel} / 날짜: ${draft.date} / 예약: ${draft.scheduledLocal || '-'}${total > 1 ? ` / ${index + 1}/${total}` : ''}`,
  ].filter(Boolean).join('\n\n');

  const file = await drive.files.create({
    requestBody: { name, parents: [folderId], description },
    media: { mimeType, body: Readable.fromWeb(resp.body) },
    fields: 'id, webViewLink',
  });
  return { fileId: file.data.id, webViewLink: file.data.webViewLink };
}

// 드래프트 미디어를 드라이브에 업로드. 카루셀(mediaUrls[])이면 전부 루프, 아니면 단일 mediaUrl.
// 반환 { files:[{fileId, webViewLink}], count, folderId, fileId, webViewLink }(첫 장 = 하위호환).
export async function uploadDraftToDrive(draft) {
  const urls = (Array.isArray(draft?.mediaUrls) && draft.mediaUrls.length)
    ? draft.mediaUrls
    : (draft?.mediaUrl ? [draft.mediaUrl] : []);
  if (!urls.length) throw new Error('mediaUrl/mediaUrls 없음');
  const drive = await getDrive();
  const folderId = await findOrCreateFolder(drive);

  const files = [];
  for (let i = 0; i < urls.length; i++) {
    files.push(await uploadOneToDrive(drive, folderId, urls[i], { draft, index: i, total: urls.length }));
  }
  return { files, count: files.length, folderId, fileId: files[0].fileId, webViewLink: files[0].webViewLink };
}

// 수동 트리거(보드 '드라이브로 보내기' 버튼 등)도 가능하도록 핸들러 제공
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id 필수' });
  try {
    const { getSupabase } = await import('../../lib/supabase.js');
    const sb = getSupabase();
    const { data: row } = await sb.from('creator_drafts').select('data').eq('id', id).single();
    if (!row?.data) return res.status(404).json({ error: '드래프트 없음' });
    const r = await uploadDraftToDrive(row.data);
    const d = row.data;
    d.drive = {
      files: r.files, count: r.count, folderId: r.folderId,
      fileId: r.fileId, link: r.webViewLink, uploadedAt: new Date().toISOString(),
    };
    d.updatedAt = new Date().toISOString();
    await sb.from('creator_drafts').update({ data: d }).eq('id', id);
    return res.status(200).json({ ok: true, drive: d.drive });
  } catch (e) {
    console.error('[to-drive]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// #2 — US 드래프트 영상을 구글 드라이브 폴더에 업로드 (폰에서 받아 수동 발행용).
// 미국 인스타/틱톡샵은 미국 기기+IP 필수라 자동 발행 불가 → 영상을 드라이브로 올려두면
// 유민혜가 폰 드라이브 앱에서 받아 미국 VPN 으로 직접 게시.
import { google } from 'googleapis';
import { Readable } from 'stream';
import { Redis } from '@upstash/redis';
import { getGoogleRefreshToken } from '../utils/google-auth.js';

export const config = { maxDuration: 120 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const FOLDER_NAME = '밀리밀리 US 수동발행';
const CH_LABEL = { us_ig: 'US-IG', us_tt: 'US-TT', kr_ig: 'KR-IG', kr_tt: 'KR-TT' };

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

// 드래프트 영상을 드라이브에 업로드. 반환 { fileId, webViewLink, folderId }
export async function uploadDraftToDrive(draft) {
  if (!draft?.mediaUrl) throw new Error('mediaUrl 없음');
  const drive = await getDrive();
  const folderId = await findOrCreateFolder(drive);

  // 영상 받아서 스트림으로 업로드 (serverless 본문 한도 영향 없음)
  const resp = await fetch(draft.mediaUrl);
  if (!resp.ok || !resp.body) throw new Error(`영상 fetch 실패: ${resp.status}`);
  const mimeType = resp.headers.get('content-type') || 'video/mp4';
  const ext = /\.(mp4|mov|webm|m4v|jpg|jpeg|png)(\?|$)/i.exec(draft.mediaUrl)?.[1] || (mimeType.includes('image') ? 'jpg' : 'mp4');

  const capShort = (draft.caption || '').replace(/[\\/:*?"<>|\n]/g, ' ').trim().slice(0, 30) || '무제';
  const name = `[${CH_LABEL[draft.channel] || draft.channel}] ${draft.date} ${capShort}.${ext}`;
  const description = [
    draft.caption || '',
    draft.hashtags || '',
    `— 채널: ${CH_LABEL[draft.channel] || draft.channel} / 날짜: ${draft.date} / 예약: ${draft.scheduledLocal || '-'}`,
  ].filter(Boolean).join('\n\n');

  const file = await drive.files.create({
    requestBody: { name, parents: [folderId], description },
    media: { mimeType, body: Readable.fromWeb(resp.body) },
    fields: 'id, webViewLink',
  });
  return { fileId: file.data.id, webViewLink: file.data.webViewLink, folderId };
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
    d.drive = { fileId: r.fileId, link: r.webViewLink, uploadedAt: new Date().toISOString() };
    d.updatedAt = new Date().toISOString();
    await sb.from('creator_drafts').update({ data: d }).eq('id', id);
    return res.status(200).json({ ok: true, drive: d.drive });
  } catch (e) {
    console.error('[to-drive]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

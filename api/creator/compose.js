// 영상 합성 — Higgsfield 영상 + TTS 오디오 + ASS 자막 → 최종 MP4
// Google Drive에 저장 → 공개 URL → Zernio로 직접 발행 가능
// POST { draftId }
// Returns { success, videoUrl, draftId }

import { Redis } from '@upstash/redis';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export const config = { maxDuration: 60 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ── 서비스 계정 토큰 (crypto 모듈로 직접 JWT 서명) ──────────────

async function getServiceAccountToken(scope) {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || '';
  // Vercel에서 \n이 이스케이프된 경우와 실제 개행인 경우 모두 처리
  const privateKey = rawKey.replace(/\\n/g, '\n');

  if (!email || !privateKey) throw new Error('GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY 미설정');

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: email, scope, aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  })).toString('base64url');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(privateKey, 'base64url');
  const assertion = `${header}.${payload}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`토큰 오류: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ── Google Drive 업로드 (multipart REST) ──────────────────────────
async function uploadToGoogleDrive(filePath, filename) {
  const token = await getServiceAccountToken('https://www.googleapis.com/auth/drive.file');
  const folderId = process.env.GOOGLE_DRIVE_MEDIA_FOLDER_ID || null;

  // 파일 읽기
  const fileData = await fs.readFile(filePath);

  // multipart 업로드
  const boundary = '----millibound' + Date.now();
  const meta = JSON.stringify({
    name: filename, mimeType: 'video/mp4',
    ...(folderId ? { parents: [folderId] } : {}),
  });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
    fileData,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': body.length,
    },
    body,
  });
  if (!uploadRes.ok) {
    const txt = await uploadRes.text();
    throw new Error(`Drive 업로드 실패 ${uploadRes.status}: ${txt.substring(0, 200)}`);
  }
  const { id: fileId } = await uploadRes.json();

  // 공개 읽기 권한
  const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  if (!permRes.ok) {
    const txt = await permRes.text();
    throw new Error(`권한 설정 실패: ${txt.substring(0, 200)}`);
  }

  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

// ── K-뷰티 스타일 ASS 자막 파일 생성 ──────────────────────────────
// 9:16 세로 포맷, 흰색 굵은 텍스트, 검정 아웃라인, 하단 중앙
function buildAssContent(segments) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,68,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,40,40,80,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  function toAssTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.round((sec - Math.floor(sec)) * 100);
    return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
  }

  const dialogues = segments
    .map(seg => `Dialogue: 0,${toAssTime(seg.startSec)},${toAssTime(seg.endSec)},Default,,0,0,0,,${seg.text}`)
    .join('\n');

  return header + dialogues;
}

// ── FFmpeg 합성 ────────────────────────────────────────────────────
async function composeWithFfmpeg(videoPath, audioPath, assPath, outputPath) {
  const ffmpeg = (await import('fluent-ffmpeg')).default;
  const { path: ffmpegPath } = await import('@ffmpeg-installer/ffmpeg');
  ffmpeg.setFfmpegPath(ffmpegPath);

  return new Promise((resolve, reject) => {
    // assPath에 특수문자 이스케이프
    const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .complexFilter([`[0:v]ass='${escapedAss}'[v]`])
      .outputOptions([
        '-map [v]',
        '-map 1:a',
        '-c:v libx264',
        '-preset ultrafast',
        '-crf 23',
        '-c:a aac',
        '-b:a 128k',
        '-shortest',
        '-movflags +faststart',
        '-y',
      ])
      .output(outputPath)
      .on('start', cmd => console.log('[Compose] FFmpeg 시작:', cmd.substring(0, 120)))
      .on('end', () => { console.log('[Compose] FFmpeg 완료'); resolve(); })
      .on('error', err => { console.error('[Compose] FFmpeg 오류:', err.message); reject(err); })
      .run();
  });
}

// ── Main handler ────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { draftId } = req.body || {};
  if (!draftId) return res.status(400).json({ error: 'draftId 필수' });

  // 드래프트 로드
  const draftRaw = await redis.get(`creator:draft:${draftId}`).catch(() => null);
  if (!draftRaw) return res.status(404).json({ error: '드래프트 없음' });
  const draft = typeof draftRaw === 'string' ? JSON.parse(draftRaw) : draftRaw;

  if (!draft.mediaUrl) return res.status(400).json({ error: 'mediaUrl 없음 — 영상 생성 먼저 필요' });
  if (!draft.audioBase64) return res.status(400).json({ error: 'audioBase64 없음 — 보이스 생성 먼저 필요' });

  // 자막 세그먼트 로드
  const subRaw = await redis.get(`creator:subtitles:${draftId}`).catch(() => null);
  const subData = subRaw ? (typeof subRaw === 'string' ? JSON.parse(subRaw) : subRaw) : null;
  const segments = subData?.segments || draft.subtitleSegments || [];

  const safeId = draftId.replace(/[^a-z0-9-]/gi, '').substring(0, 40);
  const videoPath  = `/tmp/${safeId}_src.mp4`;
  const audioPath  = `/tmp/${safeId}.mp3`;
  const assPath    = `/tmp/${safeId}.ass`;
  const outputPath = `/tmp/${safeId}_composed.mp4`;

  const cleanup = async () => {
    for (const p of [videoPath, audioPath, assPath, outputPath]) {
      await fs.unlink(p).catch(() => {});
    }
  };

  try {
    // 1. 소스 영상 다운로드 (CloudFront)
    console.log('[Compose] 영상 다운로드 중...');
    const videoRes = await fetch(draft.mediaUrl, { signal: AbortSignal.timeout(20000) });
    if (!videoRes.ok) throw new Error(`영상 다운로드 실패: ${videoRes.status}`);
    await fs.writeFile(videoPath, Buffer.from(await videoRes.arrayBuffer()));

    // 2. 오디오 base64 → MP3 파일
    await fs.writeFile(audioPath, Buffer.from(draft.audioBase64, 'base64'));

    // 3. ASS 자막 파일 생성
    await fs.writeFile(assPath, buildAssContent(segments), 'utf8');

    // 4. FFmpeg 합성 (영상 + 오디오 + 자막)
    console.log('[Compose] FFmpeg 합성 시작...');
    await composeWithFfmpeg(videoPath, audioPath, assPath, outputPath);

    // 5. Google Drive 업로드 → 공개 URL
    console.log('[Compose] Google Drive 업로드 중...');
    const filename = `milli_${safeId}_${Date.now()}.mp4`;
    const publicUrl = await uploadToGoogleDrive(outputPath, filename);
    console.log('[Compose] Google Drive 완료:', publicUrl.substring(0, 60));

    // 6. 드래프트 업데이트 (composedVideoUrl + status: review)
    const updatedDraft = {
      ...draft,
      composedVideoUrl: publicUrl,
      mediaUrl: publicUrl,   // Zernio publish.js가 mediaUrl을 사용하므로 동기화
      status: 'review',
      updatedAt: new Date().toISOString(),
    };
    await redis.set(`creator:draft:${draftId}`, updatedDraft, { ex: 86400 * 30 });

    // 7. /tmp 정리
    await cleanup();

    return res.status(200).json({ success: true, videoUrl: publicUrl, draftId });
  } catch (e) {
    console.error('[Creator Compose]', e.message);
    await cleanup().catch(() => {});

    // 드래프트 실패 처리
    const failed = { ...draft, status: 'failed', error: `합성 실패: ${e.message}`, updatedAt: new Date().toISOString() };
    await redis.set(`creator:draft:${draftId}`, failed, { ex: 86400 * 30 }).catch(() => {});

    return res.status(500).json({ error: e.message });
  }
}

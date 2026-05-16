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

// ── OAuth 액세스 토큰 (GOOGLE_REFRESH_TOKEN) ──────────────────────
async function getOAuthToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`OAuth 토큰 오류: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ── Google Drive 업로드 (OAuth, 사용자 Drive) ──────────────────────
async function uploadToGoogleDrive(filePath, filename) {
  const token = await getOAuthToken();
  // 폴더 없이 root에 업로드 (폴더 접근 이슈 우회)
  const folderId = null;

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

// ── BGM 트랙 선택 (콘텐츠 기둥/감정에 따라) ─────────────────────────
// /public/bgm/ 에 호스팅된 Pixabay CC0 트랙 (상업용 무료)
const BGM_TRACKS = {
  calm:   '/public/bgm/lofi-calm.mp3',   // 성분/정보 콘텐츠 — 차분한 lofi
  beats:  '/public/bgm/lofi-beats.mp3',  // 트렌드/흥미 콘텐츠 — 비트 lofi
  jazz:   '/public/bgm/lofi-jazz.mp3',   // 제품 리뷰 — 재즈 lofi
  paris:  '/public/bgm/lofi-paris.mp3',  // 기본 fallback — 감성 lofi
};

function selectBgmTrack(draft) {
  const pillar = draft.detectedPillar || draft.pillar || '';
  const script = (draft.script || '').toLowerCase();
  if (pillar === 'trend' || script.includes('트렌드') || script.includes('요즘')) return BGM_TRACKS.beats;
  if (pillar === 'treatment' || pillar === 'behind') return BGM_TRACKS.jazz;
  if (pillar === 'ingredient' || script.includes('성분')) return BGM_TRACKS.calm;
  return BGM_TRACKS.paris;
}

// ── FFmpeg 합성 ────────────────────────────────────────────────────
// HeyGen 영상에는 이미 오디오가 포함되어 있으므로 audioPath는 선택적
// 자막은 drawtext 필터로 렌더링 (ASS 필터 대신 — 폰트 의존성 없음)
async function composeWithFfmpeg(videoPath, audioPath, segments, outputPath, bgmPath, isHeyGen = false) {
  const ffmpeg = (await import('fluent-ffmpeg')).default;
  const { path: ffmpegPath } = await import('@ffmpeg-installer/ffmpeg');
  ffmpeg.setFfmpegPath(ffmpegPath);

  // HeyGen 영상은 이미 오디오 포함 → audioPath 없을 때 대비
  const hasExternalAudio = audioPath && await fs.access(audioPath).then(() => true).catch(() => false);
  const hasBgm = bgmPath && await fs.access(bgmPath).then(() => true).catch(() => false);

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg();

    // 입력 스트림
    cmd = cmd.input(videoPath);
    if (hasExternalAudio) cmd = cmd.input(audioPath);
    if (hasBgm) cmd = cmd.input(bgmPath);

    // 자막 drawtext 필터 체인 구성 (시스템 폰트 사용)
    // 텍스트 이스케이프: FFmpeg drawtext는 :, ', \\ 등을 이스케이프해야 함
    const escapeDrawtext = (str) =>
      (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:');

    let filterChain = '[0:v]';

    // 색감 보정 (따뜻한 톤 + 살짝 대비 강화 — AI 영상 특유의 평탄한 색감 보정)
    const colorFilter = `eq=saturation=1.15:contrast=1.05:brightness=0.02`;

    // HeyGen 영상: 자체 모션 있음 → zoompan 제외 (프레임레이트 변환으로 인한 길이 왜곡 방지)
    // Higgsfield 영상: 정적 이미지 → zoompan 줌인 효과 적용
    const zoomFilter = isHeyGen
      ? null  // HeyGen은 zoompan 없이 원본 프레임레이트 유지
      : `zoompan=z='if(lte(on\\,48)\\,1+0.04*(on/48)\\,1.04)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=24`;

    // 번들 폰트 경로 (한국어 지원 NanumGothicBold)
    const fontPath = path.join(process.cwd(), 'public/fonts/NanumGothicBold.ttf');
    const fontExists = await fs.access(fontPath).then(() => true).catch(() => false);
    const fontParam = fontExists ? `:fontfile='${fontPath.replace(/'/g, "'\\\\''")}'` : '';
    if (!fontExists) console.warn('[Compose] NanumGothicBold.ttf 없음 — 시스템 기본 폰트 사용 (한국어 깨질 수 있음)');

    if (segments && segments.length > 0) {
      const drawtextFilters = segments.map((seg) => {
        const txt = escapeDrawtext(seg.text);
        const start = parseFloat(seg.startSec) || 0;
        const end = parseFloat(seg.endSec) || start + 1;
        // 흰 텍스트 + 두꺼운 검정 외곽선 + 하단 중앙 (바이럴 숏츠 스타일)
        return `drawtext=text='${txt}'${fontParam}:enable='between(t\\,${start}\\,${end})':fontsize=68:fontcolor=white:bordercolor=black:borderw=5:x=(w-text_w)/2:y=h*0.80:line_spacing=10`;
      });

      if (zoomFilter) {
        filterChain = `[0:v]${zoomFilter},${colorFilter},${drawtextFilters.join(',')}[v]`;
      } else {
        filterChain = `[0:v]${colorFilter},${drawtextFilters.join(',')}[v]`;
      }
    } else {
      // 자막 없어도 색보정 적용 (zoompan은 HeyGen 여부에 따라)
      if (zoomFilter) {
        filterChain = `[0:v]${zoomFilter},${colorFilter}[v]`;
      } else {
        filterChain = `[0:v]${colorFilter}[v]`;
      }
    }

    // BGM 믹싱 설정
    const bgmInputIdx = hasExternalAudio ? 2 : 1;  // BGM 입력 스트림 인덱스
    let audioFilterStr = '';
    let audioMapOpt = '';

    if (hasBgm) {
      const voiceSrc = hasExternalAudio ? '[1:a]' : '[0:a]';
      // BGM: 볼륨 12% + 루프 (영상 길이에 맞게), 보이스와 믹스
      audioFilterStr = `${voiceSrc}volume=1.0[voice];[${bgmInputIdx}:a]volume=0.12,aloop=loop=-1:size=2e+09[bgm];[voice][bgm]amix=inputs=2:duration=first[aout]`;
      audioMapOpt = '-map [aout]';
    } else {
      audioMapOpt = hasExternalAudio ? '-map 1:a' : '-map 0:a?';
    }

    const outputOpts = [
      '-map [v]',
      audioMapOpt,
      '-c:v libx264',
      '-preset ultrafast',
      '-crf 22',
      '-c:a aac',
      '-b:a 128k',
      '-shortest',
      '-movflags +faststart',
      '-y',
    ];

    // 비디오 + 오디오 필터를 하나의 complexFilter로 합치기
    const fullFilter = audioFilterStr ? `${filterChain};${audioFilterStr}` : filterChain;

    cmd
      .complexFilter(fullFilter)
      .outputOptions(outputOpts)
      .output(outputPath)
      .on('start', c => console.log('[Compose] FFmpeg 시작:', c.substring(0, 150)))
      .on('end', () => { console.log('[Compose] FFmpeg 완료'); resolve(); })
      .on('error', err => { console.error('[Compose] FFmpeg 오류:', err.message); reject(err); })
      .run();
  });
}

// ── Main handler ────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { draftId, noSubtitles } = req.body || {};
  if (!draftId) return res.status(400).json({ error: 'draftId 필수' });

  // 드래프트 로드
  const draftRaw = await redis.get(`creator:draft:${draftId}`).catch(() => null);
  if (!draftRaw) return res.status(404).json({ error: '드래프트 없음' });
  const draft = typeof draftRaw === 'string' ? JSON.parse(draftRaw) : draftRaw;

  if (!draft.mediaUrl) return res.status(400).json({ error: 'mediaUrl 없음 — 영상 생성 먼저 필요 (HeyGen 또는 Higgsfield)' });
  // HeyGen 영상에는 이미 오디오가 내장됨 — audioBase64 없어도 자막 합성 가능
  const isHeyGen = draft.videoEngine === 'heygen';

  // 자막 세그먼트 로드 (noSubtitles=true로 디버그용 스킵 가능)
  let segments = [];
  if (!noSubtitles) {
    const subRaw = await redis.get(`creator:subtitles:${draftId}`).catch(() => null);
    const subData = subRaw ? (typeof subRaw === 'string' ? JSON.parse(subRaw) : subRaw) : null;
    segments = subData?.segments || draft.subtitleSegments || [];
  }
  console.log(`[Compose] segments: ${segments.length}개, isHeyGen: ${isHeyGen}, noSubtitles: ${!!noSubtitles}`);

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

    // 2. 오디오 처리
    // HeyGen 영상은 이미 오디오 포함 → 별도 오디오 불필요
    // Higgsfield 영상은 무음 → ElevenLabs 오디오 병합 필요
    if (!isHeyGen && draft.audioBase64) {
      await fs.writeFile(audioPath, Buffer.from(draft.audioBase64, 'base64'));
    }

    // 3. FFmpeg 합성 (자막 drawtext 방식 + BGM 믹싱)
    console.log('[Compose] FFmpeg 합성 시작 (drawtext 자막 + BGM)...');
    const audioForMerge = (!isHeyGen && draft.audioBase64) ? audioPath : null;
    // BGM 트랙 선택 (콘텐츠 기둥/스크립트 감정에 따라)
    const bgmRelPath = selectBgmTrack(draft);
    const bgmAbsPath = path.join(process.cwd(), bgmRelPath);
    const bgmPath = await fs.access(bgmAbsPath).then(() => bgmAbsPath).catch(() => null);
    if (bgmPath) console.log('[Compose] BGM 트랙:', path.basename(bgmPath));
    await composeWithFfmpeg(videoPath, audioForMerge, segments, outputPath, bgmPath, isHeyGen);

    // 5. preview 모드: 영상 파일을 직접 응답 (Drive 업로드 없이 품질 확인용)
    const isPreview = req.query?.preview === 'true';
    if (isPreview) {
      console.log('[Compose] Preview 모드 — 파일 직접 응답');
      const fileData = await fs.readFile(outputPath);
      await cleanup();
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `inline; filename="preview_${safeId}.mp4"`);
      res.setHeader('Content-Length', fileData.length);
      return res.status(200).end(fileData);
    }

    // 5b. Google Drive 업로드 → 공개 URL
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

// 로컬 검증: 오버레이 PNG 렌더 + 실제 cloudfront 영상에 ffmpeg 합성 → 프레임 추출.
import { promises as fs } from 'fs';
import { renderOverlayPng, composeOverlay } from '../api/creator/overlay-short.js';

const footageUrl = 'https://d8j0ntlcm91z4.cloudfront.net/user_38PAdEfRanROtVrNU82Klb8ZOSl/hf_20260610_061107_4fc846b2-3829-4dc5-ba3d-64b9b2b2ef5b.mp4';
const circle_xy = { x: 560, y: 820, w: 380, h: 320 };
const captions = [
  { text: '팔자, 주름인 줄 알았죠?', top: 150, size: 62 },
  { text: "사실 '건조'였어요 🫧", top: 240, size: 52, color: '#FFE9A8' },
  { text: '1+1 · 24,900원', top: 1660, size: 58 },
  { text: 'AI 연출 · 임상 입증 범위 내', top: 1830, size: 26, color: '#D6D6D6' },
];

console.log('1) 오버레이 PNG 렌더...');
const png = await renderOverlayPng({ circle_xy, captions });
await fs.writeFile('/tmp/ovl.png', png);
console.log('   /tmp/ovl.png', (png.length / 1024).toFixed(0) + 'KB');

console.log('2) footage 다운로드...');
const r = await fetch(footageUrl);
await fs.writeFile('/tmp/src.mp4', Buffer.from(await r.arrayBuffer()));

console.log('3) ffmpeg overlay 합성...');
await composeOverlay('/tmp/src.mp4', '/tmp/ovl.png', '/tmp/out.mp4', { mute: false });
const st = await fs.stat('/tmp/out.mp4');
console.log('   /tmp/out.mp4', (st.size / 1024).toFixed(0) + 'KB');

console.log('4) 프레임 추출(중간)...');
const { execFileSync } = await import('child_process');
const { default: ffPath } = await import('ffmpeg-static');
execFileSync(ffPath, ['-y', '-ss', '3', '-i', '/tmp/out.mp4', '-frames:v', '1', '/tmp/overlay_frame.jpg']);
console.log('DONE → /tmp/overlay_frame.jpg');

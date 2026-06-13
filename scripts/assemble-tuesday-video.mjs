#!/usr/bin/env node
/**
 * 화요일 영상 자동 합치기 — 분사 before/after 영상 + 주차 사진컷(스틸) + 자막(선택) + BGM(선택) → 9:16 mp4
 *
 * 실행 환경: 유민혜 맥 / Claude Code (Higgsfield CDN 접근 가능한 곳). Cowork sandbox는 cloudfront 차단이라 여기선 못 돎.
 * 의존: ffmpeg (brew install ffmpeg), node 18+.
 *
 * 동작: 분사 영상의 "중간 확대 구간"에서 잘라, 그 자리에 1·2·3·4 WEEK 스틸을 각각 짧은 사진컷으로 끼워넣고
 *       다시 분사 영상 뒷부분(after)으로 이어붙임. 주차 자막/펜체크는 스틸에 이미 박혀있으므로 그대로 들어감.
 *       선택적으로 훅/ CTA 자막 burn-in + 로열티프리 BGM 합성.
 *
 * ⚠️ 음악: 저작권 있는 곡 굽지 말 것(신고/차단 리스크). 로열티프리·라이선스 음원만. 트렌딩 사운드는 틱톡 앱에서 입히는 게 안전·유리.
 *
 * 사용법:
 *   node assemble-tuesday-video.mjs
 *   (아래 CONFIG의 URL/경로만 그 주 자산으로 교체. Higgsfield 생성물 rawUrl 또는 로컬 파일경로 둘 다 가능.)
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── CONFIG (그 주 자산으로 교체) ──────────────────────────────
const HF = 'https://d8j0ntlcm91z4.cloudfront.net/user_38PAdEfRanROtVrNU82Klb8ZOSl'; // 2026-06-10 생성 자산
const CONFIG = {
  // 분사 before/after 영상 (seedance, 15s, 9:16 — "spritzes a fine cool mist → glass-skin glow")
  sprayVideo: `${HF}/hf_20260610_061107_4fc846b2-3829-4dc5-ba3d-64b9b2b2ef5b.mp4`,
  weekStills: [ // 1·2·3·4 WEEK 스틸 (nano_banana_2, 라벨·펜체크 박힘). 순서 중요.
    `${HF}/hf_20260610_071838_e75467df-d800-431c-91cf-d0d09d94cada.png`, // 1 WEEK
    `${HF}/hf_20260610_071842_439b35bc-8e40-4c82-9b3d-4f85b2e79d32.png`, // 2 WEEK
    `${HF}/hf_20260610_071845_12730cc2-e027-44ff-b062-5ef1e719e6ce.png`, // 3 WEEK
    `${HF}/hf_20260610_071848_92176e9c-4cdd-4c50-bbe6-3de47b7a9aa9.png`, // 4 WEEK
  ],
  insertAtSec: null,   // 사진컷 삽입 지점(초). null = 영상 길이의 50%.
  stillSec: 0.9,       // 주차 사진컷 1장당 노출 시간(초).
  bgm: '',             // 로열티프리 BGM 파일 경로(선택). '' 이면 영상 원음(AI 생성 오디오) 유지 — 저작권 안전.
  bgmVolume: 0.5,
  hookText: '',        // 선택: 첫 1.5초 상단에 burn-in 할 훅 자막(없으면 생략). 스틸 라벨과 별개.
  ctaText: '',         // 선택: 마지막 1.5초 하단 CTA 자막.
  fontFile: '/Users/yuminhye/Library/Fonts/Pretendard-Bold.otf', // 브랜드 한글 폰트(있음). 없으면 /System/Library/Fonts/AppleSDGothicNeo.ttc
  out: join(process.cwd(), 'tuesday_final.mp4'),
  W: 1080, H: 1920, FPS: 30,
};

const TMP = mkdtempSync(join(tmpdir(), 'tue-'));
const sh = (c) => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const fetchTo = (src, dst) => {
  if (existsSync(src)) { sh(`cp "${src}" "${dst}"`); return dst; }
  sh(`curl -fsSL "${src}" -o "${dst}"`); // 맥에선 cloudfront 도달 가능
  return dst;
};
const FILL = `scale=${CONFIG.W}:${CONFIG.H}:force_original_aspect_ratio=increase,crop=${CONFIG.W}:${CONFIG.H},setsar=1`;
const ENC = '-c:v libx264 -crf 20 -preset veryfast -pix_fmt yuv420p -r ' + CONFIG.FPS;

// 1) 자산 다운로드
const spray = fetchTo(CONFIG.sprayVideo, join(TMP, 'spray.mp4'));
const stills = CONFIG.weekStills.map((u, i) => fetchTo(u, join(TMP, `wk${i + 1}.png`)));

// 2) 분사 영상 길이 → 삽입 지점
const dur = parseFloat(sh(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${spray}"`).trim());
const insertT = CONFIG.insertAtSec ?? +(dur * 0.5).toFixed(2);
console.log(`spray dur=${dur}s, insert at ${insertT}s`);

// 3) 분사 영상 9:16 정규화 + A/B 분할 (오디오 포함)
sh(`ffmpeg -y -i "${spray}" -t ${insertT} -vf "${FILL}" ${ENC} -c:a aac "${TMP}/A.mp4"`);
sh(`ffmpeg -y -ss ${insertT} -i "${spray}" -vf "${FILL}" ${ENC} -c:a aac "${TMP}/B.mp4"`);

// 4) 주차 스틸 → 짧은 사진컷(무음, 살짝 줌)
stills.forEach((p, i) => {
  const z = `scale=${CONFIG.W * 1.05}:${CONFIG.H * 1.05},crop=${CONFIG.W}:${CONFIG.H}`;
  // 입력 2개(스틸 + 무음)를 먼저, 출력 옵션(-vf/-c:v/-c:a)을 뒤로 — ffmpeg 옵션은 해당 파일 앞에 와야 함.
  sh(`ffmpeg -y -loop 1 -t ${CONFIG.stillSec} -i "${p}" -f lavfi -t ${CONFIG.stillSec} -i anullsrc=r=44100:cl=stereo -vf "${FILL},${z}" ${ENC} -c:a aac -shortest "${TMP}/wk${i + 1}.mp4"`);
});

// 5) concat: A + 1·2·3·4week + B
const list = join(TMP, 'list.txt');
sh(`printf "file '%s'\\n" "${TMP}/A.mp4" "${TMP}/wk1.mp4" "${TMP}/wk2.mp4" "${TMP}/wk3.mp4" "${TMP}/wk4.mp4" "${TMP}/B.mp4" > "${list}"`);
sh(`ffmpeg -y -f concat -safe 0 -i "${list}" -c:v libx264 -crf 20 -preset veryfast -pix_fmt yuv420p -c:a aac "${TMP}/joined.mp4"`);

// 6) 선택 자막(훅/CTA) burn-in
let cur = `${TMP}/joined.mp4`;
const dt = [];
if (CONFIG.hookText) dt.push(`drawtext=fontfile='${CONFIG.fontFile}':text='${CONFIG.hookText}':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=140:enable='lt(t,1.6)'`);
if (CONFIG.ctaText) dt.push(`drawtext=fontfile='${CONFIG.fontFile}':text='${CONFIG.ctaText}':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=h-260:enable='gt(t,${'${DURm}'})'`);
if (dt.length) { sh(`ffmpeg -y -i "${cur}" -vf "${dt.join(',')}" ${ENC} -c:a copy "${TMP}/capt.mp4"`); cur = `${TMP}/capt.mp4`; }

// 7) 선택 BGM 합성(로열티프리만!) — 영상 길이에 맞춰 페이드아웃
if (CONFIG.bgm) {
  sh(`ffmpeg -y -i "${cur}" -i "${CONFIG.bgm}" -filter_complex "[1:a]volume=${CONFIG.bgmVolume},afade=t=in:st=0:d=0.4[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest "${CONFIG.out}"`);
} else {
  sh(`cp "${cur}" "${CONFIG.out}"`);
}
console.log('DONE →', CONFIG.out);

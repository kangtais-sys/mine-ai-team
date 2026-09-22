#!/usr/bin/env node
// 프레임 추출기 — 영상의 시각 구조를 눈으로 확인하기 위한 도구.
//
// 왜 필요한가: 우리는 영상을 직접 못 본다(Claude·Codex·Aside 모두 mp4 입력 불가).
//   커버(draft_cover.jpg)는 첫 프레임뿐이라 중간 컷을 못 본다.
//   → 프레임을 뽑아 이미지로 만들면 그때부터 볼 수 있다.
//
// ⭐ 핵심: CapCut 프로젝트는 **컷 타이밍을 알고 있다**(draft_info.json).
//   고정 간격(N초마다)으로 뽑으면 컷 경계를 놓치고 중복이 생긴다.
//   컷마다 정확히 1장씩 뽑으면 장수가 최소이면서 구조가 다 보인다 — 비전 토큰도 최소.
//
// 사용법:
//   node scripts/extract-frames.mjs --project "0616 (2)-복사"      # 컷마다 1장
//   node scripts/extract-frames.mjs --video ~/Downloads/x.mp4      # 기본 2초 간격
//   node scripts/extract-frames.mjs --video x.mp4 --every 1.5
//   옵션: --width 540(기본) --out <디렉터리> --list

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const FFMPEG = require('@ffmpeg-installer/ffmpeg').path;
const DRAFTS = path.join(os.homedir(), 'Movies/CapCut/User Data/Projects/com.lveditor.draft');

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? (argv[i + 1] ?? true) : d; };
const has = (k) => argv.includes(`--${k}`);

// 비전 입력 비용은 픽셀 수에 비례한다. 구조 파악엔 540px 이면 충분 —
// 원본 1080 으로 뽑으면 장당 토큰이 4배가 되고 얻는 게 없다.
const WIDTH = Number(arg('width', 540));

function run(args) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  return { code: r.status, err: (r.stderr || '').trim() };
}

function ffmpegFrame(src, timeSec, dest) {
  // -ss 를 -i 앞에 두면 키프레임 탐색(빠름). 컷 중간을 노리므로 정확도 손실은 무관.
  let r = run(['-ss', String(timeSec), '-i', src, '-frames:v', '1', '-vf', `scale=${WIDTH}:-2`, '-q:v', '4', '-y', dest]);
  if (r.code === 0 && fs.existsSync(dest)) return { ok: true };

  // 정지 이미지(HEIC/JPG/PNG)는 길이가 없어 -ss 탐색이 끝을 넘어가 빈 출력이 된다.
  // 시간 지정 없이 한 장만 뽑는다. (CapCut 은 사진도 클립으로 쓴다 — 실제로 2건이 이 경우였음)
  r = run(['-i', src, '-frames:v', '1', '-vf', `scale=${WIDTH}:-2`, '-q:v', '4', '-y', dest]);
  if (r.code === 0 && fs.existsSync(dest)) return { ok: true, note: '정지이미지' };

  return { ok: false, err: r.err.split('\n').pop()?.slice(0, 100) || 'ffmpeg 실패' };
}

function listProjects() {
  if (!fs.existsSync(DRAFTS)) { console.error('CapCut 프로젝트 폴더 없음:', DRAFTS); process.exit(1); }
  return fs.readdirSync(DRAFTS)
    .filter(d => !d.startsWith('.') && fs.existsSync(path.join(DRAFTS, d, 'draft_info.json')));
}

// ── 모드 A: CapCut 프로젝트 → 컷마다 1프레임 ──
function fromProject(name, outDir) {
  const dir = path.join(DRAFTS, name);
  const f = path.join(dir, 'draft_info.json');
  if (!fs.existsSync(f)) { console.error('프로젝트 없음:', name); process.exit(1); }
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const vids = Object.fromEntries((j.materials?.videos || []).map(v => [v.id, v]));

  // 영상 트랙의 세그먼트 = 컷. 타임라인 순서대로.
  const segs = (j.tracks || [])
    .filter(t => t.type === 'video')
    .flatMap(t => t.segments || [])
    .sort((a, b) => a.target_timerange.start - b.target_timerange.start);

  fs.mkdirSync(outDir, { recursive: true });
  const rows = [];
  segs.forEach((seg, i) => {
    const mat = vids[seg.material_id];
    const src = mat?.path;
    const tStart = seg.target_timerange.start / 1e6;              // 타임라인 위치(표시용)
    const sMid = (seg.source_timerange.start + seg.source_timerange.duration / 2) / 1e6; // 소스 내 중간
    const n = String(i + 1).padStart(2, '0');
    const dest = path.join(outDir, `${n}_t${tStart.toFixed(1)}s.jpg`);

    if (!src || !fs.existsSync(src)) {
      // 원본이 iOS 앨범 참조이거나 지워진 경우 — 조용히 넘기지 않고 남긴다.
      rows.push({ cut: i + 1, at: tStart.toFixed(1) + 's', status: '원본없음', src: src || '(경로없음)' });
      return;
    }
    const r = ffmpegFrame(src, sMid, dest);
    rows.push({ cut: i + 1, at: tStart.toFixed(1) + 's', status: r.ok ? (r.note ? '✅ '+r.note : '✅') : '실패: ' + r.err, file: r.ok ? dest : null });
  });
  return rows;
}

// ── 모드 B: 영상 파일 → 고정 간격 ──
function fromVideo(src, every, outDir) {
  if (!fs.existsSync(src)) { console.error('파일 없음:', src); process.exit(1); }
  const probe = spawnSync(FFMPEG, ['-hide_banner', '-i', src], { encoding: 'utf8' });
  const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(probe.stderr || '');
  const dur = m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) : 0;
  if (!dur) { console.error('길이를 못 읽음'); process.exit(1); }

  fs.mkdirSync(outDir, { recursive: true });
  const rows = [];
  let i = 0;
  for (let t = 0.3; t < dur; t += every) {         // 0초는 검은 프레임인 경우가 많아 0.3부터
    const n = String(++i).padStart(2, '0');
    const dest = path.join(outDir, `${n}_t${t.toFixed(1)}s.jpg`);
    const r = ffmpegFrame(src, t, dest);
    rows.push({ cut: i, at: t.toFixed(1) + 's', status: r.ok ? '✅' : '실패', file: r.ok ? dest : null });
  }
  console.log(`영상 길이 ${dur.toFixed(1)}초 · ${every}초 간격`);
  return rows;
}

// ── 실행 ──
if (has('list')) {
  const ps = listProjects();
  console.log(`CapCut 프로젝트 ${ps.length}개`);
  ps.forEach(p => console.log('  ', p));
  process.exit(0);
}

const project = arg('project');
const video = arg('video');
if (!project && !video) {
  console.log(`프레임 추출기

  --project <이름>   CapCut 프로젝트 → 컷마다 1프레임 (권장)
  --video <파일>     영상 파일 → 고정 간격
  --every <초>       간격 (기본 2)
  --width <px>       가로 크기 (기본 540 — 비전 토큰 절약)
  --out <디렉터리>   출력 위치 (기본 /tmp/frames/<이름>)
  --list             프로젝트 목록

예) node scripts/extract-frames.mjs --list
    node scripts/extract-frames.mjs --project "0616 (2)-복사"`);
  process.exit(0);
}

const label = project || path.basename(String(video)).replace(/\.[^.]+$/, '');
const outDir = String(arg('out', path.join('/tmp/frames', label.replace(/[^\w가-힣().-]/g, '_'))));
const rows = project
  ? fromProject(String(project), outDir)
  : fromVideo(String(video).replace(/^~/, os.homedir()), Number(arg('every', 2)), outDir);

const ok = rows.filter(r => r.file);
console.log(`\n출력: ${outDir}`);
console.log(`프레임 ${ok.length}/${rows.length}장`);
for (const r of rows) {
  console.log(`  컷${String(r.cut).padStart(2)} @${r.at.padStart(7)}  ${r.status}${r.src ? '  ' + r.src : ''}`);
}
if (ok.length) console.log(`\n파일 목록:\n${ok.map(r => r.file).join('\n')}`);

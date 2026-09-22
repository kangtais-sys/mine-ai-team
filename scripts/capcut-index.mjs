#!/usr/bin/env node
// CapCut 프로젝트 인덱서 — 편집 내용을 구조화해 앱으로 보낸다.
//
// 왜 로컬 스크립트인가: CapCut 프로젝트 파일은 이 맥에만 있다(~/Movies/CapCut).
//   서버는 접근할 수 없으므로 여기서 읽어 앱에 POST 한다.
//
// 읽는 것: draft_info.json — 컷 타이밍·자막·BGM·전환·효과·캔버스.
//   (subdraft/ 하위의 draft_content.json 은 중첩 클립이라 메인이 아니다.)
//
// 사용:
//   node scripts/capcut-index.mjs                 # 인덱스만 출력
//   node scripts/capcut-index.mjs --json out.json # 파일로
//   CRON_SECRET=... node scripts/capcut-index.mjs --sync [--dry]   # 앱으로 전송 → 시트 편입

import fs from 'fs';
import path from 'path';
import os from 'os';

const DRAFTS = path.join(os.homedir(), 'Movies/CapCut/User Data/Projects/com.lveditor.draft');
const BASE = process.env.APP_BASE_URL || 'https://mine-ai-team.vercel.app';
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? (argv[i + 1] ?? true) : d; };
const has = (k) => argv.includes(`--${k}`);

// 어필리에이트·B2B·타제품은 광고 소재가 아니다 — MINE 확인(2026-09-22).
const EXCLUDE = /어필리에이트|brand deal|아마존 리뷰|프라임데이|대기업|money back|affiliate|바인|립펜슬|오버립|립스틱/i;

function readProjects() {
  if (!fs.existsSync(DRAFTS)) { console.error('CapCut 폴더 없음:', DRAFTS); process.exit(1); }
  const out = [];
  for (const dir of fs.readdirSync(DRAFTS)) {
    if (dir.startsWith('.')) continue;
    const f = path.join(DRAFTS, dir, 'draft_info.json');
    if (!fs.existsSync(f)) continue;
    let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }

    const m = j.materials || {};
    const texts = (m.texts || []).map(t => {
      let c = t.content;
      try { c = JSON.parse(c).text || ''; } catch { /* 평문인 경우 그대로 */ }
      return String(c).replace(/\s+/g, ' ').trim();
    }).filter(Boolean);

    const aud = (m.audios || []).map(a => ({ name: a.name || String(a.path || '').split('/').pop(), type: a.type }));
    const vt = (j.tracks || []).filter(t => t.type === 'video');
    const cuts = vt.reduce((s, t) => s + (t.segments || []).length, 0);
    const dur = Number(((j.duration || 0) / 1e6).toFixed(1));
    const blob = texts.join(' ');

    if (!cuts || !dur) continue;                 // 빈 프로젝트
    if (EXCLUDE.test(blob)) continue;            // 광고 소재 아님

    out.push({
      project: dir,
      editedAt: fs.statSync(f).mtime.toISOString().slice(0, 10),
      canvas: `${j.canvas_config?.width || 0}x${j.canvas_config?.height || 0}`,
      durationSec: dur,
      cuts,
      texts,
      hook: texts[0] || null,                    // 첫 자막 = 훅
      music: [...new Set(aud.filter(a => a.type === 'music').map(a => a.name))],
      sfx: [...new Set(aud.filter(a => a.type && a.type !== 'music').map(a => a.name))],
      transitions: [...new Set((m.transitions || []).map(t => t.name))],
      effects: [...new Set((m.video_effects || []).map(e => e.name))],
      lang: /[가-힣]/.test(blob) ? 'kr' : 'us',
      coverPath: fs.existsSync(path.join(DRAFTS, dir, 'draft_cover.jpg')) ? path.join(DRAFTS, dir, 'draft_cover.jpg') : null,
    });
  }
  return out.sort((a, b) => a.editedAt.localeCompare(b.editedAt));
}

const projects = readProjects();
console.log(`CapCut 광고 소재 ${projects.length}건 (KR ${projects.filter(p => p.lang === 'kr').length} · US ${projects.filter(p => p.lang === 'us').length})`);

const outFile = arg('json');
if (outFile) { fs.writeFileSync(String(outFile), JSON.stringify(projects, null, 1)); console.log('저장:', outFile); }

if (has('sync')) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { console.error('CRON_SECRET 필요'); process.exit(1); }
  const url = `${BASE}/api/content/capcut-sync${has('dry') ? '?dry=1' : ''}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ projects }),
  });
  const d = await r.json();
  console.log('\n', JSON.stringify(d, null, 1));
} else if (!outFile) {
  projects.slice(0, 8).forEach(p => console.log(` ${p.editedAt} ${String(p.cuts).padStart(2)}컷 ${String(p.durationSec).padStart(5)}초 ${p.lang.toUpperCase()} | ${(p.hook || '').slice(0, 50)}`));
}

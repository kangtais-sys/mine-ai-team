#!/usr/bin/env node
// scripts/upload-carousel.mjs — 로컬 카루셀 업로더 (§12 협업 모델: Cowork=생성 / 로컬=업로드 / 유저=승인)
//
// Cowork 가 출력한 manifest.json 을 읽어
//   1) 각 PNG 를 POST /api/creator/ingest-capture (base64→Blob) 로 호스팅 → mediaUrls[] 확보
//   2) POST /api/creator/ingest 로 보드 드래프트 시드(format:'cardnews', status:'review')
// 한다. 라이브 앱(mine-ai-team.vercel.app)에 직접 붙으므로 반드시 유저 맥/Claude Code 측에서 실행.
//
// 사용:  node scripts/upload-carousel.mjs <manifest.json> [--dry] [--base https://mine-ai-team.vercel.app]
//   manifest 는 객체 1개 또는 객체 배열(채널별 여러 개) 모두 허용.
//
// 필요 env(.env.local 또는 셸): CREATOR_INGEST_SECRET (Vercel 동기화됨). BASE_URL 로 대상 변경 가능.
//
// manifest 포맷:
// { "channel":"kr_ig", "date":"2026-06-09", "format":"cardnews",
//   "slotType":"monday_value_carousel",
//   "images":["/abs/monday_kr_FINAL_01.png", ... "07.png"],
//   "caption":"…", "hashtags":"#…", "scheduledLocal":"09:00" }

import { readFile } from 'node:fs/promises';
import { resolve, dirname, isAbsolute, basename } from 'node:path';
import { existsSync } from 'node:fs';

// ── .env.local 로드(있으면) ──
try {
  const dotenv = await import('dotenv');
  for (const f of ['.env.local', '.env']) if (existsSync(f)) dotenv.config({ path: f });
} catch { /* dotenv 없으면 셸 env 사용 */ }

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const baseIdx = args.indexOf('--base');
const BASE = (baseIdx >= 0 ? args[baseIdx + 1] : process.env.BASE_URL) || 'https://mine-ai-team.vercel.app';
const manifestPath = args.find(a => !a.startsWith('--') && a !== (baseIdx >= 0 ? args[baseIdx + 1] : undefined));

const SECRET = (process.env.CREATOR_INGEST_SECRET || '').replace(/\\[rn]/g, '').trim();
const CHANNELS = ['kr_ig', 'kr_tt', 'us_ig', 'us_tt'];

function die(msg) { console.error(`\n❌ ${msg}\n`); process.exit(1); }

if (!manifestPath) die('manifest 경로 필요.  예: node scripts/upload-carousel.mjs ./manifest.json');
if (!SECRET) die('CREATOR_INGEST_SECRET 없음 — .env.local 에 추가했는지 확인(Vercel 동기화 값).');

// 버퍼 매직바이트 → mime (ingest-capture allowlist: jpeg/png/webp)
function sniffMime(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${text.slice(0, 300)}`);
  return json;
}

// 이미지 1장 호스팅 → url
async function hostImage(absPath, label) {
  if (!existsSync(absPath)) throw new Error(`파일 없음: ${absPath}`);
  const buf = await readFile(absPath);
  if (!buf.length) throw new Error(`빈 파일: ${absPath}`);
  if (buf.length > 4 * 1024 * 1024) throw new Error(`4MB 초과(${(buf.length / 1048576).toFixed(1)}MB) — 캡처 품질 낮춰서: ${basename(absPath)}`);
  const mime = sniffMime(buf);
  if (!mime) throw new Error(`허용 안 되는 형식(png/jpeg/webp만): ${basename(absPath)}`);
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
  const { url, bytes } = await post('/api/creator/ingest-capture', { dataUrl, label });
  console.log(`   ✓ ${basename(absPath)} → ${(bytes / 1024).toFixed(0)}KB  ${url}`);
  return url;
}

async function processManifest(m, manifestDir, idx) {
  const tag = `[${idx}] ${m.channel} ${m.date}`;
  if (!m.channel || !m.date) throw new Error(`${tag}: channel·date 필수`);
  if (!CHANNELS.includes(m.channel)) throw new Error(`${tag}: channel 값 오류(${m.channel}) — ${CHANNELS.join('|')}`);
  const images = Array.isArray(m.images) ? m.images : [];
  if (!images.length) throw new Error(`${tag}: images[] 비어있음`);

  console.log(`\n▶ ${tag} — 이미지 ${images.length}장 호스팅`);
  const mediaUrls = [];
  for (let i = 0; i < images.length; i++) {
    const p = isAbsolute(images[i]) ? images[i] : resolve(manifestDir, images[i]);
    const label = `${m.channel}_${m.date}_${String(i + 1).padStart(2, '0')}`;
    mediaUrls.push(await hostImage(p, label));
  }

  const body = {
    channel: m.channel, date: m.date,
    mediaUrls,
    caption: m.caption || '', hashtags: m.hashtags || '',
    format: m.format || 'cardnews',
    slotType: m.slotType || null,
    status: m.status || 'review',
  };
  if (m.scheduledLocal) body.scheduledLocal = m.scheduledLocal; // ingest 가 무시해도 무해(향후 확장용)

  if (DRY) { console.log(`   (dry) ingest 본문:`, JSON.stringify(body).slice(0, 200), '…'); return { dry: true, ...body }; }
  const res = await post('/api/creator/ingest', body);
  console.log(`   ★ 보드 시드 완료 — action=${res.action} id=${res.id} status=${res.draft?.status}`);
  return res;
}

(async () => {
  console.log(`업로더 시작 — BASE=${BASE}${DRY ? '  [DRY RUN]' : ''}`);
  const raw = await readFile(resolve(manifestPath), 'utf8');
  const parsed = JSON.parse(raw);
  const manifests = Array.isArray(parsed) ? parsed : [parsed];
  const manifestDir = dirname(resolve(manifestPath));

  const results = [];
  for (let i = 0; i < manifests.length; i++) {
    try { results.push(await processManifest(manifests[i], manifestDir, i + 1)); }
    catch (e) { console.error(`   ❌ ${e.message}`); results.push({ error: e.message }); }
  }

  const ok = results.filter(r => r && !r.error).length;
  console.log(`\n완료: ${ok}/${manifests.length} 채널 시드됨.`);
  if (!DRY && ok) console.log(`→ 보드에서 확인: ${BASE}/#creator (검토 대기 'review' 드래프트)`);
  process.exit(results.some(r => r?.error) ? 1 : 0);
})().catch(e => die(e.message));

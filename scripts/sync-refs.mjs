// 레퍼 동기화 — 로컬 assets/{brand-look,products,scene}/* → Vercel Blob(refs/<cat>/) 업로드 → lib/ref-manifest.js 생성.
//   추가 방법: 폴더에 이미지 넣고 `node scripts/sync-refs.mjs` 실행. 멱등(같은 파일명=같은 URL, 덮어쓰기).
//   인증: .env.local 의 BLOB_READ_WRITE_TOKEN.
import fs from 'fs';
import path from 'path';
import { put } from '@vercel/blob';

const ROOT = path.resolve(import.meta.dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
for (const l of env.split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim(); }

const CATS = { brandLook: 'brand-look', product: 'products', scene: 'scene' };
const CT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const out = { brandLook: [], product: [], scene: [] };

for (const [key, dir] of Object.entries(CATS)) {
  const abs = path.join(ROOT, 'assets', dir);
  if (!fs.existsSync(abs)) continue;
  const files = fs.readdirSync(abs).filter(f => CT[path.extname(f).toLowerCase()]);
  for (const f of files) {
    const buf = fs.readFileSync(path.join(abs, f));
    const blob = await put(`refs/${dir}/${f}`, buf, {
      access: 'public', contentType: CT[path.extname(f).toLowerCase()],
      addRandomSuffix: false, allowOverwrite: true,
    });
    out[key].push(blob.url);
    console.log(`  ${dir}/${f} → ${blob.url}`);
  }
  console.log(`[${dir}] ${out[key].length}장`);
}

const banner = '// 자동 생성(scripts/sync-refs.mjs) — 직접 수정 금지. 레퍼 추가는 assets/ 폴더 + 재실행.\n';
const body = `export const brandLook = ${JSON.stringify(out.brandLook, null, 2)};\nexport const product = ${JSON.stringify(out.product, null, 2)};\nexport const scene = ${JSON.stringify(out.scene, null, 2)};\n`;
fs.writeFileSync(path.join(ROOT, 'lib', 'ref-manifest.js'), banner + body);
console.log('→ lib/ref-manifest.js 작성 완료');

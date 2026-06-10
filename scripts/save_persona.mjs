import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import fs from 'fs';

// Load env from .env.local
const env = Object.fromEntries(
  fs.readFileSync('/Users/yuminhye/mine-ai-team/.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      let v = l.slice(i + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      return [l.slice(0, i).trim(), v];
    })
);

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BUCKET = 'creator-library';
const IDENTITY = 'mine-primary';

// v6 (final approved)
const CF_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_38PAdEfRanROtVrNU82Klb8ZOSl/hf_20260523_135430_f79ea65e-2482-4b69-b28f-8471f325fddf.png';

const personaId = randomUUID();
const ts = Date.now();
const path = `${IDENTITY}/persona/${personaId}/canonical-front-${ts}.jpeg`;

console.log(`[1/3] Downloading from CloudFront...`);
const imgRes = await fetch(CF_URL);
if (!imgRes.ok) {
  console.error(`Fetch failed: ${imgRes.status}`);
  process.exit(1);
}
const buf = Buffer.from(await imgRes.arrayBuffer());
console.log(`     ${buf.length} bytes`);

console.log(`[2/3] Uploading to Supabase storage: ${path}`);
const { error: upErr } = await sb.storage
  .from(BUCKET)
  .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
if (upErr) {
  console.error('Upload failed:', upErr.message);
  process.exit(1);
}

const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
const publicUrl = pub.publicUrl;
console.log(`     ${publicUrl}`);

console.log(`[3/3] Inserting creator_personas record...`);
const data = {
  id: personaId,
  version: 'v3',
  engine: 'soul',
  identityId: IDENTITY,
  name: 'MINE 페르소나',
  soulId: '67c4bcbf-8637-4fbf-8b43-3ae1a9ab48cd',
  candidates: [
    { angle: 'front', label: '정면 무표정', url: publicUrl, path },
  ],
  canonical: { angle: 'front', url: publicUrl, path },
  // Lineage trail for future scene generation
  lineage: {
    source: 'b5ed03fd-440d-4a98-b13e-ad29ed02a4ee',
    seed: 2092914475,
    edits: ['mole-add', 'skin-lighten', 'aegyo-sal', 'hair-blacken'],
  },
  createdAt: new Date().toISOString(),
};

const { error: insErr } = await sb
  .from('creator_personas')
  .insert({ id: personaId, data });

if (insErr) {
  console.error('Insert failed:', insErr.message);
  process.exit(1);
}

console.log(`\nSUCCESS`);
console.log(`personaId: ${personaId}`);
console.log(`canonical: ${publicUrl}`);

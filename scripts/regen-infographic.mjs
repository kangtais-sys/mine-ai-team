// 기존 카루셀(날짜)의 본문을 인포그래픽으로 재생성(커버·마무리·사진 유지) — bodyOnly 와 동일 로직.
//   dry:  node scripts/regen-infographic.mjs 2026-06-20            → KR 7장 /tmp 출력만
//   push: node scripts/regen-infographic.mjs 2026-06-20 --push      → 그 날짜 4채널 DB 반영
//   range:node scripts/regen-infographic.mjs 2026-06-20:2026-06-28 --push
import fs from 'fs';
for (const f of ['.env', '.env.local']) {
  try { for (const line of fs.readFileSync('./' + f, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
}
const arg = process.argv[2] || '';
const PUSH = process.argv.includes('--push');
const [d0, d1] = arg.includes(':') ? arg.split(':') : [arg, arg];
if (!/^\d{4}-\d{2}-\d{2}$/.test(d0)) { console.error('날짜 인자 필요 (YYYY-MM-DD 또는 시작:끝)'); process.exit(1); }
const dates = []; { let d = d0; while (d <= d1) { dates.push(d); const nx = new Date(d + 'T00:00:00Z'); nx.setUTCDate(nx.getUTCDate() + 1); d = nx.toISOString().slice(0, 10); } }

const { genSlides, translateSlidesToEn, PRODUCTS, KEYWORDS } = await import('../api/cron/carousel-daily.js');
const { loadFonts, bakePng, renderSlide } = await import('../api/creator/render-card.js');
const { createClient } = await import('@supabase/supabase-js');
const { put } = await import('@vercel/blob');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
const fonts = await loadFonts();
const hl = s => (typeof s.headline === 'object' && s.headline) ? (s.headline.text || '') : (s.headline || '');

const { data: allRows } = await sb.from('creator_drafts').select('id,data').limit(3000);
const rowsByDate = (date) => (allRows || []).map(r => ({ id: r.id, ...r.data })).filter(d => d.version === 'milli-v1' && d.date === date && (d.slotType || '') === 'info_tip');

async function bake(slides, market, id) {
  const urls = [];
  for (let i = 0; i < slides.length; i++) urls.push(null);
  for (let i = 0; i < slides.length; i++) {
    const png = await bakePng(renderSlide(slides[i], market), fonts);
    if (!PUSH) { fs.writeFileSync(`/tmp/regen-${id}-${i + 1}.png`, png); urls[i] = `/tmp/regen-${id}-${i + 1}.png`; continue; }
    const blob = await put(`cardnews/regen-${id}-${i + 1}.png`, png, { access: 'public', contentType: 'image/png', addRandomSuffix: true });
    urls[i] = blob.url;
  }
  return urls;
}

for (const date of dates) {
  const drafts = rowsByDate(date);
  if (!drafts.length) { console.log(date, '없음 — 스킵'); continue; }
  const krSrc = drafts.find(d => d.channel === 'kr_ig') || drafts.find(d => (d.region || '') === 'kr') || drafts[0];
  const keyword = krSrc.keyword || '스킨케어 루틴';
  const kwObj = KEYWORDS.find(k => (typeof k === 'string' ? k : k.kw) === keyword);
  const product = PRODUCTS[(kwObj && kwObj.p) || 'mist'] || PRODUCTS.mist;
  const axis = krSrc.axis || '발견';
  console.log(`\n=== ${date} kw=${keyword} axis=${axis} product=${product.name} ===`);
  const krBody = await genSlides('kr', keyword, null, axis, '', product, { bodyOnly: true });
  console.log('KR body types:', krBody.slides.map(s => s.type).join(', '));
  krBody.slides.forEach((s, i) => console.log(`  [${i + 1}] ${s.type} | ${hl(s).slice(0, 42)}`));

  if (!PUSH) {
    // dry: KR 풀세트(cover + body + cta) /tmp 출력
    const cover = krSrc.slides[0], cta = krSrc.slides[krSrc.slides.length - 1];
    const full = [cover, ...krBody.slides, cta];
    const urls = await bake(full, 'kr', date);
    console.log('DRY 출력:', urls.join('\n  '));
    continue;
  }

  // push: 4채널 — US 는 번역본, 각 채널 자기 cover/cta 유지
  let enBody;
  try { enBody = await translateSlidesToEn({ slides: krBody.slides, caption: '', hashtags: '' }); }
  catch (e) { console.warn('translate 실패(KR 폴백):', e.message); enBody = krBody; }
  for (const d of drafts) {
    const old = Array.isArray(d.slides) ? d.slides : [];
    if (old.length < 2) { console.log(' ', d.channel, 'cover/cta 없음 스킵'); continue; }
    const isUs = (d.region || '') === 'us' || String(d.channel).startsWith('us');
    const body = isUs ? enBody.slides : krBody.slides;
    const newSlides = [old[0], ...body, old[old.length - 1]];
    const urls = await bake(newSlides, isUs ? 'us' : 'kr', `${d.id}`);
    const rowId = d.id;
    const data = { ...d }; // ⚠️ id 포함 유지 (data.id 빠지면 보드 발행/승인 'id 필수' 실패)
    data.slides = newSlides; data.slidesRaw = JSON.parse(JSON.stringify(newSlides));
    data.mediaUrls = urls; data.format = 'cardnews'; data.infographic = true; data.updatedAt = new Date().toISOString();
    const { error } = await sb.from('creator_drafts').update({ data }).eq('id', rowId);
    console.log(' ', d.channel, error ? 'ERR ' + error.message : `updated (${urls.length}장)`);
  }
}
console.log('\ndone', PUSH ? '(PUSHED)' : '(DRY)');

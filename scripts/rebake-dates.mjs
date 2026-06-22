// 지정 날짜 카루셀을 로컬에서 재베이킹(LLM·사진 없이) — render-card 가드 적용분 반영.
//   타임라인 big 한글 누수('1단계' 등) 정리용. 잘못된 big 은 stored slides 에서도 제거.
//   실행: node scripts/rebake-dates.mjs 2026-06-20 2026-06-21 ...   (날짜 여러 개)
import fs from 'fs';
for (const f of ['.env', '.env.local']) { try { for (const l of fs.readFileSync('./' + f, 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {} }
const dates = process.argv.slice(2).filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!dates.length) { console.error('날짜 인자 필요'); process.exit(1); }
const { loadFonts, bakePng, renderSlide } = await import('../api/creator/render-card.js');
const { createClient } = await import('@supabase/supabase-js');
const { put } = await import('@vercel/blob');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
const fonts = await loadFonts();
const badBig = (b) => { const s = String(b ?? '').trim(); return s && !(/\d/.test(s) && !/단계|step/i.test(s)); };

const { data } = await sb.from('creator_drafts').select('id,data').limit(3000);
for (const date of dates) {
  const drafts = (data || []).map(r => ({ id: r.id, ...r.data })).filter(d => d.version === 'milli-v1' && d.date === date && (d.slotType || '') === 'info_tip');
  if (!drafts.length) { console.log(date, '없음'); continue; }
  for (const d of drafts) {
    const isUs = (d.region || '') === 'us' || String(d.channel).startsWith('us');
    const slides = Array.isArray(d.slides) ? d.slides : [];
    if (!slides.length) { console.log(' ', d.channel, 'slides 없음'); continue; }
    // 잘못된 big 정리(stored data)
    let cleaned = 0;
    for (const s of slides) if (Array.isArray(s.steps)) for (const st of s.steps) if (badBig(st.big)) { delete st.big; delete st.bigUnit; cleaned++; }
    // 재베이킹
    const urls = [];
    for (let i = 0; i < slides.length; i++) {
      const png = await bakePng(renderSlide(slides[i], isUs ? 'us' : 'kr'), fonts);
      const blob = await put(`cardnews/rebake-${d.id}-${i + 1}.png`, png, { access: 'public', contentType: 'image/png', addRandomSuffix: true });
      urls.push(blob.url);
    }
    const rowId = d.id;
    const nd = { ...d }; // ⚠️ id 포함 유지 — data.id 빠지면 보드 발행/승인이 'id 필수'로 실패
    nd.slides = slides; nd.mediaUrls = urls; nd.updatedAt = new Date().toISOString();
    const { error } = await sb.from('creator_drafts').update({ data: nd }).eq('id', rowId);
    console.log(' ', date, d.channel, error ? 'ERR ' + error.message : `재베이킹 ${urls.length}장 (big정리 ${cleaned})`);
  }
}
console.log('done');

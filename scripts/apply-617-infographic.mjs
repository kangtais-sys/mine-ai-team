// 6/17 "바디 탄력" 캐러셀 본문 5장을 인포그래픽으로 교체 → 7장 풀세트 베이킹.
//   기본(드라이): /tmp 에만 PNG 출력(로컬 확인용).
//   --push      : Blob 업로드 + Supabase 6/17 KR(kr_ig·kr_tt) draft.mediaUrls/slides 갱신(보드 반영).
//   실행: node scripts/apply-617-infographic.mjs [--push]
import fs from 'fs';
// .env.local → process.env (Blob/Supabase 토큰)
for (const line of fs.readFileSync('./.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const PUSH = process.argv.includes('--push');
const { loadFonts, bakePng, renderSlide } = await import('../api/creator/render-card.js');
const { renderInfoChart, renderInfoVs, renderInfoTimeline, renderInfoCause, renderInfoMistake } = await import('./lib-infographic.mjs');

// ── 인포그래픽 데이터 (6/17 실제 본문 텍스트 보존, 시각 구조만 부여) ──
const info01 = renderInfoChart({
  num: '01', headline: '탄력은 왜 20대부터 빠져나갈까',
  yLabel: '피부 탄력·콜라겐 지표', yHint: '(20대=100 기준)',
  chart: [{ x: '20대 초', y: 100 }, { x: '20대 중반', y: 92 }, { x: '30대', y: 72 }, { x: '40대', y: 50 }],
  markerIdx: 1, markerNote: '20대 중반, 여기서부터 조용히 꺾인다',
  chips: [
    { k: '콜라겐 감소', t: '합성량이 매년 줄어 피부 밀도 저하' },
    { k: '엘라스틴 손상', t: '자외선·마찰·수면부족이 섬유 끊음' },
    { k: '수분 감소', t: '진피 히알루론산 줄어 두께 얇아짐' },
  ],
  takeaway: '탄력 저하는 표면이 아닌 **진피에서 시작**된다',
});
const info02 = renderInfoVs({
  num: '02', headline: '바디 탄력, 얼굴과 달라야 하는 이유',
  colA: { label: '얼굴' }, colB: { label: '바디' },
  rows: [
    { metric: '각질층 두께', a: { viz: { type: 'bar', val: 0.35 }, word: '얇다' }, b: { viz: { type: 'bar', val: 0.9 }, word: '두껍다 — 흡수에 시간 필요' } },
    { metric: '피지선 밀도 (자체 유분)', a: { viz: { type: 'dots', filled: 5, total: 6 }, word: '높음' }, b: { viz: { type: 'dots', filled: 2, total: 6 }, word: '낮음 — 수분 먼저 증발' } },
    { metric: '핵심 전략', a: { word: '흡수가 빠름' }, b: { word: '도포 후 성분 밀착이 관건' } },
  ],
  takeaway: '바디엔 **바디에 맞는 밀착 전략**이 필요하다',
});
const info03 = renderInfoTimeline({
  num: '03', headline: '탄력 케어, 이 순서가 효과를 결정한다',
  steps: [
    { big: '3분', bigUnit: '골든타임', k: '샤워 직후 3분 이내 도포', t: '각질층이 수분을 머금은 직후라 **성분 침투율이 가장 높다**.' },
    { k: '안에서 바깥으로 원 그리며', t: '복부·허벅지는 안에서 바깥 방향 마사지가 **림프 순환을 도와 흡수를 높인다**.' },
  ],
  takeaway: '타이밍과 방향이 **흡수율**을 바꾼다',
});
const info04 = renderInfoCause({
  num: '04', headline: '모공과 탄력, 사실 같은 문제였다',
  left: '모공 늘어짐', right: '탄력 저하',
  linkNote: '모공이 늘어져 보이는 주요 원인은 **모공 주변 피부의 탄력 감소**. 결국 피부결·탄력 관리와 한 줄기로 이어진다.',
  cert: { title: '4주 인체적용시험 확인', body: '밀리밀리 앰플 — 피부 리프팅과 모공 부위 탄력 개선을 확인한 제품' },
});
const info05 = renderInfoMistake({
  num: '05', headline: '탄력 케어에서 가장 흔히 저지르는 실수',
  leftLabel: '흔한 실수', rightLabel: '이렇게 하세요',
  rows: [
    { bad: '며칠 만에 효과 기대하고 포기', good: '진피 변화는 **최소 4주** 꾸준히' },
    { bad: '바디엔 자외선 차단 생략', good: '야외 전 **바디도 자외선 차단**' },
    { bad: '건조한데 탄력만 챙김', good: '보습 먼저 — **흡수 경로**부터 열기' },
  ],
  takeaway: '꾸준함과 자외선 차단이 **탄력의 기본**',
});
const INFOGRAPHICS = [info01, info02, info03, info04, info05];

const fonts = await loadFonts();

// 6/17 KR draft 로드(커버·마무리 원본 재사용 + slides 갱신용)
const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
const { data: rows, error } = await sb.from('creator_drafts').select('id,data').limit(2000);
if (error) { console.error('supabase load:', error.message); process.exit(1); }
const krDrafts = (rows || []).map(r => ({ id: r.id, ...r.data })).filter(d => d.version === 'milli-v1' && d.date === '2026-06-17' && (d.slotType || '') === 'info_tip' && (d.region || '') === 'kr');
console.log('KR drafts found:', krDrafts.map(d => d.channel));
const src = krDrafts.find(d => d.channel === 'kr_ig') || krDrafts[0];
if (!src) { console.error('6/17 KR draft 없음'); process.exit(1); }
const cover = src.slides[0];
const cta = src.slides[src.slides.length - 1];
const newSlides = [cover, ...INFOGRAPHICS.map((_, i) => src.slides[i + 1] /* slidesRaw 메타 보존용 자리 */), cta];

// 베이킹: cover(렌더러) + 인포그래픽 5 + cta(렌더러)
const vdoms = [renderSlide(cover, 'kr'), ...INFOGRAPHICS, renderSlide(cta, 'kr')];
const pngs = [];
for (let i = 0; i < vdoms.length; i++) {
  const png = await bakePng(vdoms[i], fonts);
  fs.writeFileSync(`/tmp/card617-${i + 1}.png`, png);
  pngs.push(png);
  console.log('baked /tmp/card617-' + (i + 1) + '.png', png.length, 'b');
}

if (!PUSH) { console.log('\n[DRY] /tmp/card617-1..7.png 확인. 올리려면 --push'); process.exit(0); }

// ── PUSH: Blob 업로드 + Supabase 갱신(kr_ig·kr_tt) ──
const { put } = await import('@vercel/blob');
const stamp = Date.now().toString(36);
const urls = [];
for (let i = 0; i < pngs.length; i++) {
  const blob = await put(`cardnews/617infographic-${stamp}-${i + 1}.png`, pngs[i], { access: 'public', contentType: 'image/png', addRandomSuffix: true });
  urls.push(blob.url);
}
console.log('uploaded', urls.length, 'cards');
// slides 메타: 인포그래픽은 새 type 이라 보드 재베이킹 시 깨질 수 있으니 slidesRaw 는 그대로 두고 mediaUrls 만 교체.
for (const ch of ['kr_ig', 'kr_tt']) {
  const d = krDrafts.find(x => x.channel === ch);
  if (!d) { console.log('skip', ch, '(없음)'); continue; }
  const rowId = d.id;
  const data = { ...d }; // ⚠️ id 포함 유지 (data.id 빠지면 보드 발행/승인 'id 필수' 실패)
  data.mediaUrls = urls;
  data.format = 'cardnews';
  data.status = 'review';
  data.infographic = true; // 표식
  data.updatedAt = new Date().toISOString();
  const { error: uerr } = await sb.from('creator_drafts').update({ data }).eq('id', rowId);
  console.log(ch, uerr ? 'ERR ' + uerr.message : 'updated', rowId);
}
console.log('\n[PUSH] 완료 — 보드 6/17 KR 확인. 첫 카드:', urls[0]);

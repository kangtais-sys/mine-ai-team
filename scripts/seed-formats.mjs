#!/usr/bin/env node
// 포맷 카탈로그 시딩 — docs/ad-creative-system.md 를 데이터로 박는다.
//
// 근거는 전부 실물이다(추정 아님):
//   CapCut 28건 실집행 프로젝트 · ~/mist-ad-c*.png · ~/amp-*.png · render-ad.js 구현 · MINE 확인.
//   근거 없는 유형은 evidence:null + status:'proposed' 로 남겨 unvalidated 에 뜨게 한다.
//
// 사용: CRON_SECRET=... node scripts/seed-formats.mjs [--dry]

const BASE = process.env.APP_BASE_URL || 'https://mine-ai-team.vercel.app';
const SECRET = process.env.CRON_SECRET;
const DRY = process.argv.includes('--dry');

// 전 소재 공통 골격 — 유형마다 반복해 적지 않고 여기 한 번만.
const COMMON_STATIC = '1080×1350(4:5) · Noto Sans KR 단일 · 헤드라인 900(광고 전용) · 흑백만(유채색은 사진뿐) · 모서리 직각 · 손그림 동그라미 검정 1곳 · 하단 블랙 오퍼밴드';
const COMMON_REEL = '1080×1920 · 14.9초 · 8컷(컷당 1.9초) · 하드컷(전환 없음) · BGM 있음/SFX 없음 · 자막 컷마다 1개 · 비교 구조 필수';
const COMPLIANCE = '입증 범위만(24h 보습·결 정돈·팔자/눈가 4주·탄력) · AI 연출 명시 · KR/US 수치 혼용 금지 · 효능 단정 금지';

const formats = [
  // ─────────── 정적 광고 소재 ───────────
  {
    name: '전문가 서사 (Expert Narrative)',
    kind: 'static', angle: 'AUTH', hookType: 'TEXT', lever: 'PROOF',
    summary: '개발자·피부과의사를 전면에 세워 "누가 만들었나"로 신뢰를 연다. 배지가 아니라 인물 서사.',
    beats: ['상단 아이브로우(대문자)', '초대형 헤드라인 + 동그라미 1단어', '서브에 인물 크레덴셜', '좌 인물 / 우 제품컷', '모노스페이스 자격 캡션', '하단 오퍼밴드'],
    hookPatterns: ['Now in ({시장}).', 'By {인물}, the {분야} behind {업적}.', '{국가} {직함}이 만든 {제품}'],
    products: ['MST', 'AMP'], markets: ['kr', 'us'],
    compliance: COMPLIANCE + ' · 인물 실존 크레덴셜만',
    evidence: '광고 소재 28건 중 권위 장치 79%로 최다. 실물 mist-ad-c4-2.png(Now in US / Dr. Joon Lee)',
    status: 'active', source: 'ad-creative-system.md §6 인물 서사형 · mist-ad-c4-*',
  },
  {
    name: '임상 수치 (Clinical Proof)',
    kind: 'static', angle: 'CLI', hookType: 'RESULT', lever: 'PROOF',
    summary: '시험 조건(N명·기간)을 헤드라인에 걸고 수치 리스트로 증명한다.',
    beats: ['헤드라인 = 시험 조건 + 동그라미(기간)', '수치 리스트 100%/±N%', '각 항목 한 줄 설명', '최하단 8pt 근거 각주', '오퍼밴드'],
    hookPatterns: ['{N} women. ({기간}).', '{지표} {수치}% in {기간} — measured, not promised.'],
    products: ['MST', 'AMP'], markets: ['kr', 'us'],
    compliance: COMPLIANCE + ' · 시험기관·N수·p값 각주 필수',
    evidence: '실물 amp-2-clinical.png(20 women/4 weeks/100% 4항목). ⚠️ 같은 파일에서 본문이 배지 뒤로 잘리는 오버플로 발생 — 자동화 시 재현 금지',
    status: 'active', source: 'amp-2-clinical.png',
  },
  {
    name: '비포&애프터 대비 (Before/After Split)',
    kind: 'static', angle: 'BA', hookType: 'SPLIT', lever: 'CONTRAST',
    summary: '좌/우 또는 상/하 분할로 변화를 한 프레임에 넣는다. 부위는 동그라미로 지목.',
    beats: ['헤드라인 + 동그라미 키워드', '좌=비포 / 우=애프터 실사', '변화 부위에 동그라미 지목', '수치 배지(선택)', '오퍼밴드'],
    hookPatterns: ['Korean. ({고민}) secret.', '{고민}, 주름인 줄 알았죠? 사실 {진짜원인}이었어요'],
    products: ['MST', 'AMP'], markets: ['kr', 'us'],
    compliance: COMPLIANCE + ' · 동일 조명·각도 · 보정 금지',
    evidence: '실물 mist-ad-c1-15.png · amp-1-beforeafter.png. 영상 소재에서도 시각 구조 A/B/C로 반복',
    status: 'active', source: 'mist-ad-c1-15.png',
  },
  {
    name: '성분·메커니즘 (Ingredient)',
    kind: 'static', angle: 'TIP', hookType: 'TEXT', lever: 'CURIOSITY',
    summary: '500달톤·32펩타이드 같은 수치로 "왜 되는가"를 설명한다.',
    beats: ['헤드라인 = 메커니즘 한 줄', '성분 다이어그램 또는 수치', '흡수 경로 설명', '오퍼밴드'],
    hookPatterns: ['{수치} {단위}, {왜 중요한지}', 'Most {성분} molecules are too large to {장벽}'],
    products: ['MST', 'AMP'], markets: ['kr', 'us'],
    compliance: COMPLIANCE + ' · 흡수·침투 표현은 입증 범위 내',
    evidence: '실물 amp-4-ingredient.png. US 광고 라이브러리 실집행 카피(200-Dalton micro-proteins / 225,404 ppm)',
    status: 'active', source: 'amp-4-ingredient.png',
  },
  {
    name: '오퍼 전면 (Offer Forward)',
    kind: 'static', angle: 'OFFER', hookType: 'TEXT', lever: 'PROOF',
    summary: '가격·사은품·기한을 주인공으로. 리타겟·프로모 구간용.',
    beats: ['헤드라인 = 오퍼', '제품컷', '기한·수량 한정 표기', '큰 오퍼밴드'],
    hookPatterns: ['1+1 · {가격}', 'Buy the {제품}, get {사은품} free — first {N} orders'],
    products: ['MST', 'AMP', 'SET'], markets: ['kr', 'us'],
    compliance: COMPLIANCE + ' · 가격·기한 정확 · KR 원화 / US 달러 분리',
    evidence: '실물 amp-3-promo.png. US 라이브러리 실집행(Sep 7–30 first 100 orders + Collapy 3D Mask)',
    status: 'active', source: 'amp-3-promo.png',
  },
  {
    name: '랭킹 배지 (Rank Badge)',
    kind: 'static', angle: 'AUTH', hookType: 'TEXT', lever: 'PROOF',
    summary: 'TOP100 AMAZON · #1 OLIVE YOUNG 배지로 신뢰를 준다.',
    beats: ['우측 권위 배지 2단', '헤드라인', '제품컷', '오퍼밴드'],
    hookPatterns: ['#1 at {채널}', 'Top {N} in {카테고리}'],
    products: ['MST', 'AMP'], markets: ['kr', 'us'],
    compliance: COMPLIANCE + ' · 랭킹은 실측 시점 명기',
    evidence: null,
    status: 'cooldown',
    source: 'amp-6-authority.png · ⚠️ 매트릭스 AUTH 앵글 KR 훅률 6.1%로 최하위(소재 6건 투입). 훅으로 쓰지 말고 보조 신뢰 장치로만.',
  },

  // ─────────── 영상 광고 소재 ───────────
  {
    name: '하단 B&A 삽입 릴스',
    kind: 'reel', angle: 'BA', hookType: 'SPLIT', lever: 'CONTRAST',
    summary: '상단 실인물 UGC + 하단 1/3 비포&애프터. 말하는 동안 증거가 계속 보인다.',
    beats: ['0-3s 상단 인물 + 훅 자막, 하단 B&A 노출', '3-8s 제품 들고 설명', '8-12s 사용 시연', '12s- 엔드카드(실제 제품컷 + CTA)'],
    hookPatterns: ["Who's down to try the {제품}? ft. Skipping the {대안} {가격}", '{시술} 안 하고 {결과} 만든 법'],
    products: ['MST', 'AMP'], markets: ['kr', 'us'],
    compliance: COMPLIANCE + ' · 원곡 금지(트렌딩 오디오는 발행 앱에서)',
    evidence: 'CapCut 실집행. 커버 실측 — 상단 인물+동그라미 / 하단 1/3 B&A 2분할',
    status: 'active', source: 'CapCut 0616 (2)-복사',
  },
  {
    name: '전면 좌우 분할 릴스',
    kind: 'reel', angle: 'BA', hookType: 'SPLIT', lever: 'CONTRAST',
    summary: '화면 전체가 좌=칙칙 / 우=글래스스킨. 3초 안에 대비가 끝난다.',
    beats: ['0-3s 전면 분할 + 훅 자막', '3-8s 한쪽 확대', '8-12s 제품 연결', '12s- 엔드카드'],
    hookPatterns: ["Ain't no way this {제품} has {의외의 사실}", '같은 얼굴, 한쪽만 {제품} 썼습니다'],
    products: ['AMP', 'MST'], markets: ['us', 'kr'],
    compliance: COMPLIANCE,
    evidence: 'CapCut 실집행. 커버 실측 — 전면 좌우 분할(좌 칙칙/우 글래스스킨)',
    status: 'active', source: 'CapCut 0616 (2)-복사-복사 (3)-복사 (6)',
  },
  {
    name: 'PIP 삽입 릴스',
    kind: 'reel', angle: 'BA', hookType: 'FACE', lever: 'CONTRAST',
    summary: '큰 얼굴 위에 작은 창으로 다른 컷을 얹어 비교한다.',
    beats: ['0-3s 큰 얼굴 + 훅 자막', '3-8s PIP 등장(비교 컷)', '8-12s 제품', '12s- 엔드카드'],
    hookPatterns: ['Why {대상} glow literally {범위}', '왜 {대상}은 {행동}?'],
    products: ['MST'], markets: ['us', 'kr'],
    compliance: COMPLIANCE,
    evidence: 'CapCut 실집행. 커버 실측 — 큰 얼굴 + PIP 창',
    status: 'active', source: 'CapCut 0616 (2)-복사-복사 (3)-복사 (7)-복사-복사',
  },
  {
    name: '상황극 POV 릴스',
    kind: 'reel', angle: 'POV', hookType: 'SCENE', lever: 'RELATE',
    summary: '공감 상황을 POV로 재현. 기내·병원·사무실 등.',
    beats: ['0-3s 상황 POV 자막', '3-8s 상황 전개', '8-12s 제품이 해결', '12s- 엔드카드'],
    hookPatterns: ['POV: {상황}', 'Mid-{상황}, {제3자}가 {반응}했다'],
    products: ['MST', 'AMP'], markets: ['us', 'kr'],
    compliance: COMPLIANCE,
    evidence: 'CapCut 28건 중 POV 39%. US 광고 라이브러리 실집행(Mid-flight, the flight attendant asked…)',
    status: 'active', source: 'ad-creative-system.md §8',
  },
  {
    name: '게이트키핑 반전 릴스',
    kind: 'reel', angle: 'MYTH', hookType: 'TEXT', lever: 'CURIOSITY',
    summary: '"숨기고 싶었는데" 톤으로 비밀을 푸는 척한다. 통념 반전과 결합.',
    beats: ['0-3s 게이트키핑 선언', '3-8s 통념 반전', '8-12s 진짜 방법', '12s- 엔드카드'],
    hookPatterns: ['Gatekeeping is illegal, so here\'s the {비밀}', 'The {대상} {고민} secret I was gatekeeping', '{통념}? 거꾸로 쓰고 있어서예요'],
    products: ['MST', 'AMP'], markets: ['us', 'kr'],
    compliance: COMPLIANCE,
    evidence: 'CapCut 28건 중 게이트키핑 39% · 반전 39%',
    status: 'active', source: 'ad-creative-system.md §8',
  },
  {
    name: '필러 대비 릴스',
    kind: 'reel', angle: 'MYTH', hookType: 'RESULT', lever: 'CONTRAST',
    summary: '시술을 안 하고 같은 결과를 얻었다는 서사. US에서 지배적.',
    beats: ['0-3s 시술 회피 선언', '3-8s 왜 안 했나', '8-12s 대신 이걸 썼다', '12s- 엔드카드'],
    hookPatterns: ['Skipped the {시술} for my {고민} and tried THIS instead', 'Years of {시술} — and this is what finally {결과}', 'no needles, no clinic'],
    products: ['MST', 'AMP'], markets: ['us'],
    compliance: COMPLIANCE + ' · 시술 대체 주장 금지(겉보기 표현으로)',
    evidence: 'CapCut 32% · US 광고 라이브러리 실집행 훅의 지배적 축(2026-09-17 15건 중 다수)',
    status: 'active', source: 'content-team-research-2026-09-22.md §3-2',
  },
  {
    name: '리스티클 릴스',
    kind: 'reel', angle: 'TIP', hookType: 'TEXT', lever: 'SAVE',
    summary: 'N개 목록에 우리 제품을 섞는다. 비교 구조 없는 유일한 예외.',
    beats: ['0-3s "N가지" 훅', '3-12s 항목 빠른 컷', '우리 제품은 중간에 자연스럽게', '12s- 엔드카드'],
    hookPatterns: ['{N} {카테고리} holy grails {대상} buy in bulk', '{N}가지, 마지막이 진짜'],
    products: ['MST', 'AMP', 'SET'], markets: ['us', 'kr'],
    compliance: COMPLIANCE + ' · 타사 제품 언급 시 비교 폄하 금지',
    evidence: 'CapCut 실집행. 커버 실측 — 간호사 셀피 + 텍스트만(비교 구조 없음)',
    status: 'active', source: 'CapCut 0616 (2)-복사-복사 (3)-복사 (1)',
  },
];

async function main() {
  if (!SECRET) { console.error('CRON_SECRET 환경변수 필요'); process.exit(1); }
  console.log(`포맷 ${formats.length}종 (정적 ${formats.filter(f => f.kind === 'static').length} / 영상 ${formats.filter(f => f.kind === 'reel').length})`);
  console.log(`근거 있음 ${formats.filter(f => f.evidence).length} · 미검증 ${formats.filter(f => !f.evidence).length}`);
  if (DRY) { console.log('\n--dry: 전송 안 함'); formats.forEach(f => console.log(`  [${f.kind}] ${f.angle}/${f.hookType} ${f.name} — ${f.status}`)); return; }

  const r = await fetch(`${BASE}/api/content/formats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify({ replace: true, formats }),
  });
  const d = await r.json();
  console.log('\n적재:', JSON.stringify(d));
}
main().catch(e => { console.error(e.message); process.exit(1); });

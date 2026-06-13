// 일일 정보성 꿀팁 캐러셀 cron — 화·목·토·일(=정보성 4일) 자동 생성.
//   (월·금=실후기[Cowork 캡처], 수=프로모[wed-promo] 는 별도 → 여기서 제외)
//   흐름: 키워드 로테이션 → LLM 슬라이드 카피(궁금증갭+대세감, 제품 은근 1곳) → render-card 베이킹 → 보드 review 시드.
//   시장 1회 생성 → IG·TT 공유(같은 카드). KR=한국어 / US=영어. status review만(자동발행 X).
// 멱등: 오늘자 carousel 슬롯에 mediaUrls 이미 있으면 스킵.
// 인증: Bearer CRON_SECRET (미들웨어 /api/cron/* 통과). ?dry=1 = 대상·카피만(렌더·시드 없음). ?force=1 = 요일 게이트 무시.
import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';
import { put } from '@vercel/blob';
import { getSupabase } from '../../lib/supabase.js';
import { loadFonts, renderSlide, bakePng } from '../creator/render-card.js';

export const config = { maxDuration: 300 };

const anthropic = new Anthropic();
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const SLOT = 'info_tip'; // 정보성 꿀팁 캐러셀 슬롯

// ── Higgsfield(Soul) 일상룩 인물 사진 생성 ─────────────────────────────────
//   generate-image-ref.js 검증 패턴 재사용: createReference(urls) → text2image/soul
//   {prompt, width_and_height, custom_reference_id, custom_reference_strength:0.6} → 폴링 → URL.
//   헤더: hf-api-key(HIGGSFIELD_API_KEY). 사진 필요한 슬라이드만, 슬라이드당 1장, 실패 시 폴백(이미지 없음).
const HF_BASE = 'https://platform.higgsfield.ai';
const CF_BASE = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38PAdEfRanROtVrNU82Klb8ZOSl';
// brand-look.md 인물 레퍼 media_id 20개
const BRAND_LOOK = [
  '7c9d45ca-e56b-4181-ab08-b085bcfea293', '7b9c113c-77b1-4a06-b5b4-2476186e336d',
  'acdd9122-c7b7-4201-b9ae-c3aafe02dc5a', '2f676ab2-9001-46d2-bf14-76cf04c1e6b5',
  '0ab6848b-c02e-403c-b515-61e2d7a710b9', 'b43a37b4-d6d1-4a3c-9585-8a5a826d76e0',
  '261cf9f9-5b4f-4940-a51b-5eb25bb53224', 'e029526a-a7ef-4151-b9d6-8c5364cf76de',
  '4af2406e-235b-46cb-8a6d-3cf3550a8353', '7a5e6280-fd99-40ca-91e2-9952477a98c7',
  '0fa3baee-5607-4d18-9ca7-a1e2bd467d6f', '2cf0e8b7-4968-4f90-8efe-41b045a4876d',
  '16c99547-8b0e-4f37-974a-b83d852a5e30', '5a01dd87-77ff-4600-9735-25cef373c12f',
  '11bf5fae-0845-4f67-80e4-c78e1d2c3b36', 'a472b60f-241c-49c4-b1f7-e402df194d07',
  '41f96670-2418-489d-be05-f719d5abe26d', '02918903-84df-470f-b24c-f97e76f7afc1',
  '26157f42-7f4a-4de9-9246-064f55516894', '73ad242f-8700-44f4-ba03-6bce6159efb8',
];
// 제품(미스트 히어로) — product-assets.md
const PRODUCT_MIST = '4a56fcd8-478d-4860-b722-03934e6eaf3f';
const DAILY_PROMPT = '젊은 20s 다양한 한국/글로벌 인물, 자연광 일상 무드, photoreal(모공·질감), 글로시 더운 피부, plastic/올드 금지, 4:5 세로';
// 클로즈업(매크로) 프롬프트 — 인물 없음. 제품 레퍼 기반 질감·제형·입자.
const CLOSEUP_PROMPT = 'extreme macro close-up, photoreal, no face, no person, soft natural light, shallow depth of field, 4:5 세로';
// 인물 사진(일상룩) = 커버 타입에만. 매크로 클로즈업 = 질감 본문에만.
const PERSON_PHOTO_TYPES = new Set(['cover_fullimage', 'cover_split', 'cover_number']);
const CLOSEUP_PHOTO_TYPES = new Set(['body_closeup', 'body_fullimage']);

function hfHeaders() {
  const key = (process.env.HIGGSFIELD_API_KEY || '').replace(/^["']|["']$/g, '').trim();
  if (!key) throw new Error('HIGGSFIELD_API_KEY 없음');
  return { 'hf-api-key': key, 'Content-Type': 'application/json', 'Origin': 'https://cloud.higgsfield.ai', 'Referer': 'https://cloud.higgsfield.ai/' };
}

const mediaUrl = (id) => `${CF_BASE}/${id}.png`;
const sample = (arr, k) => [...arr].sort(() => Math.random() - 0.5).slice(0, k);

async function hfCreateReference(urls) {
  const res = await fetch(`${HF_BASE}/v1/custom-references`, {
    method: 'POST', headers: hfHeaders(),
    body: JSON.stringify({ name: `daily-${Date.now()}`, input_images: urls.map(u => ({ type: 'image_url', image_url: u })) }),
  });
  if (!res.ok) throw new Error(`custom-reference 실패(${res.status}): ${(await res.text()).slice(0, 120)}`);
  const d = await res.json();
  const id = d.id || d.request_id || d.custom_reference_id;
  if (!id) throw new Error('reference id 없음');
  return id;
}

async function hfPoll(jobSetId, deadlineMs) {
  while (Date.now() < deadlineMs) {
    await new Promise(r => setTimeout(r, 3000));
    const r = await fetch(`${HF_BASE}/v1/job-sets/${jobSetId}`, { headers: hfHeaders() });
    if (!r.ok) continue;
    const data = await r.json();
    const job = data.jobs?.[0];
    const status = job?.status || data.status;
    if (status === 'completed') {
      const rr = job?.results || {};
      return rr.raw?.url || rr.min?.url || rr.image?.url || rr.url || rr.images?.[0]?.url || data.url || null;
    }
    if (['failed', 'nsfw', 'canceled'].includes(status)) throw new Error(`생성 ${status}`);
  }
  throw new Error('타임아웃');
}

// 일상룩 인물 1장 생성 → 우리 Blob 미러 → URL. 실패 시 null(폴백).
async function genDailyPhoto(keyword, draftId, idx) {
  try {
    const refs = [...sample(BRAND_LOOK, 2 + Math.floor(Math.random() * 2)), PRODUCT_MIST].map(mediaUrl);
    let refId = null;
    try { refId = await hfCreateReference(refs); } catch (e) { console.warn('[carousel-daily] ref skip:', e.message); }
    const prompt = `${DAILY_PROMPT}. 콘텐츠 키워드 무드: ${keyword}`;
    const params = { prompt, width_and_height: '1536x2048' };
    if (refId) { params.custom_reference_id = refId; params.custom_reference_strength = 0.6; }
    const submit = (p) => fetch(`${HF_BASE}/v1/text2image/soul`, { method: 'POST', headers: hfHeaders(), body: JSON.stringify({ params: p }) });
    let sub = await submit(params);
    if (!sub.ok && refId) { console.warn('[carousel-daily] ref 미적용 폴백'); sub = await submit({ prompt, width_and_height: '1536x2048' }); }
    if (!sub.ok) throw new Error(`제출 실패(${sub.status})`);
    const subData = await sub.json();
    const jobSetId = subData.id || subData.request_id;
    if (!jobSetId) throw new Error('job-set id 없음');
    const imageUrl = await hfPoll(jobSetId, Date.now() + 90_000);
    if (!imageUrl) throw new Error('이미지 URL 없음');
    const img = await fetch(imageUrl);
    const buf = Buffer.from(await img.arrayBuffer());
    const blob = await put(`carousel-photo/${draftId}-${idx}.png`, buf, { access: 'public', contentType: 'image/png', addRandomSuffix: true });
    return blob.url;
  } catch (e) { console.warn(`[carousel-daily] photo ${idx} 실패(폴백):`, e.message); return null; }
}

// 매크로 클로즈업 1장 생성(인물 아님 — 피부 질감/미스트 입자/세럼 제형). 제품 레퍼만 사용.
//   brand-look 인물 레퍼 쓰지 않음. 실패 시 null(폴백).
async function genCloseupPhoto(subject, draftId, idx) {
  try {
    const refs = [PRODUCT_MIST].map(mediaUrl);
    let refId = null;
    try { refId = await hfCreateReference(refs); } catch (e) { console.warn('[carousel-daily] closeup ref skip:', e.message); }
    const subj = (subject || '피부 질감 매크로').trim();
    const prompt = `${CLOSEUP_PROMPT}. 주제: ${subj}. NO face, no person, photoreal product/texture macro`;
    const params = { prompt, width_and_height: '1536x2048' };
    if (refId) { params.custom_reference_id = refId; params.custom_reference_strength = 0.6; }
    const submit = (p) => fetch(`${HF_BASE}/v1/text2image/soul`, { method: 'POST', headers: hfHeaders(), body: JSON.stringify({ params: p }) });
    let sub = await submit(params);
    if (!sub.ok && refId) { console.warn('[carousel-daily] closeup ref 미적용 폴백'); sub = await submit({ prompt, width_and_height: '1536x2048' }); }
    if (!sub.ok) throw new Error(`제출 실패(${sub.status})`);
    const subData = await sub.json();
    const jobSetId = subData.id || subData.request_id;
    if (!jobSetId) throw new Error('job-set id 없음');
    const imageUrl = await hfPoll(jobSetId, Date.now() + 90_000);
    if (!imageUrl) throw new Error('이미지 URL 없음');
    const img = await fetch(imageUrl);
    const buf = Buffer.from(await img.arrayBuffer());
    const blob = await put(`carousel-closeup/${draftId}-${idx}.png`, buf, { access: 'public', contentType: 'image/png', addRandomSuffix: true });
    return blob.url;
  } catch (e) { console.warn(`[carousel-daily] closeup ${idx} 실패(폴백):`, e.message); return null; }
}

// 커버 레이아웃 로테이션(redis 카운터) — cover_* 4종
const COVER_TYPES = ['cover_fullimage', 'cover_split', 'cover_number', 'cover_textonly'];
const envTrim = (k, fb = '') => String(process.env[k] ?? fb).replace(/\\[rn]/g, '').replace(/^["'\s]+|["'\s]+$/g, '');
const PROFILE = {
  kr: envTrim('ZERNIO_MILLIMILLI_PROFILE_ID', '69d08cc1986d57bb8f733102'),
  us: envTrim('ZERNIO_MILLIMILLI_US_PROFILE_ID', '69fbfcd01fc1fdb66f249aa8'),
};
const CHANNELS = [
  { key: 'kr_ig', region: 'kr', platform: 'instagram' },
  { key: 'kr_tt', region: 'kr', platform: 'tiktok' },
  { key: 'us_ig', region: 'us', platform: 'instagram' },
  { key: 'us_tt', region: 'us', platform: 'tiktok' },
];

// 키워드 풀(정보성 앵글 로테이션) — content-engine-system.md.
const KEYWORDS = [
  '미스트', '글래스스킨', '콜라겐', '탄력', '글로잉뷰티',
  '팔자주름', '눈가주름', '진정', '미백', '코리안스킨케어',
];

const kstNow = () => new Date(Date.now() + 9 * 3600000);
const kstToday = () => kstNow().toISOString().slice(0, 10);
// 내일(D+1) KST 날짜·요일 — 콘텐츠는 하루 미리 만들어 보드에 올려둠(당일 아님).
const kstTomorrow = () => new Date(Date.now() + 9 * 3600000 + 86400000).toISOString().slice(0, 10);
const kstTomorrowDow = () => new Date(Date.now() + 9 * 3600000 + 86400000).getUTCDay();
// 정보성 캐러셀 요일 = 목(4)·토(6)·일(0). (월·금=실후기[Cowork] / 수=프로모[wed-promo] / 화=정보성[Cowork monday-카루셀 이동] 제외)
const INFO_DAYS = new Set([4, 6, 0]);

// 시장별 슬라이드 카피 생성(궁금증갭+대세감, 제품 은근 1곳, 클레임 범위).
//   신규 디자인 포맷 스키마: 커버 타입은 cover(로테이션 주입), 본문은 LLM이 내용량에 맞춰 선택,
//   마무리는 cta_editorial 고정. emphasis 단어 1개로 두께 위계 표시.
async function genSlides(market, keyword, coverType) {
  const lang = market === 'kr' ? '한국어' : 'English';
  const heroLine = market === 'kr'
    ? 'MILLIMILLI 500달톤 단백질 미스트 (입증 혜택 범위: 24h 보습·장벽·결 정돈. 그 외 과장 금지)'
    : 'MILLIMILLI 500 Dalton Protein Mist (substantiated claims only: 24h hydration, barrier, texture. no exaggeration)';
  const system = `당신은 밀리밀리(MILLIMILLI) 브랜드의 감각적 에디토리얼 뷰티 캐러셀 카피라이터입니다.
출력 언어: ${lang}. 시장: ${market.toUpperCase()}.
절대 규칙:
- KPI = 댓글·저장·공유. 조회수·판매 아님. 매일 판매 톤 금지.
- 정보성·꿀팁이 주(主), 제품은 '은근히 1곳'(본문 한 슬라이드에만 자연스럽게). 광고처럼 보이면 실패.
- 모든 카드: 궁금증 갭(curiosity gap) + 대세감(social proof) 둘 다 필수.
- 커버 헤드라인 = 3초 후킹, 정보 다 주지 말고 갭만 연다(반전·"99%가 모르는"·결과 선공개).
- 톤 = 감각적인 한 줄(과한 설명 금지). 카피를 짧고 강하게. 광고 문구("저희 제품은") 금지.
- 제품 클레임은 입증 혜택 범위 내에서만. AI 연출/시장 수치 혼용 금지.`;
  // 커버 타입별 필드 가이드
  const coverGuide = {
    cover_fullimage: `{"type":"cover_fullimage","headline":"하단 훅 1~2줄(짧고 강하게)","emphasis":"headline 안의 강조 단어 1개(반드시 headline에 포함)","sub":"보조 한 줄(대세감 신호)"}`,
    cover_split: `{"type":"cover_split","headline":"우측 헤드라인(두 줄 가능)","emphasis":"headline 안 강조 단어 1개","sub":"보조 한 줄"}`,
    cover_number: `{"type":"cover_number","num":"초대형 숫자/수치(예: 24h, 3, 500)","headline":"숫자 캡션 한 줄","sub":"보조 한 줄(대세감)"}`,
    cover_textonly: `{"type":"cover_textonly","headline":"흑배경 위 큰 헤드라인","emphasis":"headline 안 강조 단어 1개","sub":"보조 한 줄"}`,
  };
  const user = `오늘 키워드: ${keyword}
히어로 제품(은근히 1곳만): ${heroLine}
커버 슬라이드 타입(고정): ${coverType}

감각적 정보성 캐러셀을 아래 JSON으로만 반환(코드블록 없이 순수 JSON). 슬라이드 총 4~6장 = 커버1 + 본문2~4 + 마무리1.

⚠️ 본문 이미지 원칙(매우 중요):
- 본문은 무관한 인물 사진을 넣지 않는다. 정보성 본문은 "데이터 비주얼"(코드 렌더: 숫자/비교/스텝)을 우선한다.
- 각 본문 슬라이드에 "visual" 필드를 반드시 지정: "data_stat" | "data_compare" | "data_steps" | "closeup" | "none".
- 정보성 본문은 data_stat / data_compare / data_steps 를 우선(숫자·비교·스텝). 사진은 질감 설명이 꼭 필요할 때만 closeup.
- 본문 type 은 visual 에 따라 아래처럼 정한다(둘을 일치시킬 것):

{
  "caption": "인스타 캡션 ${lang}, 일기/구어체, 첫 줄 후킹 + 정보 + 댓글 가르는 질문 + 저장/공유 유도(이모지 포함, 200자 이내)",
  "hashtags": "관련 해시태그 10-15개(${lang}/영문 혼용 가능, 공백 구분)",
  "slides": [
    ${coverGuide[coverType] || coverGuide.cover_textonly},
    // 본문 2~4장: 각 본문에 num("01","02"...) 부여. visual 에 맞춰 type·필드 작성:
    //   visual:"data_stat"   → {"type":"body_stat","visual":"data_stat","num":"01","stat":"숫자/수치 문자열(예 984ppm·24h·4주)","statLabel":"숫자 라벨 한 줄","body":"한 줄 설명(**강조**)","circle":true/false}
    //   visual:"data_compare"→ {"type":"body_compare","visual":"data_compare","num":"02","headline":"소제목","emphasis":"headline 안 강조 단어 1개","compare":{"left":"항목A","leftVal":"값/표현","right":"항목B","rightVal":"값/표현"}}
    //   visual:"data_steps"  → {"type":"body_steps","visual":"data_steps","num":"03","headline":"소제목","emphasis":"headline 안 강조 단어 1개","steps":[{"n":"01","t":"한 줄(**강조**)"},{"n":"02","t":"한 줄"}]}
    //   visual:"closeup"     → {"type":"body_closeup","visual":"closeup","num":"04","headline":"소제목","body":"설명(**강조**)","closeupSubject":"매크로 주제(예 '피부 질감 매크로'·'미스트 분사 입자'·'세럼 제형')"}
    //   visual:"none"        → {"type":"body_textonly","visual":"none","num":"05","body":"설명만(**강조**)"}
    // 본문 중 정확히 1곳에만 ${heroLine} 를 해결책으로 은근히 녹임(광고 톤 금지).
    {"type":"cta_editorial","headline":"마무리 한 줄(저장 유도)","emphasis":"headline 안 강조 단어 1개","body":"한 줄 마무리(선택)","comment":"댓글 가르는 질문(짧게)","share":"공유 트리거(예: ~한 친구에게)"}
  ]
}
주의:
- 정보성 본문은 data_* 우선, closeup 은 질감 설명에만, 인물 사진 본문 금지.
- cover headline·각 본문 headline 은 궁금증갭. emphasis 는 반드시 headline 에 그대로 포함된 단어 1개.
- 제품은 본문 단 1곳만.
- ${lang} 맞춤법·띄어쓰기 정확히. 오타 절대 금지(예: '건조'를 '견조'로 쓰지 말 것). 어색한 합성어 금지.`;

  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1800,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const raw = r.content[0]?.text || '';
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('LLM 응답 파싱 실패');
  const parsed = JSON.parse(m[0]);
  if (!Array.isArray(parsed.slides) || parsed.slides.length < 3) throw new Error('slides 부족');
  // 커버 타입 강제(로테이션 주입값) + 마무리 cta_editorial 보장
  parsed.slides[0].type = coverType;
  const last = parsed.slides[parsed.slides.length - 1];
  if (last.type !== 'cta_editorial') last.type = 'cta_editorial';
  // emphasis 보정: 동그라미 안정 — emphasis 없거나 headline 에 없으면 headline 최장 토큰으로.
  for (const s of parsed.slides) {
    const headText = (typeof s.headline === 'object' && s.headline) ? (s.headline.text || '') : (s.headline || '');
    if (!headText) continue;
    const emph = (s.emphasis || '').trim();
    if (!emph || !headText.includes(emph)) {
      const tokens = String(headText).split(/\s+/).filter(Boolean);
      if (tokens.length) s.emphasis = tokens.reduce((a, b) => (b.length > a.length ? b : a), tokens[0]);
    }
  }
  return parsed;
}

// 사진 주입: 커버=일상룩 인물(genDailyPhoto), 질감 본문(closeup/fullimage)=매크로 클로즈업(genCloseupPhoto).
//   data_* 본문(stat/compare/steps)은 코드 렌더라 사진 생성 안 함. 슬라이드당 1장·실패 폴백·병렬.
async function attachPhotos(slides, keyword, draftId) {
  const jobs = slides.map((s, i) => {
    if (PERSON_PHOTO_TYPES.has(s.type)) {
      return genDailyPhoto(keyword, draftId, i + 1).then(url => { if (url) s.image = url; });
    }
    if (CLOSEUP_PHOTO_TYPES.has(s.type)) {
      return genCloseupPhoto(s.closeupSubject || s.headline?.text || s.headline || keyword, draftId, i + 1).then(url => { if (url) s.image = url; });
    }
    return null;
  }).filter(Boolean);
  await Promise.allSettled(jobs);
  return slides;
}

// 슬라이드 → render-card 베이킹 → Blob URLs
async function bakeCards(slides, market, draftId, fonts) {
  const urls = [];
  for (let i = 0; i < slides.length; i++) {
    const png = await bakePng(renderSlide(slides[i], market), fonts);
    const blob = await put(`cardnews/${draftId}-${i + 1}.png`, png, { access: 'public', contentType: 'image/png', addRandomSuffix: true });
    urls.push(blob.url);
  }
  return urls;
}

// 보드 시드(채널×날짜 멱등 — 기존 행 갱신 or 생성)
async function seedDraft(sb, { channel, region, platform, date, mediaUrls, caption, hashtags }) {
  const { data: rows } = await sb.from('creator_drafts').select('id, data').limit(400);
  const existing = (rows || []).find(r => r.data && r.data.version === 'milli-v1' && r.data.channel === channel && r.data.date === date && (r.data.slotType || '') === SLOT);
  if (existing) {
    const d = existing.data;
    d.mediaUrls = mediaUrls; d.format = 'cardnews'; d.status = 'review';
    d.caption = caption; d.hashtags = hashtags; d.source = 'carousel-daily'; d.updatedAt = new Date().toISOString();
    await sb.from('creator_drafts').update({ data: d }).eq('id', existing.id);
    return { channel, id: existing.id, action: 'updated' };
  }
  const id = `milli_${channel}_${date}_${SLOT}_${Date.now().toString(36)}`;
  const draft = {
    id, version: 'milli-v1', channel, region, platform, date, slotType: SLOT,
    status: 'review', format: 'cardnews', caption, hashtags, mediaUrl: null, mediaUrls,
    source: 'carousel-daily', profileId: PROFILE[region],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await sb.from('creator_drafts').insert({ id, persona_id: null, data: draft });
  return { channel, id, action: 'created' };
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  const dry = req.query?.dry === '1';
  const force = req.query?.force === '1';
  // 콘텐츠는 '내일(D+1)' 것을 미리 생성해 보드에 올림(당일 아님). 아래 today 변수는 타깃=내일 날짜.
  const today = kstTomorrow();
  const dow = kstTomorrowDow(); // 내일의 KST 요일로 정보성 게이트
  if (!force && !INFO_DAYS.has(dow)) return res.status(200).json({ ok: true, skip: 'not_info_day(tomorrow)', dow, target: today });

  try {
    const sb = getSupabase();
    // 키워드 로테이션 + 커버 레이아웃 로테이션
    const n = Number(await redis.get('creator:carousel:rotation').catch(() => 0)) || 0;
    const keyword = KEYWORDS[n % KEYWORDS.length];
    const cn = Number(await redis.get('creator:carousel:cover-rotation').catch(() => 0)) || 0;
    const coverType = COVER_TYPES[cn % COVER_TYPES.length];
    if (!dry) {
      await redis.set('creator:carousel:rotation', n + 1).catch(() => {});
      await redis.set('creator:carousel:cover-rotation', cn + 1).catch(() => {});
    }

    // 멱등: 오늘 이미 생성됐으면 스킵
    const { data: rows } = await sb.from('creator_drafts').select('id, data').limit(400);
    const done = (rows || []).some(r => r.data && r.data.version === 'milli-v1' && r.data.date === today && (r.data.slotType || '') === SLOT && Array.isArray(r.data.mediaUrls) && r.data.mediaUrls.length);
    if (done && !force) return res.status(200).json({ ok: true, skip: 'already_done', today, keyword });

    if (dry) {
      const kr = await genSlides('kr', keyword, coverType).catch(e => ({ error: e.message }));
      return res.status(200).json({ ok: true, dry: true, today, keyword, coverType, sampleKR: kr });
    }

    const fonts = await loadFonts();
    const results = [];
    // 시장별 1회 생성 → IG·TT 공유
    for (const market of ['kr', 'us']) {
      try {
        const copy = await genSlides(market, keyword, coverType);
        const draftId = `${market}_${today}_${Date.now().toString(36)}`;
        // 사진 필요한 슬라이드에 일상룩 인물 사진 생성·주입(실패 시 폴백)
        await attachPhotos(copy.slides, keyword, draftId);
        const mediaUrls = await bakeCards(copy.slides, market, draftId, fonts);
        const caption = copy.caption || '';
        const hashtags = copy.hashtags || '';
        for (const ch of CHANNELS.filter(c => c.region === market)) {
          const seeded = await seedDraft(sb, { channel: ch.key, region: ch.region, platform: ch.platform, date: today, mediaUrls, caption, hashtags });
          results.push(seeded);
        }
      } catch (e) { results.push({ market, error: e.message }); }
    }
    const summary = { ok: true, today, keyword, coverType, results };
    try { await redis.set('creator:carousel-daily:latest', { ...summary, at: new Date().toISOString() }, { ex: 86400 * 3 }); } catch {}
    return res.status(200).json(summary);
  } catch (e) {
    console.error('[carousel-daily]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

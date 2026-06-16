// 일일 정보성 꿀팁 캐러셀 cron — 화·목·토·일(=정보성 4일) 자동 생성.
//   (월·금=실후기[Cowork 캡처], 수=프로모[wed-promo] 는 별도 → 여기서 제외)
//   흐름: 키워드 로테이션 → KR LLM 슬라이드 카피(궁금증갭+대세감, 제품 은근 1곳) → 사진 1세트 생성(공유)
//         → US=번역본(텍스트만, 사진 공유) → render-card 베이킹(KR·US) → 보드 review 시드.
//   KR·US 통일: 콘셉트·사진 1회만(공유 image URL), 언어만 KR/US 다름. IG·TT 공유(같은 카드). status review만(자동발행 X).
// 멱등: 오늘자 carousel 슬롯에 mediaUrls 이미 있으면 스킵.
// 인증: Bearer CRON_SECRET (미들웨어 /api/cron/* 통과). ?dry=1 = 대상·카피만(렌더·시드 없음). ?force=1 = 요일 게이트 무시.
import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';
import { put } from '@vercel/blob';
import { getSupabase } from '../../lib/supabase.js';
import { loadFonts, renderSlide, bakePng } from '../creator/render-card.js';
import * as refManifest from '../../lib/ref-manifest.js'; // 폴더 기반 레퍼(assets/→Blob, scripts/sync-refs.mjs)

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
// 제품 라인업 — claims-substantiation.md / product-assets.md. 주제→제품→클레임→에셋 매핑(제품마다 입증 범위 내에서만).
const PRODUCTS = {
  mist:  { name: '밀리밀리 500달톤 단백질 미스트', nameEn: 'MILLIMILLI 500 Dalton Protein Mist', claim: '24시간 보습 + 팔자·눈가 주름·볼 꺼짐 개선(4주 인체적용시험)', claimEn: '24h hydration + nasolabial/eye-area wrinkle & volume-loss improvement (4-week clinical)', media: PRODUCT_MIST },
  ample: { name: '밀리밀리 앰플', nameEn: 'MILLIMILLI Ample', claim: '피부 리프팅 + 모공 부위 탄력 개선(4주 인체적용시험)', claimEn: 'skin lifting + pore-area firmness improvement (4-week clinical)', media: 'bb221889-17b5-4866-a0f2-0070247c6623' },
  vita:  { name: '밀리밀리 비타미스트', nameEn: 'MILLIMILLI Vita Mist', claim: '윤기 + 톤·색소침착 개선(미백)', claimEn: 'radiance + tone & pigmentation (brightening) improvement', media: 'a6e71e46-d815-482d-ab07-dfdf2dcb56ab' },
  cica:  { name: '밀리밀리 시카미스트', nameEn: 'MILLIMILLI Cica Mist', claim: '진정(붉은기) + 피부 장벽·자극 개선(4주)', claimEn: 'soothing (redness) + barrier & irritation improvement (4-week)', media: '68a0a7c2-71b1-4ea6-84d6-99137fa17577' },
};
// 인물(레퍼 얼굴) — 레퍼 무드에 강의존(strength 0.9). 프롬프트는 가볍게(셀카 감성만) — 과한 묘사는 레퍼를 덮으니 금지.
//   포즈 강제 X. 주제는 카드 텍스트가 전달하고, 사진은 레퍼 셀카 무드를 그대로 가져온다(주제 부위는 가볍게 노출만).
const PERSON_PROMPT = 'candid selfie, phone-camera photo, intimate close-up, match the reference face and overall mood very closely (rednote/pinterest selfie aesthetic), photoreal dewy natural skin, real person everyday vibe, soft tone, 4:5 세로. fully clothed in a simple modest everyday top, no nudity, no bare shoulders, no lingerie/towel, SFW. no glossy studio, no model pose, no heavy retouch';
// 클로즈업(매크로) 프롬프트 — 인물 없음. 제품 레퍼 기반 질감·제형·입자. 자연 실사 매크로.
const CLOSEUP_PROMPT = 'natural real photo, extreme macro close-up, photoreal, no face, no person, soft natural light, everyday natural context, authentic snapshot feel, NOT studio editorial, shallow depth of field, 4:5 세로. glossy/plastic 금지';
// 제품 샷 프롬프트 — 일상 맥락(파우치/책상 등) 자연 실사. 단일 제품 레퍼.
const PRODUCT_PROMPT = 'natural product shot, real photo, everyday context (in a pouch/on a desk/by the sink), authentic snapshot feel, NOT studio editorial/model shoot, soft natural light, photoreal, 4:5 세로. glossy/plastic 금지';
// 무드 씬 — 핀터레스트 감성. 날씨/계절/감성 배경. 인물 비중 X. 시네마틱 자연광 실사.
const SCENE_PROMPT = 'pinterest-aesthetic mood photo, real photo, atmospheric cinematic natural light, evocative everyday scene, soft film-like color grade, no text no logo, photoreal (NOT 3d render/illustration), 4:5 세로. glossy/plastic 금지';
// 커버 사진 타입(레이아웃). 실제 소재(photoSubject)는 슬라이드 필드로 적응.
const COVER_PHOTO_TYPES = new Set(['cover_fullimage', 'cover_split', 'cover_number']);
const CLOSEUP_PHOTO_TYPES = new Set(['body_closeup', 'body_fullimage']);

function hfHeaders() {
  const key = (process.env.HIGGSFIELD_API_KEY || '').replace(/^["']|["']$/g, '').trim();
  if (!key) throw new Error('HIGGSFIELD_API_KEY 없음');
  return { 'hf-api-key': key, 'Content-Type': 'application/json', 'Origin': 'https://cloud.higgsfield.ai', 'Referer': 'https://cloud.higgsfield.ai/' };
}

// 레퍼 = Higgsfield media id(→CF png) 또는 풀 URL(http로 시작) 둘 다 허용.
const mediaUrl = (idOrUrl) => /^https?:\/\//.test(idOrUrl) ? idOrUrl : `${CF_BASE}/${idOrUrl}.png`;
// 코드 수정 없이 레퍼 추가: 환경변수 BRAND_LOOK_EXTRA_URLS 에 공개 이미지 URL 콤마구분으로 넣으면 풀에 합쳐짐.
const BRAND_LOOK_EXTRA = String(process.env.BRAND_LOOK_EXTRA_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
// 인물 풀 = 폴더 레퍼(assets/brand-look → Blob) + 기존 CF20 + env 추가분.
const LOOK_POOL = [...(refManifest.brandLook || []), ...BRAND_LOOK, ...BRAND_LOOK_EXTRA];
// 제품/씬 풀 = 폴더 레퍼(assets/products·scene). 비면 각각 PRODUCT_MIST / 프롬프트-only 폴백.
const PRODUCT_POOL = (refManifest.product && refManifest.product.length) ? refManifest.product : null;
const SCENE_POOL = (refManifest.scene && refManifest.scene.length) ? refManifest.scene : null;
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

// 공통 HF Soul 생성기 — refUrls(0~1장) + 프롬프트 → Soul 생성 → 우리 Blob 미러 → URL. 실패 시 null(폴백).
//   레퍼는 단일 1장(블렌드 금지 — 여러 장 섞으면 화보컷化). strength 0.85~0.9(거의 복제).
//   refUrls 비면(scene 등) 레퍼 없이 프롬프트만.
async function genHfPhoto({ refUrls = [], prompt, strength = 0.85, blobPrefix, draftId, idx, tag = 'photo' }) {
  try {
    let refId = null;
    if (refUrls.length) {
      try { refId = await hfCreateReference(refUrls); } catch (e) { console.warn(`[carousel-daily] ${tag} ref skip:`, e.message); }
    }
    const base = { prompt, width_and_height: '1536x2048' };
    const params = { ...base };
    if (refId) { params.custom_reference_id = refId; params.custom_reference_strength = strength; }
    const submit = (p) => fetch(`${HF_BASE}/v1/text2image/soul`, { method: 'POST', headers: hfHeaders(), body: JSON.stringify({ params: p }) });
    let sub = await submit(params);
    if (!sub.ok && refId) {
      // transient(character_not_found = 레퍼 전파 지연) 대비 레퍼 1회 재시도, 그래도 실패면 레퍼 없이 폴백
      await new Promise(r => setTimeout(r, 2500));
      sub = await submit(params);
      if (!sub.ok) { console.warn(`[carousel-daily] ${tag} ref 미적용 폴백`); sub = await submit(base); }
    }
    if (!sub.ok) throw new Error(`제출 실패(${sub.status})`);
    const subData = await sub.json();
    const jobSetId = subData.id || subData.request_id;
    if (!jobSetId) throw new Error('job-set id 없음');
    const imageUrl = await hfPoll(jobSetId, Date.now() + 90_000);
    if (!imageUrl) throw new Error('이미지 URL 없음');
    const img = await fetch(imageUrl);
    const buf = Buffer.from(await img.arrayBuffer());
    const blob = await put(`${blobPrefix}/${draftId}-${idx}.png`, buf, { access: 'public', contentType: 'image/png', addRandomSuffix: true });
    return blob.url;
  } catch (e) { console.warn(`[carousel-daily] ${tag} ${idx} 실패(폴백):`, e.message); return null; }
}

// 인물 커버 1장 — 단일 brand-look 레퍼(블렌드 금지) + strength 0.8(얼굴 identity 유지 + 주제 프레이밍 반영).
//   detail = 레퍼 얼굴의 어느 부위/표정이 주제를 보여주는지(예: '하관·볼, 팔자 라인 보이게'). full=true면 상반신/전신.
async function genDailyPhoto(keyword, draftId, idx, detail = '', full = false) {
  const ref = sample(LOOK_POOL, 1).map(mediaUrl); // 단일 레퍼 1장만(기존 20 + env 추가분)
  const area = (detail || '').trim() || `${keyword} 관련 부위`;
  const shot = full ? 'mirror selfie / waist-up' : 'face close-up selfie';
  // 포즈 강제 X — 주제 부위는 '가볍게 노출만'(touching/action 금지). 레퍼 무드가 주인공.
  const prompt = `${PERSON_PROMPT}. ${shot}, ${area} naturally visible (no posing, no touching).`;
  return genHfPhoto({ refUrls: ref, prompt, strength: 0.9, blobPrefix: 'carousel-photo', draftId, idx, tag: 'person' });
}

// 매크로 클로즈업 1장(인물 아님 — 피부 질감/미스트 입자/세럼 제형). 단일 제품 레퍼 + strength 0.85.
async function genCloseupPhoto(subject, draftId, idx, productMedia = null) {
  const subj = (subject || '피부 질감 매크로').trim();
  const prompt = `${CLOSEUP_PROMPT}. 주제: ${subj}. NO face, no person, photoreal product/texture macro`;
  const ref = productMedia ? [mediaUrl(productMedia)] : (PRODUCT_POOL ? sample(PRODUCT_POOL, 1) : [mediaUrl(PRODUCT_MIST)]);
  return genHfPhoto({ refUrls: ref, prompt, strength: 0.85, blobPrefix: 'carousel-closeup', draftId, idx, tag: 'closeup' });
}

// 제품 샷 1장(일상 맥락 — 파우치/책상 등). 매핑된 제품 레퍼(라벨 정확) + strength 0.85. 자연 실사.
async function genProductPhoto(subject, keyword, draftId, idx, productMedia = null) {
  const subj = (subject || '').trim();
  const prompt = `${PRODUCT_PROMPT}. 콘텐츠 키워드 무드: ${keyword}${subj ? `. 주제: ${subj}` : ''}`;
  const ref = productMedia ? [mediaUrl(productMedia)] : (PRODUCT_POOL ? sample(PRODUCT_POOL, 1) : [mediaUrl(PRODUCT_MIST)]);
  return genHfPhoto({ refUrls: ref, prompt, strength: 0.85, blobPrefix: 'carousel-product', draftId, idx, tag: 'product' });
}

// 무드 씬 1장(핀터레스트 감성, 날씨/계절/감성). 레퍼 없이 프롬프트만. 자연 실사.
async function genScenePhoto(subject, keyword, draftId, idx) {
  const subj = (subject || '').trim();
  const prompt = `${SCENE_PROMPT}. mood/subject: ${subj || keyword}. content theme: ${keyword}`;
  // 씬 레퍼 폴더 있으면 무드 넛지(0.6, 복제 아님), 없으면 프롬프트-only.
  const ref = SCENE_POOL ? sample(SCENE_POOL, 1) : [];
  return genHfPhoto({ refUrls: ref, prompt, strength: ref.length ? 0.6 : 0.85, blobPrefix: 'carousel-scene', draftId, idx, tag: 'scene' });
}

// 커버 레이아웃 로테이션(redis 카운터) — cover_* 4종
const COVER_TYPES = ['cover_fullimage', 'cover_split', 'cover_number', 'cover_textonly'];
const envTrim = (k, fb = '') => String(process.env[k] ?? fb).replace(/\\[rn]/g, '').replace(/^["'\s]+|["'\s]+$/g, '');
const PROFILE = {
  kr: envTrim('ZERNIO_MILLIMILLI_PROFILE_ID', '69d08cc1986d57bb8f733102'),
  us: envTrim('ZERNIO_MILLIMILLI_US_PROFILE_ID', '69fbfd0692b3d8e85f86d882'), // Zernio 실측(발행 검증)
};
const CHANNELS = [
  { key: 'kr_ig', region: 'kr', platform: 'instagram' },
  { key: 'kr_tt', region: 'kr', platform: 'tiktok' },
  { key: 'us_ig', region: 'us', platform: 'instagram' },
  { key: 'us_tt', region: 'us', platform: 'tiktok' },
];

// 주제→제품 풀 — 제품을 번갈아 인터리브(주제도 돌고 제품도 돈다). 각 주제는 그 제품의 입증 클레임 범위 안에서만.
//   p: mist|ample|vita|cica (PRODUCTS). 컴플라이언스: 미간/목주름·다크서클·시술후기 등 미입증/효능단정은 제외.
const KEYWORDS = [
  { kw: '속건조', p: 'mist' },          { kw: '콜라겐·탄력', p: 'ample' },   { kw: '미백·톤', p: 'vita' },        { kw: '진정·붉은기', p: 'cica' },
  { kw: '푸석함', p: 'mist' },          { kw: '모공 탄력', p: 'ample' },     { kw: '칙칙함·색소', p: 'vita' },    { kw: '피부장벽 케어', p: 'cica' },
  { kw: '수분장벽', p: 'mist' },        { kw: '피부 리프팅', p: 'ample' },   { kw: '윤기·광채', p: 'vita' },      { kw: '자극·트러블', p: 'cica' },
  { kw: '환절기 건조', p: 'mist' },     { kw: '바디 탄력', p: 'ample' },     { kw: '글로우·물광', p: 'vita' },    { kw: '민감·붉은기', p: 'cica' },
  { kw: '팔자·눈가 주름', p: 'mist' },  { kw: '모공·블랙헤드', p: 'ample' }, { kw: '여름 끈적임', p: 'mist' },    { kw: '겨울 당김', p: 'mist' },
  { kw: '결 정돈·흡수', p: 'mist' },    { kw: '베이스 들뜸·화장 무너짐', p: 'mist' }, { kw: '미스트 사용법', p: 'mist' }, { kw: '스킨케어 레이어링', p: 'ample' },
  { kw: '코리안 스킨케어 루틴', p: 'mist' }, { kw: '올리브영 추천템', p: 'vita' }, { kw: '아침 스킨케어 루틴', p: 'mist' }, { kw: '저녁 스킨케어 루틴', p: 'cica' },
];
// 시리즈 아크(sns-strategy): 발견60/신뢰25/캐릭터15 — 20슬롯 인터리브 패턴으로 비중 근사 + 매번 다른 결.
const SERIES_SEQ = ['발견','신뢰','발견','발견','캐릭터','발견','신뢰','발견','발견','캐릭터','발견','신뢰','발견','발견','발견','신뢰','발견','발견','캐릭터','신뢰'];

const kstNow = () => new Date(Date.now() + 9 * 3600000);
const kstToday = () => kstNow().toISOString().slice(0, 10);
// 내일(D+1) KST 날짜·요일 — 콘텐츠는 하루 미리 만들어 보드에 올려둠(당일 아님).
const kstTomorrow = () => new Date(Date.now() + 9 * 3600000 + 86400000).toISOString().slice(0, 10);
const kstTomorrowDow = () => new Date(Date.now() + 9 * 3600000 + 86400000).getUTCDay();
// 정보성 캐러셀 요일 = 전 7일(일~토). 2026-06-15 개편: 실후기·프로모·릴스 폐지 → 모든 요일 정보 캐러셀 통일.
const INFO_DAYS = new Set([0, 1, 2, 3, 4, 5, 6]);

// 시장별 슬라이드 카피 생성(궁금증갭+대세감, 제품 은근 1곳, 클레임 범위).
//   신규 디자인 포맷 스키마: 커버 타입은 cover(로테이션 주입), 본문은 LLM이 내용량에 맞춰 선택,
//   마무리는 cta_editorial 고정. emphasis 단어 1개로 두께 위계 표시.
async function genSlides(market, keyword, coverType, axis = '발견', varietyHint = '', product = PRODUCTS.mist) {
  const lang = market === 'kr' ? '한국어' : 'English';
  const heroLine = market === 'kr'
    ? `${product.name} (입증 혜택 범위: ${product.claim}. 이 범위 밖 효능·부위·수치 단정 금지)`
    : `${product.nameEn} (substantiated claims only: ${product.claimEn}. no claims outside this range)`;
  const system = `당신은 밀리밀리(MILLIMILLI) 브랜드의 감각적 에디토리얼 뷰티 캐러셀 카피라이터입니다.
출력 언어: ${lang}. 시장: ${market.toUpperCase()}.
절대 규칙:
- KPI = 댓글·저장·공유. 조회수·판매 아님. 매일 판매 톤 금지.
- 정보성·꿀팁이 주(主), 제품은 '은근히 1곳'(본문 한 슬라이드에만 자연스럽게). 광고처럼 보이면 실패.
- 모든 카드: 궁금증 갭(curiosity gap) + 대세감(social proof) 둘 다 필수.
- 커버 헤드라인 = 3초 후킹, 정보 다 주지 말고 갭만 연다(반전·"99%가 모르는"·결과 선공개).
- 톤 = 감각적인 한 줄(과한 설명 금지). 카피를 짧고 강하게. 광고 문구("저희 제품은") 금지.
- 제품 클레임은 입증 혜택 범위 내에서만. AI 연출/시장 수치 혼용 금지.`;
  // 커버 사진 소재(photoSubject) — 주제에 맞게. 얼굴/스킨 고민이면 person(레퍼 얼굴)이 기본.
  //   person : 얼굴/스킨 고민(팔자주름·눈가·미간·다크서클·모공·글로잉·탄력·미백·칙칙함·결정돈). 레퍼 얼굴 사용.
  //            photoSubjectDetail = 레퍼 얼굴의 어느 부위/표정이 주제를 보여주는지(예 '하관·볼, 팔자 라인 보이게'·'눈가 클로즈업'·'광채나는 얼굴 정면'). photoFull=true면 상반신/전신.
  //   scene  : 날씨·계절·환경·감성(환절기·여름끈적임·겨울당김·속건조 무드). detail = 핀터레스트 무드 한 줄(예 '비 오는 창가 감성'·'여름 햇살 창가'·'겨울 니트와 따뜻한 조명').
  //   product: 사용법·추천·휴대(미스트 사용법·올영추천·파우치·레이어링). texture: 제형·흡수·입자(매크로).
  const photoSubjectGuide = `"photoSubject":"person|scene|product|texture 중 1개(주제에 맞게 — 얼굴/스킨 고민이면 person)","photoSubjectDetail":"위 가이드에 맞는 사진 주제 한 줄","photoFull":false`;
  const coverGuide = {
    cover_fullimage: `{"type":"cover_fullimage","headline":"하단 훅 1~2줄(짧고 강하게)","emphasis":"headline 안의 강조 단어 1개(반드시 headline에 포함)","sub":"보조 한 줄(대세감 신호)",${photoSubjectGuide}}`,
    cover_split: `{"type":"cover_split","headline":"우측 헤드라인(두 줄 가능)","emphasis":"headline 안 강조 단어 1개","sub":"보조 한 줄",${photoSubjectGuide}}`,
    cover_number: `{"type":"cover_number","num":"초대형 숫자/수치(예: 24h, 3, 500)","headline":"숫자 캡션 한 줄","sub":"보조 한 줄(대세감)",${photoSubjectGuide}}`,
    cover_textonly: `{"type":"cover_textonly","headline":"흑배경 위 큰 헤드라인","emphasis":"headline 안 강조 단어 1개","sub":"보조 한 줄"}`,
  };
  const user = `오늘 키워드: ${keyword}
히어로 제품(은근히 1곳만): ${heroLine}
커버 슬라이드 타입(고정): ${coverType}${varietyHint ? `\n${varietyHint}` : ''}
시리즈 결(axis): ${axis} — 이 결에 맞춰 톤·앵글을 잡을 것.
  · 발견: 신규 유입용. 트렌드·통념 깨기·"오늘의 발견"·궁금증 갭. 정보성 꿀팁 톤.
  · 신뢰: 전문성·증거. 과학 권위(성분·메커니즘·4주 임상 입증 범위)·실측 비교. "광고 같지 않은" 신뢰 톤. (수치는 위 입증 범위 내에서만)
  · 캐릭터: 재미·팬화. POV·상황극·밈·유머·공감. 가볍고 위트있게(정보는 한 스푼).

감각적 정보성 캐러셀을 아래 JSON으로만 반환(코드블록 없이 순수 JSON). 슬라이드 총 7~8장 = 커버1 + 본문5~6 + 마무리1.

⚠️ 본문 밀도(매우 중요 — 빈약 금지):
- 각 본문은 "저장하고 싶은" 구체 정보로 채울 것: 실제 수치·성분/메커니즘·실전 적용 팁·전후 비교·오해vs사실. 뻔한 일반론 한 줄("수분이 중요해요" 류) 금지.
- 정보가 진짜 유용해서 저장각(저장하고 두고두고 볼) 밀도. 본문 5~6장을 서로 다른 각도(원인·메커니즘·실측수치·실전법·비교·체크리스트 등)로 전개.
- ⚠️ 근거 없는 수치·효능 단정 금지 — 입증 혜택 범위(24h 보습·장벽·결 정돈) 밖의 수치/효능을 단정하지 말 것(과장 방지).
- 제품 클레임은 입증 범위 내, 근거 없는 수치·인원("N만명이 확인"·"전문가 N명") 단정 금지.

⚠️ 본문 이미지 원칙(매우 중요):
- 본문은 무관한 인물 사진을 넣지 않는다. 정보성 본문은 "데이터 비주얼"(코드 렌더: 숫자/비교/스텝)을 우선한다.
- 각 본문 슬라이드에 "visual" 필드를 반드시 지정: "data_stat" | "data_donut" | "data_compare" | "data_steps" | "closeup" | "none".
- 정보성 본문은 data_stat / data_donut / data_compare / data_steps 를 우선(숫자·링·비교·스텝). 사진은 질감 설명이 꼭 필요할 때만 closeup.
- data_donut = 단일 퍼센트(예 72%·40%) 도넛 링. 퍼센트 강조 슬라이드는 data_stat 대신 data_donut 으로 변주(같은 큰숫자 반복 방지).
- ⚠️ 본문 변주(매우 중요): 본문 슬라이드끼리 visual 을 **서로 다르게** 섞을 것. data_stat·data_compare·data_steps 를 모두 한 번씩은 쓰고, 텍스트 강조형(body_textonly=visual:none, 큰 문장 강조)도 1장 섞어 리듬을 줄 것(도표만 연속 금지).
  · **직전 본문과 반드시 다른 visual**: 바로 앞 본문이 data_compare 면 다음은 data_compare 금지(stat·steps·none 중 다른 것). 같은 막대도표(data_compare) 2장 연속 절대 금지.
  · 매 콘텐츠 똑같은 visual 순서 반복 금지. 이번 콘텐츠는 ${['data_stat 시작','data_compare 시작','data_steps 시작'][Math.abs(keyword.length) % 3]} 권장(이후는 위 규칙대로 섞어 전개).
- 본문 type 은 visual 에 따라 아래처럼 정한다(둘을 일치시킬 것):

{
  "caption": "인스타 캡션 ${lang}, 일기/구어체, 첫 줄 후킹 + 정보 + 댓글 가르는 질문 + 저장/공유 유도(이모지 포함, 200자 이내)",
  "hashtags": "정확히 5개: #밀리밀리(필수, 맨 앞) + 관련 해시태그 4개. 공백 구분. ${lang}.",
  "slides": [
    ${coverGuide[coverType] || coverGuide.cover_textonly},
    // 본문 5~6장(밀도 높게·서로 다른 visual 섞어): 각 본문에 num("01","02"...) 부여. visual 에 맞춰 type·필드 작성:
    //   visual:"data_stat"   → {"type":"body_stat","visual":"data_stat","num":"01","stat":"숫자/수치 문자열(예 984ppm·24h·4주)","statLabel":"숫자 라벨 한 줄","body":"한 줄 설명(**강조**)","circle":true/false}
    //   visual:"data_donut"  → {"type":"body_donut","visual":"data_donut","num":"02","stat":"단일 퍼센트(예 72%)","statLabel":"라벨 한 줄","body":"한 줄 설명(**강조**)"}
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
- ${lang} 맞춤법·띄어쓰기 정확히. 오타 절대 금지(예: '건조'를 '견조'로 쓰지 말 것). 어색한 합성어 금지.
- 카드 텍스트에 화살표/특수기호(→ ⟶ ⇒ ▶ 등) 절대 쓰지 말 것. 흐름·전환은 우리말 단어로(예: '촉촉했다가 건조', 'A는 B로'). 글머리 기호도 금지.`;

  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
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

// KR 슬라이드(+캡션·해시태그) → 영어 번역본 생성(LLM 1회). 콘텐츠·사진은 KR과 공유, 언어만 다름.
//   텍스트 필드만 번역: headline, body, sub, statLabel, steps[].t, compare.left/leftVal/right/rightVal,
//   comment, share, emphasis(번역된 headline에 포함된 단어로), caption, hashtags.
//   type/num/stat(숫자)/image(공유 URL)/circle/visual/photoSubject 등 비텍스트는 그대로 복사.
async function translateSlidesToEn(parsed) {
  // 이미지/구조는 그대로. 번역 대상 텍스트만 LLM 에 전달 → JSON 으로 회수.
  const slides = parsed.slides || [];
  // 번역 대상만 추출(인덱스 보존)
  const payload = slides.map((s) => {
    const o = { type: s.type };
    if (s.headline != null) o.headline = (typeof s.headline === 'object') ? (s.headline.text || '') : s.headline;
    if (s.emphasis != null) o.emphasis = s.emphasis;
    if (s.body != null) o.body = s.body;
    if (s.sub != null) o.sub = s.sub;
    if (s.statLabel != null) o.statLabel = s.statLabel;
    if (s.comment != null) o.comment = s.comment;
    if (s.share != null) o.share = s.share;
    if (Array.isArray(s.steps)) o.steps = s.steps.map(st => ({ t: st.t ?? '' }));
    if (s.compare && typeof s.compare === 'object') {
      o.compare = { left: s.compare.left ?? '', leftVal: s.compare.leftVal ?? '', right: s.compare.right ?? '', rightVal: s.compare.rightVal ?? '' };
    }
    return o;
  });
  const system = `You are a professional EN beauty-copy translator for the brand MILLIMILLI.
Translate Korean carousel copy into natural, punchy US-English marketing copy (not literal). Keep the curiosity-gap + social-proof tone.
- Preserve **bold** markers exactly (e.g. **단어** → **word**). Keep emoji.
- For each slide, "emphasis" MUST be a single word that appears verbatim in the translated "headline".
- Do NOT translate or change numbers/units (24h, 984ppm, 500 Dalton, 4주→4 weeks is fine but keep digits).
- Return ONLY JSON, same shape as input (array under "slides" + "caption" + "hashtags"). No code fences.`;
  const user = `Translate to English. Korean caption: ${JSON.stringify(parsed.caption || '')}
Korean hashtags: ${JSON.stringify(parsed.hashtags || '')}
Korean slides text (translate the text fields, keep array order/length):
${JSON.stringify(payload)}

Return JSON exactly:
{"caption":"EN caption (diary/casual, hook + info + comment-splitting question + save/share trigger, with emoji, <200 chars)","hashtags":"EXACTLY 5: #millimilli (mandatory, first) + 4 related tags, space-separated","slides":[ same length as input, each with only the text fields that were present, translated ]}`;
  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1800,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const raw = r.content[0]?.text || '';
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('translate 응답 파싱 실패');
  const tr = JSON.parse(m[0]);
  const trSlides = Array.isArray(tr.slides) ? tr.slides : [];
  // KR 구조를 깊은 복사 후 번역 텍스트만 덮어쓰기(이미지·숫자·구조 보존)
  const out = { caption: tr.caption || parsed.caption || '', hashtags: tr.hashtags || parsed.hashtags || '', slides: [] };
  out.slides = slides.map((s, i) => {
    const en = JSON.parse(JSON.stringify(s)); // 깊은 복사(image/num/stat/circle/visual/photoSubject 등 유지)
    const t = trSlides[i] || {};
    if (s.headline != null && t.headline != null) {
      if (typeof en.headline === 'object' && en.headline) en.headline.text = t.headline;
      else en.headline = t.headline;
    }
    if (t.emphasis != null) en.emphasis = t.emphasis;
    if (t.body != null) en.body = t.body;
    if (t.sub != null) en.sub = t.sub;
    if (t.statLabel != null) en.statLabel = t.statLabel;
    if (t.comment != null) en.comment = t.comment;
    if (t.share != null) en.share = t.share;
    if (Array.isArray(en.steps) && Array.isArray(t.steps)) {
      en.steps = en.steps.map((st, j) => ({ ...st, t: t.steps[j]?.t ?? st.t }));
    }
    if (en.compare && t.compare) {
      en.compare = { ...en.compare, left: t.compare.left ?? en.compare.left, leftVal: t.compare.leftVal ?? en.compare.leftVal, right: t.compare.right ?? en.compare.right, rightVal: t.compare.rightVal ?? en.compare.rightVal };
    }
    return en;
  });
  // emphasis 보정(번역 headline 안에 없으면 최장 토큰으로) — KR genSlides 와 동일 정책.
  for (const s of out.slides) {
    const headText = (typeof s.headline === 'object' && s.headline) ? (s.headline.text || '') : (s.headline || '');
    if (!headText) continue;
    const emph = (s.emphasis || '').trim();
    if (!emph || !headText.includes(emph)) {
      const tokens = String(headText).split(/\s+/).filter(Boolean);
      if (tokens.length) s.emphasis = tokens.reduce((a, b) => (b.length > a.length ? b : a), tokens[0]);
    }
  }
  return out;
}

// 사진 주입(공유 1세트 — KR/US 공통): 커버는 photoSubject(person/product/texture/scene)로 소재 적응,
//   질감 본문(closeup/fullimage)=매크로 클로즈업. data_* 본문(stat/compare/steps)은 코드 렌더라 사진 생성 안 함.
//   슬라이드당 1장·실패 폴백·병렬.
const headTextOf = (s) => (typeof s.headline === 'object' && s.headline) ? (s.headline.text || '') : (s.headline || '');
async function attachPhotos(slides, keyword, draftId, coverImageUrl = null, product = PRODUCTS.mist) {
  const pMedia = product && product.media;
  // 커버 이미지 수동 주입(MCP Marketing Studio 검증 컷) — 잼/만료 우회. 주입되면 커버 생성 스킵.
  if (coverImageUrl) {
    const cov = slides.find(s => COVER_PHOTO_TYPES.has(s.type));
    if (cov) cov.image = coverImageUrl;
  }
  const jobs = slides.map((s, i) => {
    if (coverImageUrl && COVER_PHOTO_TYPES.has(s.type)) return null; // 커버 주입됨 → 생성 안 함
    if (COVER_PHOTO_TYPES.has(s.type)) {
      // 커버 소재 주제 적응(항상 인물 X). 기본 person.
      const subject = (s.photoSubject || 'person').trim();
      const hint = s.photoSubjectDetail || headTextOf(s) || keyword;
      if (subject === 'product') return genProductPhoto(hint, keyword, draftId, i + 1, pMedia).then(url => { if (url) s.image = url; });
      if (subject === 'texture') return genCloseupPhoto(s.closeupSubject || hint, draftId, i + 1, pMedia).then(url => { if (url) s.image = url; });
      if (subject === 'scene') return genScenePhoto(hint, keyword, draftId, i + 1).then(url => { if (url) s.image = url; });
      return genDailyPhoto(keyword, draftId, i + 1, hint, !!s.photoFull).then(url => { if (url) s.image = url; });
    }
    if (CLOSEUP_PHOTO_TYPES.has(s.type)) {
      return genCloseupPhoto(s.closeupSubject || headTextOf(s) || keyword, draftId, i + 1, pMedia).then(url => { if (url) s.image = url; });
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
// 해시태그 정규화: 브랜드 필수(맨 앞) + 관련 4개 = 정확히 5개. (US=#millimilli / KR=#밀리밀리)
function normalizeHashtags(str, region) {
  const brand = region === 'us' ? '#millimilli' : '#밀리밀리';
  const toks = String(str || '').split(/[\s,]+/).map(t => t.trim()).filter(t => t.startsWith('#') && t.length > 1);
  const isBrand = (t) => /^#(millimilli|밀리밀리)$/i.test(t);
  const seen = new Set([brand.toLowerCase()]);
  const others = [];
  for (const t of toks) {
    if (isBrand(t)) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k); others.push(t);
    if (others.length >= 4) break;
  }
  return [brand, ...others].join(' ');
}

async function seedDraft(sb, { channel, region, platform, date, mediaUrls, caption, hashtags, slides, market, keyword, axis, coverType }) {
  hashtags = normalizeHashtags(hashtags, region); // 브랜드 필수 + 4개 = 5개 강제
  // 재베이킹 메타(앱에서 슬라이드 원문으로 카드 다시 굽기) — slidesRaw=생성된 slides JSON + 생성 컨텍스트.
  const slidesRaw = slides ? JSON.parse(JSON.stringify(slides)) : null;
  const { data: rows } = await sb.from('creator_drafts').select('id, data').limit(400);
  const existing = (rows || []).find(r => r.data && r.data.version === 'milli-v1' && r.data.channel === channel && r.data.date === date && (r.data.slotType || '') === SLOT);
  if (existing) {
    const d = existing.data;
    d.mediaUrls = mediaUrls; d.format = 'cardnews'; d.status = 'review';
    d.caption = caption; d.hashtags = hashtags; d.source = 'carousel-daily'; d.updatedAt = new Date().toISOString();
    if (slides) d.slides = slides; // 재베이킹·수정 재생성용 슬라이드 원문 저장
    if (slidesRaw) d.slidesRaw = slidesRaw; // 앱 재베이킹용 슬라이드 원문 사본
    if (market != null) d.market = market;
    if (keyword != null) d.keyword = keyword;
    if (axis != null) d.axis = axis;
    if (coverType != null) d.coverType = coverType;
    await sb.from('creator_drafts').update({ data: d }).eq('id', existing.id);
    return { channel, id: existing.id, action: 'updated' };
  }
  const id = `milli_${channel}_${date}_${SLOT}_${Date.now().toString(36)}`;
  const draft = {
    id, version: 'milli-v1', channel, region, platform, date, slotType: SLOT,
    status: 'review', format: 'cardnews', caption, hashtags, mediaUrl: null, mediaUrls,
    slides: slides || null, // 슬라이드 원문(커버 재베이킹·텍스트 수정 재생성용)
    slidesRaw, // 앱 재베이킹용 슬라이드 원문(생성 JSON 사본)
    market: market ?? null, keyword: keyword ?? null, axis: axis ?? null, coverType: coverType ?? null, // 재베이킹 메타
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
  //   ?date=YYYY-MM-DD = 특정 날짜 타깃(과거분 재생성용, force 와 함께).
  const dateOverride = (req.query?.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) ? req.query.date : null;
  const today = dateOverride || kstTomorrow();
  // ?coverImageUrl= : 커버 이미지를 외부(MCP Marketing Studio 생성분)로 주입 — 잼/만료 우회.
  //   인증(CRON_SECRET)은 위에서 끝났고, SSRF 방어로 https + 신뢰 CDN 호스트만 허용.
  const COVER_HOSTS = new Set(['d8j0ntlcm91z4.cloudfront.net', 'd2ol7oe51mr4n9.cloudfront.net', 'zre3xstenznneqve.public.blob.vercel-storage.com', 'cdn.higgsfield.ai']);
  let coverImageUrl = null;
  if (req.query?.coverImageUrl) {
    try {
      const u = new URL(decodeURIComponent(req.query.coverImageUrl));
      if (u.protocol === 'https:' && COVER_HOSTS.has(u.hostname)) coverImageUrl = u.toString();
      else return res.status(400).json({ error: 'invalid coverImageUrl (https + 허용 CDN 호스트만)' });
    } catch { return res.status(400).json({ error: 'malformed coverImageUrl' }); }
  }
  const dow = kstTomorrowDow(); // 내일의 KST 요일로 정보성 게이트
  if (!force && !INFO_DAYS.has(dow)) return res.status(200).json({ ok: true, skip: 'not_info_day(tomorrow)', dow, target: today });

  try {
    const sb = getSupabase();
    // 키워드 로테이션 + 커버 레이아웃 로테이션
    const n = Number(await redis.get('creator:carousel:rotation').catch(() => 0)) || 0;
    const kwObj = KEYWORDS[n % KEYWORDS.length];
    const keyword = typeof kwObj === 'string' ? kwObj : kwObj.kw;       // 하위호환
    const product = PRODUCTS[(kwObj && kwObj.p) || 'mist'] || PRODUCTS.mist; // 주제→제품
    const cn = Number(await redis.get('creator:carousel:cover-rotation').catch(() => 0)) || 0;
    const coverType = COVER_TYPES[cn % COVER_TYPES.length];
    const axis = SERIES_SEQ[n % SERIES_SEQ.length]; // 시리즈 결(발견/신뢰/캐릭터) 로테이션 — 안 지겨움+팬화
    // 커버 사진 변주(안 지겹게): 5회 중 1회는 환기 — 풀이미지 인물 또는 핀터레스트 무드 우선.
    const sv = Number(await redis.get('creator:carousel:subject-variety').catch(() => 0)) || 0;
    const varietyHint = (sv % 5 === 4)
      ? '사진 변주(중요): 이번 커버는 환기 차원 — person이면 photoFull=true(상반신/전신)로, 또는 주제와 어울리면 scene(핀터레스트 무드 배경)을 우선 선택할 것.'
      : '';
    if (!dry) {
      await redis.set('creator:carousel:rotation', n + 1).catch(() => {});
      await redis.set('creator:carousel:cover-rotation', cn + 1).catch(() => {});
      await redis.set('creator:carousel:subject-variety', sv + 1).catch(() => {});
    }

    // 멱등: 오늘 이미 생성됐으면 스킵
    const { data: rows } = await sb.from('creator_drafts').select('id, data').limit(400);
    const done = (rows || []).some(r => r.data && r.data.version === 'milli-v1' && r.data.date === today && (r.data.slotType || '') === SLOT && Array.isArray(r.data.mediaUrls) && r.data.mediaUrls.length);
    if (done && !force) return res.status(200).json({ ok: true, skip: 'already_done', today, keyword });

    if (dry) {
      const kr = await genSlides('kr', keyword, coverType, axis, varietyHint, product).catch(e => ({ error: e.message }));
      return res.status(200).json({ ok: true, dry: true, today, keyword, product: product.name, coverType, axis, sampleKR: kr });
    }

    const fonts = await loadFonts();
    const results = [];
    // ── KR·US 통일: 콘셉트·사진 1회만 생성(공유), US = 번역본. 사진 URL 동일. ──
    //   1) KR genSlides → slides   2) attachPhotos(공유 이미지 주입)
    //   3) US = translateSlidesToEn(텍스트만 영어, image/숫자/구조 그대로)
    //   4) bake: KR slides→KR 카드, US slides→US 카드 (둘 다 같은 image URL)
    //   5) seed: kr_ig·kr_tt=KR mediaUrls, us_ig·us_tt=US mediaUrls
    try {
      const krCopy = await genSlides('kr', keyword, coverType, axis, varietyHint, product);
      const photoDraftId = `shared_${today}_${Date.now().toString(36)}`;
      // 사진 1세트 생성·주입(공유) — 제품컷은 매핑된 제품 에셋 사용. US 번역본도 동일 image URL 사용
      await attachPhotos(krCopy.slides, keyword, photoDraftId, coverImageUrl, product);
      // US = KR 번역본(텍스트만). 실패 시 KR 카피로 폴백(영어 미적용이라도 발행은 유지).
      let usCopy;
      try { usCopy = await translateSlidesToEn(krCopy); }
      catch (e) { console.warn('[carousel-daily] translate 실패(KR 폴백):', e.message); usCopy = krCopy; }

      const krDraftId = `kr_${today}_${Date.now().toString(36)}`;
      const usDraftId = `us_${today}_${Date.now().toString(36)}`;
      const krMediaUrls = await bakeCards(krCopy.slides, 'kr', krDraftId, fonts);
      const usMediaUrls = await bakeCards(usCopy.slides, 'us', usDraftId, fonts);
      const byMarket = {
        kr: { mediaUrls: krMediaUrls, caption: krCopy.caption || '', hashtags: krCopy.hashtags || '', slides: krCopy.slides },
        us: { mediaUrls: usMediaUrls, caption: usCopy.caption || '', hashtags: usCopy.hashtags || '', slides: usCopy.slides },
      };
      for (const ch of CHANNELS) {
        const mk = byMarket[ch.region];
        const seeded = await seedDraft(sb, {
          channel: ch.key, region: ch.region, platform: ch.platform, date: today,
          mediaUrls: mk.mediaUrls, caption: mk.caption, hashtags: mk.hashtags, slides: mk.slides,
          market: ch.region, keyword, axis, coverType, // 재베이킹 메타(slidesRaw 와 함께 저장)
        });
        results.push(seeded);
      }
    } catch (e) { results.push({ error: e.message }); }
    const summary = { ok: true, today, keyword, coverType, axis, results };
    try { await redis.set('creator:carousel-daily:latest', { ...summary, at: new Date().toISOString() }, { ex: 86400 * 3 }); } catch {}
    return res.status(200).json(summary);
  } catch (e) {
    console.error('[carousel-daily]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

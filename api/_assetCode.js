// 소재코드 — 제작과 성과를 잇는 다리. docs/content-team-design.md §2.
//
//   AD-US-MST-MYTH-FACE-REEL-260922-01
//   트랙-시장-제품-앵글-훅타입-포맷-날짜-변형
//
// 대시보드가 코드를 발급 → 담당자가 Meta 에 "그 이름 그대로" 업로드 → ad_name 으로 조인.
// 별도 API 권한 없이 오늘 당장 동작. 대신 이름이 바뀌면 끊기므로 화면에서 미분류를 드러낸다.
//
// 기존 소재 643개는 레거시 네이밍이라 parseLegacy() 로 최대한 역추정하고, 못 맞춘 축은 null.
// null 은 "없음"이 아니라 "아직 모름" — 화면에서 미분류로 표시해 백필 대상으로 삼는다.

export const AXES = {
  track:   { AD: '광고소재', OFF: '오피셜' },
  market:  { KR: '한국', US: '미국' },
  product: { MST: '미스트', AMP: '앰플', SET: '세트', BRD: '브랜드' },
  angle: {
    BA: '비포애프터', CLI: '임상수치', POV: '상황극', MYTH: '반전·통념깨기',
    AUTH: '권위', OFFER: '오퍼·가격', TIP: '정보꿀팁', UGC: '실후기',
  },
  hook:    { FACE: '얼굴클로즈업', RESULT: '결과선공개', SPLIT: '화면대비', TEXT: '문장훅', SCENE: '상황', ASMR: '질감·소리' },
  format:  { REEL: '영상', CARD: '카드뉴스', STILL: '정적1장' },
};

const has = (axis, v) => v != null && Object.prototype.hasOwnProperty.call(AXES[axis], v);

export function buildAssetCode({ track, market, product, angle, hook, format, date, variant = 1 }) {
  const d = date ? String(date).replace(/-/g, '').slice(2) : '';
  const v = String(variant).padStart(2, '0');
  return [track, market, product, angle, hook, format, d, v].join('-');
}

// 정식 코드 파싱. 형식이 어긋나면 null 을 돌려 레거시 경로로 넘긴다.
function parseStrict(name) {
  const m = /^(AD|OFF)-(KR|US)-([A-Z]+)-([A-Z]+)-([A-Z]+)-([A-Z]+)-(\d{6})-(\d{2})$/.exec(String(name).trim());
  if (!m) return null;
  const [, track, market, product, angle, hook, format, date, variant] = m;
  if (!has('product', product) || !has('angle', angle) || !has('hook', hook) || !has('format', format)) return null;
  return { track, market, product, angle, hook, format, date, variant: Number(variant), coded: true };
}

// ── 레거시 역추정 ──
// 실제 운영 중인 이름들에서 관찰된 토큰만 매핑한다(추측 최소화).
//   REVIVE_A_1 · [AUTO] GLOW3_DESK_BOTTLE · [AUTO] REUSE_FLIGHT_GLASS_0911
//   MM-KR-AMP-BA-WIDE-260819-02 · MM-KR-OY-MST-01-MAC · US_MM_DUO_PAYBACK_0825_storytease
const LEGACY_PRODUCT = [
  [/\b(AMP|AMPOULE|AMPLE)\b/i, 'AMP'],
  [/\b(MST|MIST)\b/i, 'MST'],
  [/\bSET\b/i, 'SET'],
  [/\bDUO\b/i, 'SET'],
];
const LEGACY_ANGLE = [
  [/\b(BA|BEFOREAFTER|BEFORE_AFTER|LINES_FADING|PORE)\b/i, 'BA'],
  [/\b(CLI|CLINICAL|DALTON)\b/i, 'CLI'],
  [/\b(POV|FLIGHT|DESK|MAKEUP|WHAT_WAS_I_DOING)\b/i, 'POV'],
  [/\b(MYTH|REVIVE|PAYBACK)\b/i, 'MYTH'],
  [/\b(AUTH|TOP|OY|OLIVE|AMAZON|RANK)\b/i, 'AUTH'],
  [/\b(OFFER|PROMO|SALE|세일|프로모)\b/i, 'OFFER'],
  [/\b(GLA|GLASS|GLASSKIN|GLOW)\b/i, 'TIP'],
];
const LEGACY_HOOK = [
  [/\b(MACRO|MAC|CLOSE|ASMR)\b/i, 'ASMR'],
  [/\b(SPLIT|MIRROR|VS)\b/i, 'SPLIT'],
  [/\b(FACE|SOLO|WIDE)\b/i, 'FACE'],
  [/\b(RESULT|FADING|PAYBACK)\b/i, 'RESULT'],
  [/\b(STORYTEASE|TEASE|TEXT)\b/i, 'TEXT'],
  [/\b(FLIGHT|DESK|SCENE|POV)\b/i, 'SCENE'],
];
const pick = (table, s) => { for (const [re, v] of table) if (re.test(s)) return v; return null; };

// `_` 는 단어문자라 /\bAMP\b/ 가 "US_AMP_GLASSKIN" 안에서 매칭되지 않는다.
// 구분자를 공백으로 펴야 토큰 경계가 생긴다.
const flatten = (s) => String(s || '').replace(/[_\-.]+/g, ' ');

// 시리즈 = 그 소재가 속한 문법 계열. 앞머리의 시장·브랜드 토큰(US/KR/MM/MILLI)은 계열이 아니므로 건너뛴다.
const SERIES_SKIP = /^(US|KR|MM|MILLI|AUTO|NEW)$/i;
function extractSeries(name) {
  const toks = flatten(String(name).replace(/^\[AUTO\]\s*/i, '')).trim().split(/\s+/).filter(Boolean);
  for (const t of toks) {
    if (SERIES_SKIP.test(t)) continue;
    if (/^\d+$/.test(t)) continue;            // 날짜·번호
    return t.toUpperCase();
  }
  return null;
}

function parseLegacy(name, { market, isVideo } = {}) {
  const s = flatten(name);
  const series = extractSeries(name);
  return {
    track: 'AD',
    market: /\bUS\b|미국/i.test(s) ? 'US' : (/\bKR\b|한국|자사몰|올영|올리브영|스스/i.test(s) ? 'KR' : (market ? market.toUpperCase() : null)),
    product: pick(LEGACY_PRODUCT, s),
    angle: pick(LEGACY_ANGLE, s),
    hook: pick(LEGACY_HOOK, s),
    format: isVideo === true ? 'REEL' : isVideo === false ? 'STILL' : null,
    series,
    coded: false,
  };
}

/** 광고 이름 → 6축. 정식 코드면 그대로, 아니면 역추정(coded:false). */
export function parseAssetCode(name, ctx = {}) {
  const strict = parseStrict(name);
  if (strict) return { ...strict, series: `${strict.product}·${strict.angle}`, raw: name };
  return { ...parseLegacy(name, ctx), raw: name };
}

// ── 판정 (docs/content-team-design.md §1 확정 기준) ──
export const THRESHOLDS = {
  hookRate:      { pass: 34, replace: 14 },
  holdRate:      { pass: 39, replace: 26 },
  clickFromView: { pass: 39, replace: 10 },
};
const LABEL = { hookRate: '훅률', holdRate: '유지율', clickFromView: '본→클릭' };

const gradeOne = (v, t) => (v == null ? null : v >= t.pass ? 'pass' : v < t.replace ? 'replace' : 'warn');

/**
 * 콘텐츠 3지표 → 판정 + 처방.
 * 2개 이상 'replace' = 폐기 / 1개만 'replace' = 그 구간만 수정(전체 재생성 금지).
 */
export function gradeContent(content) {
  if (!content?.isVideo) return { grade: 'n/a', reason: '영상 아님 — 영상 지표 없음', parts: {} };
  const parts = {};
  for (const k of Object.keys(THRESHOLDS)) parts[k] = gradeOne(content[k], THRESHOLDS[k]);
  const scored = Object.values(parts).filter(Boolean);
  if (!scored.length) return { grade: 'n/a', reason: '지표 미수집', parts };

  const bad = Object.keys(parts).filter(k => parts[k] === 'replace');
  const pass = scored.filter(g => g === 'pass').length;

  if (bad.length >= 2) return { grade: 'drop', reason: `${bad.map(k => LABEL[k]).join('·')} 동시 미달 — 앵글 교체(폐기)`, parts, fix: 'angle' };
  if (bad.length === 1) {
    const fix = {
      hookRate:      { reason: '내용은 되는데 첫 3초가 약함 — 앞 3초만 교체', fix: 'hook' },
      holdRate:      { reason: '들어왔는데 중간 이탈 — 3~8초 전개 재편집·길이 단축', fix: 'body' },
      clickFromView: { reason: '다 봤는데 안 누름 — 엔드카드·CTA·오퍼 교체', fix: 'endcard' },
    }[bad[0]];
    return { grade: 'remix', ...fix, parts };
  }
  if (pass === scored.length) return { grade: 'win', reason: '전 지표 합격 — 이 조합 증량', parts, fix: null };
  return { grade: 'keep', reason: '기준 내 — 유지', parts, fix: null };
}

export const GRADE_META = {
  win:    { label: '위너',   color: '#0A7D32' },
  keep:   { label: '유지',   color: '#6E6E73' },
  remix:  { label: '부분수정', color: '#B26A00' },
  drop:   { label: '폐기',   color: '#C0392B' },
  'n/a':  { label: '측정불가', color: '#AEAEB2' },
};

// 광고 계정 단일 진실원본(SSOT) — 2026-09-22 Meta 광고관리자 실측.
// 이전까지 ad-winners / marketer / ad-optimize / mist-ads 가 제각각 하드코딩해서 계정이 서로 달랐음.
//
// ⚠️ 고친 버그: Vercel env `META_AD_ACCOUNTS` 가 배열이 아니라 객체({"이름":"id"})로 저장돼 있는데
//    기존 코드가 `for (const a of parsed)` 로 순회 → TypeError → 바깥 try/catch 가 조용히 삼킴.
//    그래서 env 로 추가한 계정(랄라라운지_한국·엠마워시_오피셜)이 **에러 없이 통째로 무시**되고 있었음.
//    아래 normalizeEnv 가 객체/배열/문자열을 전부 받는다.
//
// attribution — 이 계정의 구매가 Meta 로 귀속되는가. **ROAS 판정 가능 여부를 가르는 핵심 필드.**
//   'pixel'   자사몰 + Meta 픽셀       → 소재별 ROAS 신뢰 가능. 300% 판정 대상.
//   'amazon'  아마존 랜딩              → Meta 는 클릭까지만 앎. ROAS 산출 불가.
//                                        (아마존 스폰서광고·오가닉이 섞여 집계 ROAS도 의미 없음 — 2026-09-22 확인)
//   'none'    트래픽 캠페인/외부몰     → 전환 미귀속. ROAS 0 이 정상이므로 위너 판정에서 제외해야 함.
//   'unknown' 미확인                   → 판정 보류.

export const AD_ACCOUNTS = [
  // ── KR ──
  { id: '2327868604313508', name: '밀리밀리_인하우스',        market: 'kr', attribution: 'pixel',   dest: '자사몰' },
  { id: '855116430496295',  name: '랄라라운지_한국',          market: 'kr', attribution: 'pixel',   dest: '자사몰' },
  { id: '791241442793311',  name: '밀리밀리_한국',            market: 'kr', attribution: 'none',    dest: '스마트스토어' },
  { id: '623851980786807',  name: '밀리밀리_한국_올리브영',    market: 'kr', attribution: 'none',    dest: '올리브영(트래픽)' },
  { id: '864303894888410',  name: '엠마워시_오피셜',          market: 'kr', attribution: 'unknown', dest: '-' },
  { id: '1328902060959344', name: '밀리밀리_오피셜광고계정',   market: 'kr', attribution: 'unknown', dest: '-' },
  { id: '2108817439486566', name: 'Collaborative ads_MILLI',  market: 'kr', attribution: 'unknown', dest: '-' },
  // ── US ── (2026-09-17 런칭. ⚠️ 미국 계정이지만 청구 통화는 KRW)
  { id: '1019588217240709', name: '밀리밀리_US',              market: 'us', attribution: 'amazon',  dest: '아마존 US' },
  // ── JP ── (이번 범위 밖 — 목록에만 둠)
  { id: '1628402194365775', name: '밀리밀리_일본',            market: 'jp', attribution: 'unknown', dest: '-' },
];

// env 로 계정을 덧붙일 때 쓰는 형식 3종을 모두 허용.
//   {"이름":"123"}  ·  [{name,id}]  ·  ["123","456"]  ·  "123,456"
function normalizeEnv(raw) {
  if (!raw) return [];
  let parsed = raw;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    if (s.startsWith('{') || s.startsWith('[')) {
      try { parsed = JSON.parse(s); } catch { return []; }
    } else {
      // 쉼표 구분 id 나열
      return s.split(',').map(x => x.trim()).filter(Boolean).map(id => ({ id: id.replace(/^act_/, ''), name: `act_${id}` }));
    }
  }
  const out = [];
  if (Array.isArray(parsed)) {
    for (const a of parsed) {
      const id = String(typeof a === 'string' ? a : (a?.id ?? '')).replace(/^act_/, '').trim();
      if (id) out.push({ id, name: (typeof a === 'object' && a?.name) || `act_${id}` });
    }
  } else if (parsed && typeof parsed === 'object') {
    // ← 실제 저장 형태. 여기가 터지던 자리.
    for (const [name, v] of Object.entries(parsed)) {
      const id = String(v ?? '').replace(/^act_/, '').trim();
      if (id) out.push({ id, name });
    }
  }
  return out;
}

/**
 * 조회 대상 광고 계정 목록.
 * @param {object}   opts
 * @param {string[]} opts.markets      예: ['kr','us'] — 생략 시 jp 제외 전체
 * @param {string[]} opts.attribution  예: ['pixel'] — 생략 시 전체
 */
export function resolveAdAccounts({ markets, attribution } = {}) {
  const list = [...AD_ACCOUNTS];
  for (const e of normalizeEnv(process.env.META_AD_ACCOUNTS)) {
    if (!list.some(x => x.id === e.id)) {
      list.push({ ...e, market: 'kr', attribution: 'unknown', dest: '-', fromEnv: true });
    }
  }
  const mk = markets?.length ? new Set(markets) : null;
  const at = attribution?.length ? new Set(attribution) : null;
  return list.filter(a =>
    (mk ? mk.has(a.market) : a.market !== 'jp') &&
    (at ? at.has(a.attribution) : true)
  );
}

export const byId = (id) => AD_ACCOUNTS.find(a => a.id === String(id).replace(/^act_/, '')) || null;

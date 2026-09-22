// POST /api/content/capcut-sync — CapCut 영상 소재를 소재로그 시트에 편입.
// 인증: Authorization: Bearer ${CRON_SECRET}
// body: { projects: [...] }   ← scripts/capcut-index.mjs 가 보냄
// 옵션: ?dry=1
//
// 왜 필요한가: 소재로그(206건)는 전부 정적 이미지다. 영상은 CapCut 으로 따로 만들어
//   시트를 안 거쳤다 — 그래서 유형 화면의 '영상형'이 0건이었다. 제작 경로가 둘인데 로그는 하나뿐.
//
// ⚠️ 과거분은 성과 조인이 구조적으로 불가능하다 (실측 2026-09-22: KR 0% · US 13%).
//   CapCut 자막은 **화면에 박힌 글자**이고 Meta 광고문구는 **캡션**이라 서로 다른 텍스트다.
//     자막  "What is that spray you've been using all flight?"
//     캡션  "Mid-flight, the flight attendant asked what I was spraying."
//   같은 개념을 다르게 쓴다. 문자열 대조로는 못 찾고, 억지로 붙이면 성과가 엉뚱한 소재에 붙는다.
//   → 과거 28건은 **제작 로그로만** 남긴다(상태 '과거분'). 성과는 비운다.
//      편집패턴·자막·BGM 은 크래프트 참고용으로 충분한 값어치가 있다.
//
// ✅ 앞으로는 조인이 필요 없다. **생성 시점에 소재ID를 발급**하고 담당자가 그 이름 그대로
//   Meta 에 올리면 정적 소재와 똑같이 자동으로 붙는다. 추론이 아니라 설계로 해결.
//   (자막 매칭은 보조로 남겨두되, 맞으면 쓰고 아니면 비운다.)

import { readSheet, getGoogleAccessToken } from '../utils/sheets.js';

export const config = { maxDuration: 300 };

const GRAPH = 'https://graph.facebook.com/v19.0';
const SHEETS = {
  us: { id: process.env.CREATIVE_LOG_US_SHEET_ID || '1TT130QL2nJbbbpMJrM1pTAAP5TpTgM9n6wXt-ZcKdm4', name: 'MM_소재로그_LIVE' },
  kr: { id: process.env.CREATIVE_LOG_KR_SHEET_ID || '1nE-4IBpl7l6nY1UGwBrFGsfopFdOJY8RUC9pDADPDuk', name: 'MM_소재로그_KR_LIVE' },
};

// ── 분류 규칙 — 시트의 대카/소카 체계를 그대로 쓴다(새 축을 만들지 않는다) ──
// 자막에서 유형을 읽는다. 근거 없으면 null — 지어내지 않는다.
const CONCEPT_RULES = [
  [/before|after|4 ?weeks?|4주|주 전|같은 (사람|볼)|same (girl|face)|28 days/i, 'BA'],
  [/glass ?skin|글래스|물광|dewy|glow/i, 'GLA'],
  [/clinical|임상|n=\d+|p<|참가자|4-week clinical/i, 'CLI'],
  [/ingredient|성분|dalton|달톤|peptide|펩타이드|ppm|exosome|엑소좀/i, 'ING'],
  [/#1|olive ?young|올리브영|amazon best|베스트셀러|top ?\d+/i, 'AUT'],
  [/\$\d|원\b|1\+1|할인|free|무료|sale|세일|coupon/i, 'PRO'],
];
const SHOT_RULES = [
  [/filler|필러|시술|clinic|피부과|needle/i, 'FILLER'],
  [/smile ?line|팔자/i, 'SMILE'],
  [/pov|mid-?flight|상황|office|사무실|기내/i, 'POV'],
  [/pore|모공/i, 'PORE'],
  [/dry|건조|속건조|dehydrated/i, 'DRY'],
  [/gatekeep|secret|비밀|hack|🤫/i, 'SECRET'],
  [/\d+\s*(가지|ways|holy grails|things)/i, 'LIST'],
];
const PRODUCT_RULES = [
  [/ampoule|앰플/i, 'AMPOULE'], [/mist|미스트/i, 'MIST'], [/duo|세트|set/i, 'DUO'],
];
const pick = (rules, s) => { for (const [re, v] of rules) if (re.test(s)) return v; return null; };

// 자막 대조용 정규화 — 이모지·구두점·공백 제거 후 소문자.
const key = (s) => String(s || '').toLowerCase()
  .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
  .replace(/[^\p{L}\p{N}]+/gu, '')
  .slice(0, 60);

async function fetchCreativeText(adIds, token) {
  const out = {};
  for (let i = 0; i < adIds.length; i += 50) {
    const chunk = adIds.slice(i, i + 50);
    try {
      const r = await fetch(`${GRAPH}/?ids=${chunk.join(',')}&fields=name,creative{title,body,object_story_spec{link_data{message,name},video_data{message,title}}}&access_token=${token}`);
      const d = await r.json();
      if (d.error) continue;
      for (const [id, ad] of Object.entries(d || {})) {
        const c = ad?.creative || {}, oss = c.object_story_spec || {};
        const ld = oss.link_data || {}, vd = oss.video_data || {};
        out[id] = [c.title, c.body, ld.name, ld.message, vd.title, vd.message].filter(Boolean).join(' \n ');
      }
    } catch { /* 문구 없으면 매칭 실패로 처리 */ }
  }
  return out;
}

const A1 = (n) => { let s = '', x = n; do { s = String.fromCharCode(65 + (x % 26)) + s; x = Math.floor(x / 26) - 1; } while (x >= 0); return s; };

async function appendRows(sheetId, startRow, width, values) {
  const token = await getGoogleAccessToken();
  const range = `A${startRow}:${A1(width - 1)}${startRow + values.length - 1}`;
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return { range, updatedCells: d.updatedCells || 0 };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });

  const dry = req.query?.dry === '1';
  const projects = req.body?.projects;
  if (!Array.isArray(projects) || !projects.length) return res.status(400).json({ error: 'projects 배열 필요' });

  const token = process.env.META_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return res.status(200).json({ skipped: true, reason: 'Meta 토큰 없음' });

  try {
    // Meta 소재 + 문구
    const { default: adWinners } = await import('../agents/ad-winners.js');
    const inner = { status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
    await adWinners({ method: 'GET', query: { market: 'all', minSpend: '0', top: '1000', preset: 'last_90d' } }, inner);
    const ads = (inner.body?.ads || []);
    const texts = await fetchCreativeText(ads.map(a => a.ad_id).filter(Boolean), token);

    // 자막 ↔ Meta 문구 매칭. 훅(첫 자막)이 문구에 통째로 들어있으면 같은 소재로 본다.
    const matchOf = (p) => {
      const cands = (p.texts || []).slice(0, 4).map(key).filter(k => k.length >= 12);
      if (!cands.length) return null;
      for (const a of ads) {
        const body = key(texts[a.ad_id] || '') + key(a.ad_name);
        if (!body) continue;
        if (cands.some(c => body.includes(c))) return a;
      }
      return null;
    };

    // 시트별 기존 ID·행수 파악 (중복 방지 + 이어붙일 위치)
    const state = {};
    for (const [mk, sh] of Object.entries(SHEETS)) {
      const rows = await readSheet(sh.id, 'A1:Z400');
      const H = rows[0] || [];
      const data = rows.slice(1).filter(r => r[0]);
      state[mk] = { H, width: H.length, nextRow: data.length + 2, ids: new Set(data.map(r => String(r[0]).trim())), name: sh.name };
    }

    const result = { dry, projects: projects.length, markets: {} };
    for (const mk of ['kr', 'us']) {
      const st = state[mk];
      const mine = projects.filter(p => p.lang === mk);
      const rows = [], preview = [];
      let matched = 0, seq = 0;

      for (const p of mine) {
        const blob = (p.texts || []).join(' ');
        const ad = matchOf(p);
        if (ad) matched++;
        const product = pick(PRODUCT_RULES, blob) || 'MIST';
        const concept = pick(CONCEPT_RULES, blob) || 'BA';
        const shot = pick(SHOT_RULES, blob) || 'CLOSE';
        const d = (p.editedAt || '').replace(/-/g, '').slice(2);
        seq += 1;
        // 영상임을 코드에서 바로 알 수 있게 VID 토큰을 넣는다(정적과 섞이지 않게).
        const id = `MM-${mk === 'kr' ? 'KR-' : ''}VID-${product.slice(0, 3)}-${concept}-${shot}-${d}-${String(seq).padStart(2, '0')}`;
        if (st.ids.has(id)) continue;

        // 편집패턴 = 영상 사양을 시트 형식(문장 레시피)으로. 기존 정적 행과 같은 칸을 쓴다.
        const pattern = [
          `[영상] ${p.canvas} · ${p.durationSec}초 · ${p.cuts}컷`,
          p.transitions.length ? `전환 ${p.transitions.join('/')}` : '하드컷',
          p.effects.length ? `효과 ${p.effects.join('/')}` : null,
          p.music.length ? `BGM ${p.music.join('/')}` : 'BGM 없음',
          p.sfx.length ? `SFX ${p.sfx.join('/')}` : null,
          `자막 ${p.texts.length}개`,
          `CapCut: ${p.project}`,
        ].filter(Boolean).join(' · ');

        const row = new Array(st.width).fill('');
        const set = (prefix, v) => { const i = st.H.findIndex(h => String(h || '').startsWith(prefix)); if (i >= 0) row[i] = v; };
        set('소재ID', id);
        set('생성일', p.editedAt);
        set('제품', mk === 'kr' ? `${product}_KR` : product);
        set('대카', concept);
        set('소카', shot);
        set('아바타', '실사(CapCut 편집)');
        set('원본', 'CapCut 수작업');
        set('편집패턴', pattern);
        set('핵심클레임', (p.texts || []).slice(0, 4).join(' / ').slice(0, 300));
        set('파일위치', `~/Movies/CapCut/.../${p.project}`);
        set('Meta광고이름', ad ? ad.ad_name : '');
        // 과거분은 '집행 안 함'이 아니라 '집행했으나 어느 광고인지 특정 불가'다.
        // 빈칸이나 '매칭실패'로 두면 미집행으로 읽혀 유형 판정에서 억울하게 빠진다.
        set('상태', ad ? 'READY' : '과거분(영상·성과조인불가)');
        rows.push(row);
        preview.push({ id, concept, shot, matched: !!ad, meta: ad?.ad_name || null, hook: (p.hook || '').slice(0, 44) });
      }

      result.markets[mk] = {
        sheet: st.name, projects: mine.length, newRows: rows.length, matched,
        matchRate: mine.length ? Math.round(matched / mine.length * 100) + '%' : '—',
        note: '과거분은 자막↔캡션이 달라 성과 조인 불가 — 제작 로그로만 기록. 신규는 생성 시 소재ID 발급으로 해결.',
        startRow: st.nextRow,
        ...(dry ? { preview: preview.slice(0, 8) } : {}),
      };
      if (!dry && rows.length) Object.assign(result.markets[mk], await appendRows(SHEETS[mk].id, st.nextRow, st.width, rows));
    }
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

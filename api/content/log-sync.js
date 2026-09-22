// GET /api/content/log-sync — 소재로그 시트의 성과 7칼럼을 Meta 실측으로 채운다.
// 인증: Authorization: Bearer ${CRON_SECRET}
// 옵션: ?dry=1  ?market=us|kr|all  ?preset=last_90d
//
// 왜: 시트(US 140 · KR 66)는 제작 정보가 100% 차 있는데 성과 칼럼은 전부 비어 있다.
//     담당자가 Meta·아마존을 키값으로 따로 열어 보던 자리다. 그걸 자동으로 메운다.
//
// 조인: 시트 `Meta광고이름`(= `소재ID`) ↔ Meta `ad_name`.
//   Meta 쪽엔 `[AUTO] ` 접두가 붙는 경우가 있어 정규화 후 대조한다.
//   ⚠️ 실측(2026-09-22): 시트 206건 중 Meta 에 실제로 도는 건 37건(18%)뿐이다.
//      조인이 안 되는 게 아니라 **만들고 집행 안 한 소재가 82%** 라는 뜻 —
//      미집행은 빈칸이 아니라 상태로 구분해 남긴다(집행 안 된 걸 '성과 없음'으로 읽으면 안 됨).

import { readSheet, getGoogleAccessToken } from '../utils/sheets.js';
import { gradeContent } from '../_assetCode.js';

export const config = { maxDuration: 300 };

// 시트 ID — env 우선, 없으면 실측값 폴백.
const SHEETS = {
  us: { id: process.env.CREATIVE_LOG_US_SHEET_ID || '1TT130QL2nJbbbpMJrM1pTAAP5TpTgM9n6wXt-ZcKdm4', name: 'MM_소재로그_LIVE', cur: '$' },
  kr: { id: process.env.CREATIVE_LOG_KR_SHEET_ID || '1nE-4IBpl7l6nY1UGwBrFGsfopFdOJY8RUC9pDADPDuk', name: 'MM_소재로그_KR_LIVE', cur: '₩' },
};

const norm = (s) => String(s || '').replace(/^\[AUTO\]\s*/i, '').trim();
const colIdx = (header, prefix) => header.findIndex(h => String(h || '').trim().startsWith(prefix));
const A1 = (n) => { let s = '', x = n; do { s = String.fromCharCode(65 + (x % 26)) + s; x = Math.floor(x / 26) - 1; } while (x >= 0); return s; };

async function writeRange(sheetId, range, values) {
  const token = await getGoogleAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.updatedCells || 0;
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const q = req.query || {};
  const dry = q.dry === '1';
  const markets = q.market && q.market !== 'all' ? [q.market] : ['us', 'kr'];

  try {
    // Meta 실측 — 최소지출 0 으로 전부 가져온다(집행됐으나 지출 적은 것도 기록해야 함).
    const { default: adWinners } = await import('../agents/ad-winners.js');
    const inner = { status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
    await adWinners({ method: 'GET', query: { market: 'all', minSpend: '0', top: '1000', preset: String(q.preset || 'last_90d') } }, inner);
    const ads = inner.body?.ads || [];
    const adBy = new Map();
    for (const a of ads) { adBy.set(a.ad_name, a); adBy.set(norm(a.ad_name), a); }

    const report = { dry, metaAds: ads.length, markets: {} };

    for (const mk of markets) {
      const sh = SHEETS[mk];
      const rows = await readSheet(sh.id, 'A1:Z400');
      const H = rows[0] || [];
      const data = rows.slice(1);

      const cId = colIdx(H, '소재ID');
      const cMeta = colIdx(H, 'Meta광고이름');
      // 성과 7칼럼 — 시트에 이미 설계돼 있는 자리. 순서 그대로 쓴다.
      const perfCols = ['지출', '노출', '3초시청', '훅률', '클릭', '구매', '판정'].map(p => colIdx(H, p));
      if (perfCols.some(i => i < 0) || cId < 0) {
        report.markets[mk] = { error: `칼럼 없음 (소재ID:${cId}, 성과:${perfCols.join(',')})` };
        continue;
      }
      const first = Math.min(...perfCols), last = Math.max(...perfCols);
      if (last - first !== 6) { report.markets[mk] = { error: '성과 7칼럼이 연속이 아님 — 수동 확인 필요' }; continue; }

      let matched = 0, unrun = 0;
      const values = data.map(r => {
        const cands = [String(r[cId] || '').trim(), String(r[cMeta] || '').trim()].filter(Boolean);
        let a = null;
        for (const c of cands) { a = adBy.get(c) || adBy.get(norm(c)); if (a) break; }
        if (!a) {
          unrun++;
          // ⚠️ 빈칸으로 두지 않는다. '미집행' 과 '집행했는데 성과 0' 은 전혀 다른 상태다.
          return ['', '', '', '', '', '', '미집행'];
        }
        matched++;
        const c = a.content || {};
        const g = gradeContent(c, a);
        const label = { win: '위너', keep: '유지', remix: '부분수정', drop: '폐기', 'n/a': '측정불가' }[g.grade] || g.grade;
        return [
          a.spend ?? '',
          a.impressions ?? '',
          c.isVideo && c.hookRate != null ? Math.round(a.impressions * c.hookRate / 100) : '',
          c.hookRate != null ? c.hookRate / 100 : '',          // 시트 백분율 서식용 소수
          c.outboundClicks ?? a.clicks ?? '',
          a.purchases ?? '',                                    // US 는 아마존 랜딩이라 대개 0
          g.fix ? `${label}(${{ hook: '앞3초', body: '중간', endcard: '엔드카드', angle: '앵글' }[g.fix]})` : label,
        ];
      });

      report.markets[mk] = {
        sheet: sh.name, rows: data.length, matched, unrun,
        matchRate: Math.round(matched / data.length * 100) + '%',
        range: `${A1(first)}2:${A1(last)}${data.length + 1}`,
      };
      if (!dry) report.markets[mk].updatedCells = await writeRange(sh.id, report.markets[mk].range, values);
      else report.markets[mk].sample = values.filter(v => v[6] !== '미집행').slice(0, 3);
    }

    return res.status(200).json(report);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

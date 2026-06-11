// GET /api/agents/ad-winners — 광고 소재별 성과 위너(ROAS 상위). marketer.js 패턴·토큰 재사용.
// 광고별: revenue=action_values 中 purchase 합(⚠️ actions 건수 아님 — ad-optimize 버그 주의), roas=revenue/spend,
//          purchases=actions 中 purchase 합, cvr=purchases/clicks. spend>=100,000 만, roas 내림차순 상위 15.
// 소재 썸네일: act_{id}/ads?fields=name,creative{thumbnail_url,image_url,object_story_spec} 로 ad→creative 매핑.
const GRAPH = 'https://graph.facebook.com/v19.0';

// 우선 2개 + 옵션(올리브영 + META_AD_ACCOUNTS env JSON 병합, id 중복 제거)
const BASE_ACCOUNTS = [
  { name: '밀리밀리_한국', id: '791241442793311' },
  { name: '밀리밀리_인하우스', id: '2327868604313508' },
  { name: '밀리밀리_한국_올리브영', id: '623851980786807' },
];
function resolveAccounts() {
  const list = [...BASE_ACCOUNTS];
  try {
    const env = process.env.META_AD_ACCOUNTS;
    if (env) {
      const parsed = JSON.parse(env);
      for (const a of parsed) {
        const id = String(typeof a === 'string' ? a : a.id).replace(/^act_/, '');
        if (id && !list.some(x => x.id === id)) list.push({ name: (a.name || `act_${id}`), id });
      }
    }
  } catch { /* env 형식 무시 */ }
  return list;
}

const PURCHASE_TYPES = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'];
// 우선순위 타입 중 존재하는 첫 타입만 합산(중복 집계 방지)
function sumPurchase(arr) {
  if (!Array.isArray(arr)) return 0;
  for (const t of PURCHASE_TYPES) {
    const hits = arr.filter(a => a.action_type === t);
    if (hits.length) return hits.reduce((s, a) => s + Number(a.value || 0), 0);
  }
  return 0;
}

async function fetchJson(url) {
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d;
}

// 계정의 ad→thumbnail_url 맵 (id·name 둘 다 키로)
async function creativeThumbs(accId, token) {
  const byId = {}, byName = {};
  let url = `${GRAPH}/act_${accId}/ads?fields=name,creative{thumbnail_url,image_url,object_story_spec}&limit=300&access_token=${token}`;
  for (let page = 0; page < 5 && url; page++) {
    const d = await fetchJson(url);
    for (const ad of (d.data || [])) {
      const c = ad.creative || {};
      const thumb = c.thumbnail_url || c.image_url || c.object_story_spec?.link_data?.picture || c.object_story_spec?.video_data?.image_url || null;
      if (ad.id) byId[ad.id] = thumb;
      if (ad.name) byName[ad.name] = thumb;
    }
    url = d.paging?.next || null;
  }
  return { byId, byName };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const token = process.env.META_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return res.status(200).json({ status: 'disconnected', message: 'META_ACCESS_TOKEN 또는 INSTAGRAM_ACCESS_TOKEN 필요', winners: [] });

  const minSpend = Number(req.query?.minSpend) || 100000;
  const topN = Number(req.query?.top) || 15;
  const accounts = resolveAccounts();
  const fields = 'ad_id,ad_name,campaign_name,spend,impressions,clicks,ctr,cpc,actions,action_values';

  try {
    const perAccount = await Promise.all(accounts.map(async (acc) => {
      try {
        const insUrl = `${GRAPH}/act_${acc.id}/insights?level=ad&date_preset=last_30d&fields=${fields}&limit=300&access_token=${token}`;
        const [ins, thumbs] = await Promise.all([fetchJson(insUrl), creativeThumbs(acc.id, token).catch(() => ({ byId: {}, byName: {} }))]);
        return (ins.data || []).map(row => {
          const spend = Number(row.spend) || 0;
          const clicks = Number(row.clicks) || 0;
          const revenue = sumPurchase(row.action_values); // 매출(action_values) — 건수 아님
          const purchases = sumPurchase(row.actions);      // 구매 건수(actions)
          return {
            account: acc.name,
            ad_name: row.ad_name,
            campaign: row.campaign_name,
            spend: Math.round(spend),
            revenue: Math.round(revenue),
            roas: spend > 0 ? Number((revenue / spend).toFixed(2)) : 0,
            ctr: row.ctr != null ? Number(Number(row.ctr).toFixed(2)) : null,
            cvr: clicks > 0 ? Number((purchases / clicks * 100).toFixed(2)) : null, // %
            purchases,
            thumbnail_url: thumbs.byId[row.ad_id] || thumbs.byName[row.ad_name] || null,
          };
        });
      } catch (e) {
        return [{ account: acc.name, _error: e.message }];
      }
    }));

    const errors = perAccount.flat().filter(x => x._error).map(x => ({ account: x.account, error: x._error }));
    const winners = perAccount.flat()
      .filter(x => !x._error && x.spend >= minSpend) // 유의미 소재만
      .sort((a, b) => b.roas - a.roas)
      .slice(0, topN);

    return res.status(200).json({ status: 'connected', period: 'last_30d', minSpend, count: winners.length, winners, ...(errors.length ? { accountErrors: errors } : {}) });
  } catch (e) {
    return res.status(500).json({ status: 'error', error: e.message, winners: [] });
  }
}

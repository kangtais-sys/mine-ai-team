// 디버그 — KR 광고 계정 3개에서 "미스트" 관련 광고의 ad-level 인사이트 + 크리에이티브 수집.
// 목적: 미국 아마존 버전 광고 소재 제작을 위한 위너 소재 학습용.
// 호출: GET /api/debug/mist-ads  (Authorization: Bearer ${CRON_SECRET})
//       옵션: ?preset=last_year  ?minSpend=50000  ?withVideos=1

export const config = { maxDuration: 300 };

const AD_ACCOUNTS = [
  { name: '밀리밀리_인하우스', id: '2327868604313508' },
  { name: '밀리밀리_한국', id: '791241442793311' },
  { name: '밀리밀리_한국_올리브영', id: '623851980786807' },
];

const MIST_KEYWORDS = ['미스트', '500달톤', '500 dalton', '프로틴', 'protein', 'mist', '팔자'];

function matchesMist(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return MIST_KEYWORDS.some(k => t.includes(k.toLowerCase()));
}

function extractCreative(c) {
  if (!c) return {};
  const oss = c.object_story_spec || {};
  const vd = oss.video_data || {};
  const ld = oss.link_data || {};
  return {
    creativeId: c.id,
    imageUrl: c.image_url || c.thumbnail_url || vd.image_url || ld.picture || null,
    videoId: c.video_id || vd.video_id || null,
    body: c.body || vd.message || ld.message || null,
    title: c.title || vd.title || ld.name || null,
    description: ld.description || null,
    cta: c.call_to_action_type || vd.call_to_action?.type || ld.call_to_action?.type || null,
    linkUrl: ld.link || null,
    instagramActorId: oss.instagram_actor_id || null,
    pageId: oss.page_id || null,
  };
}

async function gfetch(url) {
  const r = await fetch(url);
  const d = await r.json();
  return d;
}

async function listAdsLight(actId, token) {
  // 1단계: ad id + name + campaign/adset 이름만 (insights/creative 제외)
  const fields = 'id,name,effective_status,created_time,adset{id,name},campaign{id,name,objective}';
  const allAds = [];
  let url = `https://graph.facebook.com/v19.0/act_${actId}/ads?fields=${encodeURIComponent(fields)}&limit=300&access_token=${token}`;
  let page = 0;
  while (url && page < 10) {
    const d = await gfetch(url);
    if (d.error) return { error: d.error.message, ads: allAds };
    for (const ad of d.data || []) allAds.push(ad);
    url = d.paging?.next || null;
    page++;
  }
  return { ads: allAds };
}

async function fetchInsightsForAds(actId, adIds, datePreset, token) {
  // 2단계: 후보 ad들 insights를 ad.id IN 필터로 한 번에
  const fields = 'ad_id,ad_name,spend,impressions,clicks,ctr,cpc,frequency,reach,actions,action_values,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions';
  const out = {};
  // ad.id IN 배치: 50개씩
  for (let i = 0; i < adIds.length; i += 50) {
    const batch = adIds.slice(i, i + 50);
    const filtering = JSON.stringify([{ field: 'ad.id', operator: 'IN', value: batch }]);
    const url = `https://graph.facebook.com/v19.0/act_${actId}/insights?level=ad&date_preset=${datePreset}&filtering=${encodeURIComponent(filtering)}&fields=${encodeURIComponent(fields)}&limit=200&access_token=${token}`;
    let next = url;
    let page = 0;
    while (next && page < 5) {
      const d = await gfetch(next);
      if (d.error) { out.__error = d.error.message; break; }
      for (const row of d.data || []) out[row.ad_id] = row;
      next = d.paging?.next || null;
      page++;
    }
  }
  return out;
}

async function fetchCreative(adId, token) {
  const fields = 'creative{id,image_url,thumbnail_url,video_id,body,title,call_to_action_type,object_story_spec{instagram_actor_id,page_id,video_data{call_to_action,image_url,message,title,video_id},link_data{message,name,description,picture,call_to_action,link}}}';
  const d = await gfetch(`https://graph.facebook.com/v19.0/${adId}?fields=${encodeURIComponent(fields)}&access_token=${token}`);
  if (d.error) return { error: d.error.message };
  return extractCreative(d.creative);
}

async function fetchVideoSource(videoId, token) {
  const d = await gfetch(`https://graph.facebook.com/v19.0/${videoId}?fields=source,permalink_url,picture,title,description,length&access_token=${token}`);
  if (d.error) return { error: d.error.message };
  return { source: d.source, permalink: d.permalink_url, picture: d.picture, length: d.length };
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = process.env.META_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return res.status(500).json({ error: 'no meta token' });

  const minSpend = Number(req.query.minSpend) || 50000;
  const withVideos = req.query.withVideos !== '0';
  const VALID = ['last_7d', 'last_14d', 'last_28d', 'last_30d', 'last_90d', 'last_year', 'this_year', 'maximum'];
  const datePreset = VALID.includes(req.query.preset) ? req.query.preset : 'last_year';

  const allAds = [];
  const errors = [];

  for (const acc of AD_ACCOUNTS) {
    // Step 1: list all ads (light)
    const { ads: rawAds, error: listErr } = await listAdsLight(acc.id, token);
    if (listErr) errors.push({ account: acc.name, step: 'list', error: listErr });

    // Filter mist
    const mistAds = rawAds.filter(ad =>
      matchesMist(ad.name) ||
      matchesMist(ad.adset?.name) ||
      matchesMist(ad.campaign?.name)
    );

    if (mistAds.length === 0) continue;

    // Step 2: insights for mist ads
    const insightsMap = await fetchInsightsForAds(acc.id, mistAds.map(a => a.id), datePreset, token);
    if (insightsMap.__error) errors.push({ account: acc.name, step: 'insights', error: insightsMap.__error });

    for (const ad of mistAds) {
      const ins = insightsMap[ad.id];
      if (!ins) continue;
      const spend = Number(ins.spend) || 0;
      if (spend < minSpend) continue;

      const purchaseAction = (ins.actions || []).find(a => a.action_type === 'purchase');
      const purchases = purchaseAction ? Number(purchaseAction.value) : 0;
      const revenueAction = (ins.action_values || []).find(a => a.action_type === 'purchase');
      const revenue = revenueAction ? Number(revenueAction.value) : 0;
      const roas = spend > 0 ? revenue / spend : 0;
      const cpa = purchases > 0 ? spend / purchases : null;

      const linkClicks = (ins.actions || []).find(a => a.action_type === 'link_click');
      const v75 = (ins.video_p75_watched_actions || [])[0]?.value;
      const v100 = (ins.video_p100_watched_actions || [])[0]?.value;
      const impressions = Number(ins.impressions) || 0;
      const completionRate = (impressions > 0 && v100) ? Number(v100) / impressions : null;

      allAds.push({
        account: acc.name,
        adId: ad.id,
        adName: ad.name,
        adsetName: ad.adset?.name || '',
        campaignName: ad.campaign?.name || '',
        campaignObjective: ad.campaign?.objective || '',
        effectiveStatus: ad.effective_status,
        createdTime: ad.created_time,
        spend: Math.round(spend),
        revenue: Math.round(revenue),
        purchases,
        roas: Number(roas.toFixed(2)),
        cpa: cpa ? Math.round(cpa) : null,
        ctr: Number(ins.ctr || 0),
        cpc: Number(ins.cpc || 0),
        frequency: Number(ins.frequency || 0),
        impressions,
        clicks: Number(ins.clicks || 0),
        reach: Number(ins.reach || 0),
        linkClicks: linkClicks ? Number(linkClicks.value) : null,
        videoP75: v75 ? Number(v75) : null,
        videoP100: v100 ? Number(v100) : null,
        completionRate: completionRate ? Number(completionRate.toFixed(4)) : null,
      });
    }
  }

  allAds.sort((a, b) => b.spend - a.spend);

  const byRoas = [...allAds].filter(a => a.purchases > 0).sort((a, b) => b.roas - a.roas).slice(0, 15);
  const byCtr = [...allAds].filter(a => a.impressions >= 1000).sort((a, b) => b.ctr - a.ctr).slice(0, 15);
  const byCpa = [...allAds].filter(a => a.cpa).sort((a, b) => a.cpa - b.cpa).slice(0, 15);
  const bySpend = allAds.slice(0, 15);

  const winnerIds = new Set([
    ...byRoas.slice(0, 8).map(a => a.adId),
    ...byCtr.slice(0, 8).map(a => a.adId),
    ...byCpa.slice(0, 8).map(a => a.adId),
    ...bySpend.slice(0, 5).map(a => a.adId),
  ]);
  const winners = allAds.filter(a => winnerIds.has(a.adId));

  // Step 3: fetch creative for winners (배치 병렬)
  const winnerChunks = [];
  for (let i = 0; i < winners.length; i += 5) winnerChunks.push(winners.slice(i, i + 5));
  for (const chunk of winnerChunks) {
    const creatives = await Promise.all(chunk.map(w => fetchCreative(w.adId, token)));
    chunk.forEach((w, i) => { w.creative = creatives[i]; });
  }

  if (withVideos) {
    const videoIds = [...new Set(winners.map(w => w.creative?.videoId).filter(Boolean))];
    const sources = {};
    for (let i = 0; i < videoIds.length; i += 5) {
      const chunk = videoIds.slice(i, i + 5);
      const res = await Promise.all(chunk.map(v => fetchVideoSource(v, token)));
      chunk.forEach((v, i) => { sources[v] = res[i]; });
    }
    winners.forEach(w => {
      if (w.creative?.videoId) w.creative.videoSource = sources[w.creative.videoId];
    });
  }

  const totalSpend = allAds.reduce((s, a) => s + a.spend, 0);
  const totalRevenue = allAds.reduce((s, a) => s + a.revenue, 0);

  return res.status(200).json({
    summary: {
      datePreset,
      minSpend,
      totalMistAds: allAds.length,
      winnersCount: winners.length,
      totalSpend,
      totalRevenue,
      overallRoas: totalSpend > 0 ? Number((totalRevenue / totalSpend).toFixed(2)) : null,
      generatedAt: new Date().toISOString(),
    },
    rankings: {
      byRoas: byRoas.map(a => ({ adId: a.adId, adName: a.adName, account: a.account, spend: a.spend, revenue: a.revenue, roas: a.roas, ctr: a.ctr })),
      byCtr: byCtr.map(a => ({ adId: a.adId, adName: a.adName, account: a.account, spend: a.spend, ctr: a.ctr, roas: a.roas })),
      byCpa: byCpa.map(a => ({ adId: a.adId, adName: a.adName, account: a.account, spend: a.spend, cpa: a.cpa, roas: a.roas })),
      bySpend: bySpend.map(a => ({ adId: a.adId, adName: a.adName, account: a.account, spend: a.spend, roas: a.roas })),
    },
    winners,
    errors,
  });
}

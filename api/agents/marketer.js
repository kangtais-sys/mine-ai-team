export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = { meta: null, naver: null, google: null, tiktok: null, ga: null, totalSpend: 0 };

  // A. Meta Ads (5 accounts)
  const AD_ACCOUNTS = [
    { name: '랄라라운지_한국', id: '855116430496295' },
    { name: '밀리밀리_인하우스', id: '2327868604313508' },
    { name: '밀리밀리_한국', id: '791241442793311' },
    { name: '밀리밀리_한국_올��브영', id: '623851980786807' },
    { name: '엠마워시_오피셜', id: '864303894888410' },
  ];

  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (token) {
    try {
      const accounts = await Promise.all(AD_ACCOUNTS.map(async (acc) => {
        try {
          const url = `https://graph.facebook.com/v19.0/act_${acc.id}/insights?fields=spend,impressions,clicks,cpc,ctr,actions&date_preset=last_7d&access_token=${token}`;
          const r = await fetch(url);
          const d = await r.json();
          const insight = d.data?.[0] || {};
          return {
            name: acc.name,
            spend: Number(insight.spend) || 0,
            impressions: Number(insight.impressions) || 0,
            clicks: Number(insight.clicks) || 0,
            ctr: Number(insight.ctr) || 0,
            cpc: Number(insight.cpc) || 0,
            conversions: (insight.actions || []).filter(a => a.action_type === 'purchase').reduce((s, a) => s + Number(a.value), 0),
          };
        } catch { return { name: acc.name, error: 'API 오류' }; }
      }));

      const total = accounts.reduce((t, a) => ({
        spend: t.spend + (a.spend || 0),
        impressions: t.impressions + (a.impressions || 0),
        clicks: t.clicks + (a.clicks || 0),
        conversions: t.conversions + (a.conversions || 0),
      }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 });

      result.meta = {
        status: 'connected',
        totalSpend: total.spend,
        impressions: total.impressions,
        clicks: total.clicks,
        ctr: total.impressions > 0 ? ((total.clicks / total.impressions) * 100).toFixed(2) : 0,
        conversions: total.conversions,
        accounts,
      };
      result.totalSpend += total.spend;
    } catch (e) { result.meta = { status: 'error', error: e.message }; }
  } else {
    result.meta = { status: 'disconnected', message: 'Meta 광고 토큰 필요' };
  }

  // B. Naver Ads
  if (process.env.NAVER_AD_API_KEY && process.env.NAVER_AD_SECRET && process.env.NAVER_AD_CUSTOMER_ID) {
    try {
      const ts = String(Date.now());
      const crypto = await import('crypto');
      const sig = crypto.createHmac('sha256', process.env.NAVER_AD_SECRET).update(ts + '.' + 'GET' + '.' + '/ncc/campaigns').digest('base64');
      const r = await fetch('https://api.naver.com/ncc/campaigns', {
        headers: { 'X-Timestamp': ts, 'X-API-KEY': process.env.NAVER_AD_API_KEY, 'X-Customer': process.env.NAVER_AD_CUSTOMER_ID, 'X-Signature': sig },
      });
      const campaigns = await r.json();
      result.naver = { status: 'connected', campaigns: Array.isArray(campaigns) ? campaigns.length : 0 };
    } catch (e) { result.naver = { status: 'error', error: e.message }; }
  } else {
    result.naver = { status: 'disconnected', message: '네이버 광고 API 연결 ���요' };
  }

  // C. Google Ads
  result.google = process.env.GOOGLE_ADS_CUSTOMER_ID && process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    ? { status: 'connected', message: 'Google Ads 연결됨' }
    : { status: 'disconnected', message: '구글 광고 연결 필요' };

  // D. TikTok Ads
  result.tiktok = process.env.TIKTOK_AD_ACCESS_TOKEN
    ? { status: 'connected', message: 'TikTok Ads 연결됨' }
    : { status: 'disconnected', message: '틱톡 ���고 연결 필���' };

  // E. GA4
  result.ga = process.env.GA4_PROPERTY_ID
    ? { status: 'connected', propertyId: process.env.GA4_PROPERTY_ID }
    : { status: 'disconnected', message: '구글 애널리틱스 연결 ��요' };

  return res.status(200).json(result);
}

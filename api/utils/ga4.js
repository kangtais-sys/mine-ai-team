import { getGoogleAccessToken } from './sheets.js';

export async function runGA4Report(propertyId, { startDate = '30daysAgo', endDate = 'today', metrics = [], dimensions = [] } = {}) {
  const token = await getGoogleAccessToken();
  const body = {
    dateRanges: [{ startDate, endDate }],
    metrics: metrics.map(m => ({ name: m })),
  };
  if (dimensions.length > 0) {
    body.dimensions = dimensions.map(d => ({ name: d }));
  }

  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GA4 API ${res.status}: ${err.substring(0, 200)}`);
  }
  return res.json();
}

export async function getEcommerceData(propertyId) {
  const data = await runGA4Report(propertyId, {
    startDate: '30daysAgo',
    endDate: 'today',
    metrics: ['ecommercePurchases', 'purchaseRevenue', 'sessions', 'totalUsers'],
  });

  const row = data.rows?.[0]?.metricValues || [];
  return {
    purchases: Number(row[0]?.value) || 0,
    revenue: Number(row[1]?.value) || 0,
    sessions: Number(row[2]?.value) || 0,
    users: Number(row[3]?.value) || 0,
  };
}

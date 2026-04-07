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
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const yearStart = `${now.getFullYear()}-01-01`;

  const token = await getGoogleAccessToken();
  const body = {
    dateRanges: [
      { startDate: monthStart, endDate: 'today', name: 'month' },
      { startDate: yearStart, endDate: 'today', name: 'year' },
    ],
    metrics: [
      { name: 'ecommercePurchases' },
      { name: 'purchaseRevenue' },
      { name: 'sessions' },
      { name: 'totalUsers' },
    ],
  };

  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GA4 API ${res.status}: ${err.substring(0, 200)}`);
  }
  const data = await res.json();

  const parseRow = (row) => {
    const v = row?.metricValues || [];
    return { purchases: Number(v[0]?.value) || 0, revenue: Number(v[1]?.value) || 0, sessions: Number(v[2]?.value) || 0, users: Number(v[3]?.value) || 0 };
  };

  const monthRow = data.rows?.find(r => r.dimensionValues?.[0]?.value === 'month') || data.rows?.[0];
  const yearRow = data.rows?.find(r => r.dimensionValues?.[0]?.value === 'year') || data.rows?.[1];

  return {
    month: parseRow(monthRow),
    year: parseRow(yearRow || monthRow),
    // Backward compat
    ...parseRow(monthRow),
  };
}

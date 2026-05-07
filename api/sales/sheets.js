import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const SHEETS = {
  oliveyoung: { id: '1FyoWviFOuibMBBZcIuvBAcziEhcxCgoDOhVHvN6xMxU', gid: '352972103', revenueCol: 6 },
  export: { id: '1qwOecvjr9SxGHEtc0LC4euYQ_-CraaV1MkU7dsaVbk4', gid: '1151464885', revenueCol: 3 },
};

function parseCSV(text) {
  return text.split('\n').map(line => {
    const cols = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    return cols;
  });
}

function parseAmount(s) {
  if (!s) return 0;
  return parseFloat(s.replace(/[₩,\s"]/g, '')) || 0;
}

async function fetchSheet(sheetKey) {
  const { id, gid, revenueCol } = SHEETS[sheetKey];
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet ${sheetKey} fetch failed: ${res.status}`);
  const text = await res.text();
  const rows = parseCSV(text);

  const monthly = {};
  for (const row of rows.slice(1)) {
    const dateStr = row[0]?.replace(/"/g, '').trim();
    if (!dateStr || !/^\d{4}/.test(dateStr)) continue;
    const month = dateStr.slice(0, 7);
    const amount = parseAmount(row[revenueCol]);
    if (!monthly[month]) monthly[month] = 0;
    monthly[month] += amount;
  }
  return monthly;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cacheKey = `sales:sheets:${new Date().toISOString().slice(0, 13)}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return res.status(200).json(cached);

    const [oliveyoung, exportData] = await Promise.all([
      fetchSheet('oliveyoung'),
      fetchSheet('export'),
    ]);

    const allMonths = [...new Set([...Object.keys(oliveyoung), ...Object.keys(exportData)])].sort();
    const months = allMonths.map(m => ({
      month: m,
      oliveyoung: Math.round(oliveyoung[m] || 0),
      export: Math.round(exportData[m] || 0),
      total: Math.round((oliveyoung[m] || 0) + (exportData[m] || 0)),
      currency: 'KRW',
    }));

    const grandTotal = months.reduce((s, m) => s + m.total, 0);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentData = months.find(m => m.month === currentMonth);

    const result = { months, grandTotal, currentMonth: currentData || null, updatedAt: new Date().toISOString() };
    await redis.set(cacheKey, result, { ex: 3600 });
    res.status(200).json(result);
  } catch (e) {
    console.error('[Sheets Sales]', e.message);
    res.status(500).json({ error: e.message });
  }
}

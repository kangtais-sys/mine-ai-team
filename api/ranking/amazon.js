import { createHmac, createHash } from 'crypto';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const MARKETPLACE_ID = process.env.SP_API_MARKETPLACE_ID || 'ATVPDKIKX0DER'; // US
// 추적 대상 제품 — 미스트 + 앰플. cacheKey/snap 은 제품별 분리(변동 계산 독립).
const PRODUCTS = {
  mist:  { asin: process.env.AMAZON_MIST_ASIN  || 'B0GYCB5164', cacheKey: 'ranking:amazon',       snap: 'ranking:amazon',       defaultName: '500 Dalton Protein Mist', label: '미스트' },
  ample: { asin: process.env.AMAZON_AMPLE_ASIN || 'B0GYC88ZGL', cacheKey: 'ranking:amazon_ample', snap: 'ranking:amazon_ample', defaultName: 'Collagen Ample', label: '앰플' },
};

async function getLwaToken() {
  const cached = await redis.get('amazon:lwa_token');
  if (cached) return cached;
  const res = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.SP_API_REFRESH_TOKEN,
      client_id: process.env.SP_API_CLIENT_ID,
      client_secret: process.env.SP_API_CLIENT_SECRET,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('LWA failed: ' + JSON.stringify(data));
  await redis.set('amazon:lwa_token', data.access_token, { ex: (data.expires_in || 3600) - 60 });
  return data.access_token;
}

function sign(key, msg) { return createHmac('sha256', key).update(msg).digest(); }
function hash(s) { return createHash('sha256').update(s).digest('hex'); }

// SP-API SigV4 GET (매출 amazon.js 와 동일 서명 방식 — 독립 복제, 매출 코드 미수정)
async function spFetch(path, lwaToken) {
  const host = 'sellingpartnerapi-na.amazon.com';
  const region = process.env.AWS_REGION || 'us-east-1';
  const service = 'execute-api';
  const now = new Date();
  const date = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateOnly = date.slice(0, 8);

  const url = new URL(`https://${host}${path}`);
  const queryStr = [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const headers = { host, 'x-amz-access-token': lwaToken, 'x-amz-date': date };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(k => `${k}:${headers[k]}\n`).join('');
  const canonical = ['GET', url.pathname, queryStr, canonicalHeaders, signedHeaders, hash('')].join('\n');
  const credScope = `${dateOnly}/${region}/${service}/aws4_request`;
  const strToSign = ['AWS4-HMAC-SHA256', date, credScope, hash(canonical)].join('\n');
  const sigKey = sign(sign(sign(sign(`AWS4${process.env.AWS_SECRET_KEY}`, dateOnly), region), service), 'aws4_request');
  const sig = createHmac('sha256', sigKey).update(strToSign).digest('hex');
  const auth = `AWS4-HMAC-SHA256 Credential=${process.env.AWS_ACCESS_KEY}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;

  const res = await fetch(`https://${host}${path}`, { headers: { ...headers, Authorization: auth } });
  const text = await res.text();
  if (!res.ok) throw new Error(`SP-API ${res.status}: ${text}`);
  return JSON.parse(text);
}

// salesRanks 응답에서 스킨케어 세부 카테고리(미스트/세럼/앰플류) 순위 추출
function pickRank(item) {
  const sr = (item?.salesRanks || []).find(s => s.marketplaceId === MARKETPLACE_ID) || (item?.salesRanks || [])[0];
  if (!sr) return null;
  const classification = sr.classificationRanks || []; // 세부 카테고리 (예: Facial Mists / Facial Serums)
  const displayGroup = sr.displayGroupRanks || [];     // 대분류 (예: Beauty & Personal Care)

  // 1순위: 스킨케어 세부 카테고리(미스트/세럼/앰플/토너/페이스 등)
  const skincare = classification.find(c => /mist|toner|face|facial|serum|ample|essence|collagen|moistur|skin|cream/i.test(c.title || ''));
  if (skincare) return { category: skincare.title, rank: skincare.rank, link: skincare.link };
  // 2순위: 세부 카테고리 중 순위가 가장 좋은(작은) 것
  if (classification.length) {
    const best = [...classification].sort((a, b) => a.rank - b.rank)[0];
    return { category: best.title, rank: best.rank, link: best.link };
  }
  // 3순위: 대분류
  if (displayGroup.length) {
    const best = [...displayGroup].sort((a, b) => a.rank - b.rank)[0];
    return { category: best.title, rank: best.rank, link: best.link };
  }
  return null;
}

// 제품 1개 BSR 조회 + 캐시/스냅샷(변동 계산). p = PRODUCTS.mist | PRODUCTS.ample
async function fetchRankForProduct(p) {
  const lwaToken = await getLwaToken();
  const path = `/catalog/2022-04-01/items/${p.asin}?marketplaceIds=${MARKETPLACE_ID}&includedData=salesRanks,summaries`;
  const item = await spFetch(path, lwaToken);

  const picked = pickRank(item);
  if (!picked) throw new Error(`salesRanks 없음 (카테고리 미배정 또는 신규 ASIN: ${p.asin})`);

  const name = item?.summaries?.[0]?.itemName || p.defaultName;

  // 전일 대비 변동 계산(제품별 스냅샷)
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');
  let prevRank = null;
  try {
    const prev = await redis.get(`${p.snap}:lastsnap`);
    if (prev && prev.date !== today) prevRank = prev.rank;
  } catch { /* noop */ }

  const result = {
    platform: 'Amazon US',
    flag: '🇺🇸',
    label: p.label,
    category: picked.category,
    name,
    rank: picked.rank,
    prevRank,
    change: prevRank != null ? prevRank - picked.rank : 0,
    ours: true,
    url: `https://www.amazon.com/dp/${p.asin}`,
    source: 'SP-API',
    updatedAt: new Date().toISOString(),
  };

  await redis.set(p.cacheKey, result, { ex: 172800 });
  await redis.set(`${p.snap}:${today}`, picked.rank, { ex: 60 * 60 * 24 * 40 });
  await redis.set(`${p.snap}:lastsnap`, { date: today, rank: picked.rank }, { ex: 60 * 60 * 24 * 40 });
  return result;
}

export async function fetchAmazonRank() { return fetchRankForProduct(PRODUCTS.mist); }      // 미스트(하위호환)
export async function fetchAmazonRankAmple() { return fetchRankForProduct(PRODUCTS.ample); } // 앰플

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const forceRefresh = req.query?.refresh === '1';
  try {
    // 캐시 우선 — 무인증 반복 호출이 SP-API 를 계속 때리지 않도록 (sales/amazon.js 와 동일 패턴).
    // 정기 갱신은 cron(/api/cron/ranking)이 담당.
    if (!forceRefresh) {
      const cached = await redis.get('ranking:amazon');
      if (cached) return res.status(200).json(cached);
    }
    const result = await fetchAmazonRank();
    res.status(200).json(result);
  } catch (e) {
    console.error('[Ranking Amazon]', e.message);
    // 실패해도 캐시 있으면 반환
    const cached = await redis.get('ranking:amazon');
    if (cached) return res.status(200).json({ ...cached, stale: true });
    res.status(500).json({ error: '랭킹 조회 실패' });
  }
}

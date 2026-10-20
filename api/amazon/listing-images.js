import { createHmac, createHash } from 'crypto';
import { Redis } from '@upstash/redis';

// 미스트(B0GYCB5164) 상세 이미지 2~7번째 칸(other_product_image_locator_1~6)만 바꾸는 1회성 엔드포인트.
// 대표 사진(main_product_image_locator) · 제목 · 옵션 · 가격 등 다른 속성은 건드리지 않는다.
// mode=view(지금 상태 조회) → mode=preview(아마존 검증만, 반영 안 됨) → mode=apply(실제 반영). 2026-10-16 대표 승인.
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY_HASH = 'b7549259b49e5c8fd3a67d8f6afc5c39a43d3df4b3da3cca01a2a0c6ee272aa5';
const MARKETPLACE_ID = 'ATVPDKIKX0DER';
const SELLER_ID = 'A41UDYPOXH5YD';
const SKU = 'MISTSET-01-FBA';
const BASE = 'https://mine-ai-team.vercel.app/amz/mist-1021'; // 10/21 대표 승인 — 최종 8장(흑백 · 실사 · 인플루언서 · 올리브영 1위)
const IMAGES = [1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ attr: `other_product_image_locator_${i}`, url: `${BASE}/PT0${i}.jpg` }));

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

// ranking/amazon.js 의 SigV4 서명을 메서드 · 본문까지 받도록 복제(원본 미수정)
async function sp(method, path, lwaToken, body) {
  const host = 'sellingpartnerapi-na.amazon.com';
  const region = process.env.AWS_REGION || 'us-east-1';
  const service = 'execute-api';
  const date = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateOnly = date.slice(0, 8);
  const url = new URL(`https://${host}${path}`);
  const queryStr = [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const payload = body ? JSON.stringify(body) : '';
  const headers = { host, 'x-amz-access-token': lwaToken, 'x-amz-date': date };
  if (body) headers['content-type'] = 'application/json';
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(k => `${k}:${headers[k]}\n`).join('');
  const canonicalPath = url.pathname.split('/').map(s => encodeURIComponent(decodeURIComponent(s))).join('/');
  const canonical = [method, canonicalPath, queryStr, canonicalHeaders, signedHeaders, hash(payload)].join('\n');
  const credScope = `${dateOnly}/${region}/${service}/aws4_request`;
  const strToSign = ['AWS4-HMAC-SHA256', date, credScope, hash(canonical)].join('\n');
  const sigKey = sign(sign(sign(sign(`AWS4${process.env.AWS_SECRET_KEY}`, dateOnly), region), service), 'aws4_request');
  const sig = createHmac('sha256', sigKey).update(strToSign).digest('hex');
  const auth = `AWS4-HMAC-SHA256 Credential=${process.env.AWS_ACCESS_KEY}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;
  const res = await fetch(url.toString(), { method, headers: { ...headers, Authorization: auth }, body: payload || undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

export default async function handler(req, res) {
  const key = String(req.query.k || '');
  if (!key || hash(key) !== KEY_HASH) return res.status(404).end();
  const mode = req.query.mode || 'view';
  try {
    const token = await getLwaToken();
    const itemPath = `/listings/2021-08-01/items/${SELLER_ID}/${encodeURIComponent(SKU)}`;
    const cur = await sp('GET', `${itemPath}?marketplaceIds=${MARKETPLACE_ID}&includedData=summaries,attributes,issues`, token);
    const attrs = cur.json.attributes || {};
    const images = Object.fromEntries(Object.entries(attrs).filter(([k]) => /image_locator/.test(k)).map(([k, v]) => [k, v.map(x => x.media_location)]));
    const summary = (cur.json.summaries || [])[0] || {};
    if (mode === 'view') return res.json({ status: cur.status, asin: summary.asin, productType: summary.productType, mainImage: summary.mainImage, images, issues: cur.json.issues, errors: cur.json.errors });
    if (summary.asin !== 'B0GYCB5164') return res.status(400).json({ error: 'ASIN mismatch', summary });
    // del78-preview / del78-apply: 7 · 8번째 추가 이미지(예전 사진 2장)만 지운다(10/17 대표 승인). 원본은 milli-ops/us/backup/images_20261016
    if (mode.startsWith('del78')) {
      const body = { productType: summary.productType, patches: [7, 8].map(i => ({ op: 'delete', path: `/attributes/other_product_image_locator_${i}`, value: [{ marketplace_id: MARKETPLACE_ID }] })) };
      const q = `marketplaceIds=${MARKETPLACE_ID}${mode === 'del78-apply' ? '' : '&mode=VALIDATION_PREVIEW'}`;
      const out = await sp('PATCH', `${itemPath}?${q}`, token, body);
      return res.json({ mode, before: images, status: out.status, result: out.json });
    }
    const body = {
      productType: summary.productType,
      patches: IMAGES.map(({ attr, url }) => ({ op: 'replace', path: `/attributes/${attr}`, value: [{ marketplace_id: MARKETPLACE_ID, media_location: url }] })),
    };
    const q = `marketplaceIds=${MARKETPLACE_ID}${mode === 'apply' ? '' : '&mode=VALIDATION_PREVIEW'}`;
    const out = await sp('PATCH', `${itemPath}?${q}`, token, body);
    return res.json({ mode, before: images, status: out.status, result: out.json });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}

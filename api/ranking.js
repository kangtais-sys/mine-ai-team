import { Redis } from '@upstash/redis';
import { fetchAmazonRank } from './ranking/amazon.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const FRESH_MS = 2.5 * 3600 * 1000; // 2.5h 이내면 캐시 사용

function isStale(item) {
  if (!item?.updatedAt) return true;
  return Date.now() - new Date(item.updatedAt).getTime() > FRESH_MS;
}

// 합본 ranking:data 조립 + 저장 (brand 에이전트 / ChatView 호환)
async function assemble({ refresh = false } = {}) {
  // 1) 아마존: 캐시 신선하면 사용, 아니면 SP-API 재호출
  let amazon = await redis.get('ranking:amazon');
  if (refresh || isStale(amazon)) {
    try { amazon = await fetchAmazonRank(); }
    catch (e) { console.error('[Ranking] amazon refresh 실패:', e.message); /* 캐시 유지 */ }
  }

  // 2) 올리브영: 내 맥 스크립트가 푸시한 값 그대로 사용
  const oliveyoung = await redis.get('ranking:oliveyoung');

  const items = [];
  if (oliveyoung) items.push(oliveyoung);
  if (amazon) items.push(amazon);

  const data = {
    status: items.length ? 'connected' : 'no_data',
    items,
    updatedAt: new Date().toISOString(),
  };
  await redis.set('ranking:data', data, { ex: 172800 });
  return data;
}

export { assemble };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const refresh = req.query?.refresh === '1';
    const data = await assemble({ refresh });
    res.status(200).json(data);
  } catch (e) {
    console.error('[Ranking]', e.message);
    const cached = await redis.get('ranking:data');
    if (cached) return res.status(200).json({ ...cached, stale: true });
    res.status(500).json({ error: e.message });
  }
}

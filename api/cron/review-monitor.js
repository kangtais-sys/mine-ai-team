import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const reviews = { sources: [], totalReviews: 0, needsAttention: 0, updatedAt: new Date().toISOString() };

    // Cafe24 reviews (if connected)
    if (process.env.CAFE24_CLIENT_ID) {
      try {
        const { getCafe24Token } = await import('../utils/cafe24.js');
        const { token, mallId } = await getCafe24Token();
        const r = await fetch(`https://${mallId}.cafe24api.com/api/v2/admin/products/-/reviews?limit=20`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Cafe24-Api-Version': '2024-06-01' },
        });
        if (r.ok) {
          const data = await r.json();
          const items = data.reviews || [];
          reviews.sources.push({ name: 'cafe24', count: items.length });
          reviews.totalReviews += items.length;
          reviews.needsAttention += items.filter(rv => Number(rv.rating) <= 2).length;
        }
      } catch (e) { reviews.sources.push({ name: 'cafe24', error: e.message }); }
    }

    // Smartstore reviews (if connected)
    if (process.env.NAVER_COMMERCE_CLIENT_ID) {
      reviews.sources.push({ name: 'smartstore', status: 'connected' });
    }

    // Save to KV
    await redis.set('review:monitor', JSON.stringify(reviews), { ex: 86400 });

    console.log('[Review] sources:', reviews.sources.length, 'total:', reviews.totalReviews, 'attention:', reviews.needsAttention);
    return res.status(200).json(reviews);
  } catch (error) {
    console.error('[Review] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

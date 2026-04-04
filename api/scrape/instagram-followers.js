import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

function parseFollowerCount(raw) {
  if (!raw) return 0;
  const s = raw.replace(/,/g, '').trim();
  // "307K" → 307000
  if (/[\d.]+K/i.test(s)) return Math.round(parseFloat(s) * 1000);
  // "1.2M" → 1200000
  if (/[\d.]+M/i.test(s)) return Math.round(parseFloat(s) * 1000000);
  // "30.7만" → 307000
  if (/[\d.]+만/.test(s)) return Math.round(parseFloat(s) * 10000);
  // "1,234" or "1234"
  const num = parseInt(s.replace(/\D/g, ''), 10);
  return isNaN(num) ? 0 : num;
}

export default async function handler(req, res) {
  // Auth for cron, open for manual GET
  if (req.headers.authorization && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const username = req.query?.username || 'lala_lounge_';
  const profileKey = req.query?.key || 'yuminhye';

  try {
    const igRes = await fetch(`https://www.instagram.com/${username}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    });

    const html = await igRes.text();

    // Extract from meta description
    // Pattern: "팔로워 307K명" or "307K Followers"
    let raw = null;
    let count = 0;

    // Try Korean meta
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)
      || html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);

    if (descMatch) {
      const desc = descMatch[1];
      // "팔로워 307K명" or "팔로워 3.1만명"
      const koMatch = desc.match(/팔로워\s*([\d,.]+[KkMm만]*)\s*명/);
      // "307K Followers"
      const enMatch = desc.match(/([\d,.]+[KkMm]*)\s*Followers/i);

      if (koMatch) {
        raw = koMatch[1];
        count = parseFollowerCount(raw);
      } else if (enMatch) {
        raw = enMatch[1];
        count = parseFollowerCount(raw);
      }
    }

    // Fallback: search for follower count in JSON-LD or scripts
    if (!count) {
      const jsonMatch = html.match(/"edge_followed_by":\s*\{"count":\s*(\d+)\}/);
      if (jsonMatch) {
        count = parseInt(jsonMatch[1], 10);
        raw = count.toLocaleString();
      }
    }

    const result = {
      username,
      count,
      raw: raw || String(count),
      updatedAt: new Date().toISOString(),
    };

    // Save to KV
    const kvKey = `followers:${profileKey}:instagram`;
    await redis.set(kvKey, result);

    return res.status(200).json(result);
  } catch (error) {
    console.error('[Scrape IG]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

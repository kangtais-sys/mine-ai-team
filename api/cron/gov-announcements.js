import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { maxDuration: 120 };

const KEYWORDS = ['뷰티', '화장품', 'K-뷰티', 'K-beauty', '수출', '글로벌', '마케팅', '해외진출', '바우처', '중소기업'];

async function fetchAndParse(url, label) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MILLI-AI-Bot/1.0)' },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const items = [];
    const titleRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]{10,100})<\/a>/gi;
    let match;
    while ((match = titleRegex.exec(html)) !== null) {
      const [, link, title] = match;
      const cleanTitle = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      if (KEYWORDS.some(k => cleanTitle.includes(k))) {
        const fullLink = link.startsWith('http') ? link : new URL(link, url).href;
        items.push({ title: cleanTitle, link: fullLink, source: label });
      }
    }
    return items.slice(0, 10);
  } catch (e) {
    console.warn('[Gov]', label, 'fetch failed:', e.message);
    return [];
  }
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sources = [
      { url: 'https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do', label: 'K-스타트업' },
      { url: 'https://www.kotra.or.kr/bigdata/bbs/bbsList.do', label: '코트라' },
    ];

    const results = [];
    for (const src of sources) {
      const items = await fetchAndParse(src.url, src.label);
      results.push(...items);
    }

    console.log('[Gov] Found', results.length, 'announcements');

    await redis.set('gov:announcements', JSON.stringify({
      items: results,
      updatedAt: new Date().toISOString(),
    }), { ex: 86400 * 7 });

    return res.status(200).json({ success: true, count: results.length });
  } catch (error) {
    console.error('[Gov] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

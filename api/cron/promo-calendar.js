import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = { maxDuration: 60 };

// 주요 프로모션 일정 (연간 고정)
const FIXED_PROMOS = [
  { date: '2026-01-01', name: '신년 세일', channel: '전 채널', importance: 'high' },
  { date: '2026-01-25', name: '설 선물 기획전', channel: '올리브영/스마트스토어', importance: 'high' },
  { date: '2026-03-08', name: '화이트데이 기획전', channel: '올리브영', importance: 'medium' },
  { date: '2026-04-01', name: '밀리아워 시작', channel: '자사몰', importance: 'high' },
  { date: '2026-05-05', name: '어린이날 기획전', channel: '스마트스토어', importance: 'medium' },
  { date: '2026-05-08', name: '어버이날 선물전', channel: '올리브영/스마트스토어', importance: 'high' },
  { date: '2026-06-01', name: '올영세일', channel: '올리브영', importance: 'high' },
  { date: '2026-07-01', name: '여름 세일', channel: '전 채널', importance: 'high' },
  { date: '2026-08-15', name: '광복절 세일', channel: '전 채널', importance: 'medium' },
  { date: '2026-09-01', name: '추석 선물 기획전', channel: '올리브영/스마트스토어', importance: 'high' },
  { date: '2026-10-25', name: '페이데이 세일', channel: '스마트스토어', importance: 'medium' },
  { date: '2026-11-11', name: '빼빼로데이/광군제', channel: '전 채널/아마존/쇼피', importance: 'high' },
  { date: '2026-11-27', name: '블랙프라이데이', channel: '아마존/자사몰', importance: 'high' },
  { date: '2026-12-01', name: '올영세일', channel: '올리브영', importance: 'high' },
  { date: '2026-12-25', name: '크리스마스 기획전', channel: '전 채널', importance: 'high' },
];

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();
    const upcoming = FIXED_PROMOS.filter(p => new Date(p.date) >= now).slice(0, 10);
    const thisMonth = FIXED_PROMOS.filter(p => {
      const d = new Date(p.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    const data = {
      upcoming,
      thisMonth,
      total: FIXED_PROMOS.length,
      updatedAt: now.toISOString(),
    };

    await redis.set('commerce:promotions', JSON.stringify(data), { ex: 86400 * 7 });

    console.log('[Promo] upcoming:', upcoming.length, 'thisMonth:', thisMonth.length);
    return res.status(200).json(data);
  } catch (error) {
    console.error('[Promo] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

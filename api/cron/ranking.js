import { assemble } from '../ranking.js';

export const config = { maxDuration: 60 };

// 2시간마다: 아마존 SP-API 순위 갱신 + ranking:data 합본 재조립
// (올리브영은 내 맥 스크립트가 별도로 ranking:oliveyoung 에 푸시)
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const data = await assemble({ refresh: true });
    console.log(`[Cron Ranking] ${data.items.length}개 채널 갱신`);
    res.status(200).json({ ok: true, count: data.items.length, updatedAt: data.updatedAt });
  } catch (e) {
    console.error('[Cron Ranking]', e.message);
    res.status(500).json({ error: e.message });
  }
}

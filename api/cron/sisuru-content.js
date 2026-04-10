// sisuru-content.js는 sisuru-select.js POST로 대체됨
// 이 파일은 cron에서 호출 시 트렌드 리서치 트리거용으로 유지

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // sisuru-trend.js로 리다이렉트
  const baseUrl = `https://${req.headers.host || 'mine-ai-team.vercel.app'}`;
  try {
    const r = await fetch(`${baseUrl}/api/cron/sisuru-trend`, {
      headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
    });
    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(200).json({ error: e.message });
  }
}

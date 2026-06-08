// 디버그 — 이 serverless 함수가 외부로 나갈 때의 egress IP/국가 확인.
// 목적: 우리가 틱톡/인스타 공식 API를 "직접" 호출하면 그 출발 IP가 미국인지 증명.
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const [a, b] = await Promise.all([
      fetch('https://ipapi.co/json/').then(r => r.json()).catch(() => null),
      fetch('https://ipinfo.io/json').then(r => r.json()).catch(() => null),
    ]);
    return res.status(200).json({
      vercelRegion: process.env.VERCEL_REGION || null,        // 예: iad1 = US East
      ipapi: a ? { ip: a.ip, country: a.country_name || a.country, region: a.region, city: a.city } : null,
      ipinfo: b ? { ip: b.ip, country: b.country, region: b.region, city: b.city } : null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

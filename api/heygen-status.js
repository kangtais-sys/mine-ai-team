// 임시 디버그: HeyGen 영상 상태 직접 확인
export default async function handler(req, res) {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'videoId 필수' });
  
  const key = process.env.HEYGEN_API_KEY;
  if (!key) return res.status(500).json({ error: 'HEYGEN_API_KEY 없음' });
  
  const r = await fetch(`https://api.heygen.com/v3/videos/${videoId}`, {
    headers: { 'X-Api-Key': key },
  });
  const data = await r.json();
  return res.status(200).json({ status: r.status, data });
}

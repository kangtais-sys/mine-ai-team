export default async function handler(req, res) {
  const elKey = process.env.ELEVENLABS_API_KEY || '';
  const base = {
    HEYGEN_API_KEY: !!process.env.HEYGEN_API_KEY,
    ELEVENLABS_API_KEY: !!elKey,
    GOOGLE_TTS_API_KEY: !!process.env.GOOGLE_TTS_API_KEY,
    HIGGSFIELD_API_KEY: !!process.env.HIGGSFIELD_API_KEY,
    heygenKeyLen: process.env.HEYGEN_API_KEY?.length || 0,
    elevenLabsKeyLen: elKey.length,
  };

  // ?check=elevenlabs 로 호출 시 ElevenLabs 진단
  if (req.query?.check === 'elevenlabs' && elKey) {
    try {
      const subRes = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
        headers: { 'xi-api-key': elKey },
        signal: AbortSignal.timeout(8000),
      });
      base.subStatus = subRes.status;
      base.subRaw = (await subRes.text()).substring(0, 500);

      // JiYoung 보이스 직접 fetch
      const vRes = await fetch('https://api.elevenlabs.io/v1/voices/AW5wrnG1jVizOYY7R1Oo', {
        headers: { 'xi-api-key': elKey },
        signal: AbortSignal.timeout(8000),
      });
      base.jiyoungStatus = vRes.status;
      base.jiyoungRaw = (await vRes.text()).substring(0, 400);
    } catch (e) {
      base.elevenlabsPlanError = e.message;
    }
  }

  return res.status(200).json(base);
}

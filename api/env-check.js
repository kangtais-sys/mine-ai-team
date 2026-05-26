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

  // ?check=elevenlabs 로 호출 시 ElevenLabs 플랜/사용량 조회
  if (req.query?.check === 'elevenlabs' && elKey) {
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
        headers: { 'xi-api-key': elKey },
        signal: AbortSignal.timeout(8000),
      });
      const data = await r.json();
      base.elevenlabsPlan = {
        tier: data.tier,
        character_count: data.character_count,
        character_limit: data.character_limit,
        can_extend_voice_limit: data.can_extend_voice_limit,
        voice_limit: data.voice_limit,
        professional_voice_limit: data.professional_voice_limit,
        status: data.status,
      };
    } catch (e) {
      base.elevenlabsPlanError = e.message;
    }
  }

  return res.status(200).json(base);
}

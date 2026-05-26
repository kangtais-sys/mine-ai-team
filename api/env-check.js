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

      // JiYoung TTS 직접 호출
      const ttsRes = await fetch(
        'https://api.elevenlabs.io/v1/text-to-speech/AW5wrnG1jVizOYY7R1Oo',
        {
          method: 'POST',
          headers: {
            'xi-api-key': elKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          body: JSON.stringify({
            text: '안녕하세요',
            model_id: 'eleven_multilingual_v2',
            language_code: 'ko',
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      base.ttsStatus = ttsRes.status;
      if (ttsRes.status !== 200) {
        base.ttsErrorRaw = (await ttsRes.text()).substring(0, 500);
      } else {
        const buf = await ttsRes.arrayBuffer();
        base.ttsAudioBytes = buf.byteLength;
      }
    } catch (e) {
      base.elevenlabsPlanError = e.message;
    }
  }

  return res.status(200).json(base);
}

export default function handler(req, res) {
  return res.status(200).json({
    HEYGEN_API_KEY: !!process.env.HEYGEN_API_KEY,
    ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY,
    GOOGLE_TTS_API_KEY: !!process.env.GOOGLE_TTS_API_KEY,
    HIGGSFIELD_API_KEY: !!process.env.HIGGSFIELD_API_KEY,
    heygenKeyLen: process.env.HEYGEN_API_KEY?.length || 0,
  });
}

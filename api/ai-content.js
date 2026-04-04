import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();
const ZERNIO = 'https://zernio.com/api/v1';
const zFetch = (path, opts = {}) => fetch(`${ZERNIO}${path}`, { ...opts, headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json', ...opts.headers } }).then(r => r.json());

const MILLI_PERSONA = `당신은 밀리밀리 브랜드 콘텐츠 담당자입니다.
500달톤 초저분자 단백질 화장품 전문가로서 따뜻하고 신뢰감 있는 말투로 피부 케어를 안내합니다.
이모지 1-2개, 2-3문장, 카카오채널 @밀리밀리 언급, 프로필 링크로 구매 유도.
가격 직접 언급 금지. 해시태그 5개 포함 (#밀리밀리 #MILLIMILLI #프로틴스킨케어 #500달톤 + 트렌드1개).`;

// 트랙B: AI 자동 콘텐츠 생성 + 발행
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { keyword, step } = req.body;
    const topic = keyword || 'protein skincare routine';

    // Step 1: Pinterest 이미지 소싱 (og:image)
    if (!step || step === 'source') {
      const searchUrl = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(topic)}`;
      let imageUrl = null;

      try {
        const pRes = await fetch(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await pRes.text();
        const ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
        if (ogMatch) imageUrl = ogMatch[1];
      } catch { /* Pinterest fetch failed, continue without image */ }

      if (step === 'source') {
        return res.status(200).json({ step: 'source', imageUrl, topic });
      }
    }

    // Step 2: Claude 캡션 생성
    const captionRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: MILLI_PERSONA,
      messages: [{ role: 'user', content: `"${topic}" 주제로 인스타그램 포스트 캡션을 작성해주세요.` }],
    });
    const caption = captionRes.content[0]?.text || '';

    if (req.body.step === 'caption') {
      return res.status(200).json({ step: 'caption', caption, topic });
    }

    // Step 3: Zernio 발행
    const profileId = process.env.ZERNIO_MILLIMILLI_PROFILE_ID;
    const postBody = {
      profileId,
      text: caption,
      platforms: ['instagram', 'tiktok', 'youtube'],
    };

    const postRes = await zFetch('/posts', {
      method: 'POST',
      body: JSON.stringify(postBody),
    });

    return res.status(200).json({
      success: true,
      step: 'published',
      caption: caption.substring(0, 100),
      platforms: ['instagram', 'tiktok', 'youtube'],
      post: postRes,
    });
  } catch (error) {
    console.error('[AI Content]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

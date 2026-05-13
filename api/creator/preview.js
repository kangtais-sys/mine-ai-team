import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';

const anthropic = new Anthropic();
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 드래프트 저장 없이 훅+스크립트 미리보기만 생성 (빠른 버전)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pillar, format = 'reel', notes = '' } = req.body || {};
  if (!pillar) return res.status(400).json({ error: 'pillar 필수' });

  // 페르소나 로드
  let persona = {};
  try {
    const raw = await redis.get('creator:persona:millimilli');
    if (raw) persona = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {}

  const name = persona.name || '밀리 (Milli)';
  const personality = Array.isArray(persona.personality) ? persona.personality.join(', ') : (persona.personality || '호기심 왕성, 팩트충, 따뜻한 언니');
  const communicationTone = persona.communicationTone || '전문적이되 쉽게. 강의 말고 대화.';
  const signatureActions = persona.signatureActions || '손가락으로 가리키며 설명하는 버릇';

  const catchphrasesRaw = persona.catchphrases;
  const catchphrases = Array.isArray(catchphrasesRaw)
    ? catchphrasesRaw.slice(0, 3).map(p => `"${p}"`).join(', ')
    : (typeof catchphrasesRaw === 'string' ? catchphrasesRaw.split('\n').slice(0, 3).map(p => `"${p}"`).join(', ') : '');

  const pillars = persona.pillars || {
    ingredient: { label: '성분정보', desc: '원료 효능·주의사항' },
    treatment:  { label: '시술정보', desc: '피부과 시술, 루틴' },
    behind:     { label: '제품개발 비하인드', desc: 'R&D 과정' },
    collab:     { label: '전문가 콜라보', desc: '의사·약사 협업' },
    trend:      { label: '뷰티 트렌드', desc: '트렌드 정보' },
  };
  const pillarInfo = pillars[pillar] || { label: pillar, desc: pillar };
  const isVideo = format === 'reel' || format === 'shorts';

  const systemPrompt = `당신은 ${name} — ${persona.occupation || '화장품 연구원'} 컨셉의 K뷰티 인플루언서입니다.
성격: ${personality}
톤: ${communicationTone}
행동 패턴: ${signatureActions}
자주 쓰는 표현: ${catchphrases || '이거 진짜 아무도 안 알려줘요'}
브랜드: ${persona.brand?.name || 'MILLIMILLI'} — ${persona.brand?.usp || '500달톤 프로틴 기술'}`;

  const userPrompt = `콘텐츠 기둥: ${pillarInfo.label} (${pillarInfo.desc})
포맷: ${isVideo ? (format === 'reel' ? '인스타 Reels 15-30초' : '숏츠 15-60초') : '카드뉴스 슬라이드'}
추가 메모: ${notes || '없음'}

아래 JSON만 반환 (코드블록 없이):
{
  "hook": "오프닝 후킹 문구 1-2문장",
  "script": "${isVideo ? '스크립트 전체 (후킹→본론→CTA, 15-30초 분량)' : '첫 번째 슬라이드 카피 + 두 번째 슬라이드 핵심 내용'}",
  "caption": "캡션 첫 줄 (이모지 포함, 50자 이내 임팩트 문구)"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = response.content[0]?.text || '';
    let parsed;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : raw);
    } catch {
      return res.status(500).json({ error: '파싱 실패', raw });
    }

    return res.status(200).json({
      success: true,
      pillar,
      pillarLabel: pillarInfo.label,
      format,
      hook: parsed.hook || '',
      script: parsed.script || '',
      caption: parsed.caption || '',
    });
  } catch (e) {
    console.error('[Creator Preview]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

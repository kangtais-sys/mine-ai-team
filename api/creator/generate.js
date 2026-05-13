import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';
import { randomUUID } from 'crypto';

const anthropic = new Anthropic();
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 밀리밀리 페르소나 (Redis 커스터마이징 가능, 없으면 기본값 사용)
const DEFAULT_PERSONA = {
  name: '밀리 (Milli)',
  handle: 'millimilli.kr',
  concept: '화장품 개발자 컨셉의 뷰티 인플루언서',
  bio: '500달톤 프로틴 기술을 연구하는 화장품 개발자. 의사·약사와 함께 진짜 효과 있는 스킨케어를 만들어요. 복잡한 성분을 쉽게 풀어드립니다.',
  tone: '전문적이되 쉽고 친근하게. 과학 근거 기반. 일방적 홍보 NO, 교육·커뮤니티 YES. 후킹 오프닝으로 시작.',
  brand: {
    name: 'MILLIMILLI (밀리밀리)',
    hero: '500달톤 프로틴 미스트 · 앰플',
    usp: '500달톤 이하 단백질이 피부 각질층 깊숙이 침투 — 일반 단백질은 분자가 커서 피부 표면에만 머묾',
  },
  pillars: {
    ingredient: { label: '성분정보', desc: '원료 효능·주의사항·타 성분과의 조합을 쉽게 설명' },
    treatment: { label: '시술정보', desc: '피부과 시술, 홈케어 트리트먼트, 루틴 정보' },
    behind: { label: '제품개발 비하인드', desc: '밀리밀리 R&D 과정, 원료 선정, 테스트 에피소드' },
    collab: { label: '전문가 콜라보', desc: '의사·약사와 함께하는 콘텐츠, Q&A, 인터뷰' },
    trend: { label: '뷰티 트렌드', desc: '최신 뷰티 트렌드, 성분 트렌드, 글로벌 시장 동향' },
  },
  hashtags: {
    base: ['#밀리밀리', '#MILLIMILLI', '#500달톤'],
    ingredient: ['#성분덕후', '#화장품성분', '#코스메틱사이언스', '#스킨케어성분'],
    treatment: ['#뷰티시술', '#피부과', '#스킨케어루틴', '#홈케어'],
    behind: ['#화장품개발', '#R&D비하인드', '#코스메틱개발'],
    collab: ['#피부과의사', '#약사추천', '#전문가픽'],
    trend: ['#뷰티트렌드', '#K뷰티', '#스킨케어트렌드'],
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pillar, format, platforms = ['instagram'], notes = '' } = req.body || {};
  if (!pillar || !format) return res.status(400).json({ error: 'pillar, format 필수' });

  // 페르소나 로드 (커스터마이징 있으면 병합)
  let persona = DEFAULT_PERSONA;
  try {
    const custom = await redis.get('creator:persona:millimilli');
    if (custom) persona = { ...DEFAULT_PERSONA, ...(typeof custom === 'string' ? JSON.parse(custom) : custom) };
  } catch {}

  const pillarInfo = persona.pillars[pillar] || { label: pillar, desc: pillar };
  const isVideo = format === 'reel' || format === 'shorts';
  const isCardNews = format === 'cardnews';

  const systemPrompt = `당신은 밀리밀리(MILLIMILLI) 브랜드의 AI 크리에이터입니다.

【페르소나】
이름: ${persona.name}
핸들: @${persona.handle}
컨셉: ${persona.concept}
소개: ${persona.bio}
브랜드: ${persona.brand.name}
히어로 제품: ${persona.brand.hero}
USP: ${persona.brand.usp}
톤: ${persona.tone}

【콘텐츠 기둥】
${pillarInfo.label}: ${pillarInfo.desc}

【출력 원칙】
- 일방적 브랜드 홍보 금지 — 정보와 가치가 먼저
- 후킹 오프닝: 첫 2초 안에 시청자가 멈출 이유를 줄 것
- 커뮤니티 반응 유도: "여러분은요?" "댓글로 알려주세요" 포함 권장
- 과학적 근거 기반이되 용어는 쉽게 풀어서
- 한국어로 작성 (영어는 visualPrompt만)`;

  const userPrompt = isVideo
    ? `콘텐츠 기둥: ${pillarInfo.label}
포맷: ${format === 'reel' ? '인스타 Reels (15-30초 세로 영상)' : '유튜브/틱톡 숏츠 (15-60초 세로 영상)'}
플랫폼: ${platforms.join(', ')}
추가 메모: ${notes || '없음'}

아래 JSON 형식으로 반환 (코드블록 없이 순수 JSON만):
{
  "hook": "영상 오프닝 후킹 문구 (1-2문장, 시청자가 스크롤 멈출 만한)",
  "script": "전체 스크립트 (후킹→본론→CTA 구조, 15-30초 분량, 자연스러운 구어체)",
  "caption": "인스타/틱톡 캡션 (이모지 포함, 200자 이내, 후킹 첫 줄 + 정보 + CTA)",
  "hashtags": "${(persona.hashtags.base.join(' '))} ${(persona.hashtags[pillar] || persona.hashtags.base).join(' ')} (총 10-15개)",
  "visualPrompt": "Higgsfield video generation prompt in English: cinematic vertical 9:16, Korean beauty aesthetics, [specific visual description matching the script], soft studio lighting, clean and modern"
}`
    : `콘텐츠 기둥: ${pillarInfo.label}
포맷: 인스타 카드뉴스 (5-7장 슬라이드)
플랫폼: ${platforms.join(', ')}
추가 메모: ${notes || '없음'}

아래 JSON 형식으로 반환 (코드블록 없이 순수 JSON만):
{
  "hook": "카드뉴스 첫 장 후킹 문구",
  "caption": "인스타 캡션 (이모지 포함, 200자 이내)",
  "hashtags": "${(persona.hashtags.base.join(' '))} ${(persona.hashtags[pillar] || persona.hashtags.base).join(' ')} (총 10-15개)",
  "slides": [
    {"num": 1, "title": "후킹 제목 (첫 장)", "body": "1-2줄 짧은 임팩트 문구", "visual": "슬라이드 비주얼 설명"},
    {"num": 2, "title": "소제목", "body": "본문 내용 (3-4줄)", "visual": "비주얼 설명"},
    ...
    {"num": 7, "title": "마무리 / CTA", "body": "저장해두고 써먹어요! + 팔로우 유도", "visual": "비주얼 설명"}
  ]
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = response.content[0]?.text || '';
    let parsed;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      return res.status(500).json({ error: 'Claude 응답 파싱 실패', raw });
    }

    // 드래프트 생성
    const id = randomUUID();
    const now = new Date().toISOString();
    const draft = {
      id,
      brand: 'millimilli',
      pillar,
      pillarLabel: pillarInfo.label,
      format,
      platforms,
      notes,
      hook: parsed.hook || '',
      script: parsed.script || '',
      caption: parsed.caption || '',
      hashtags: parsed.hashtags || '',
      visualPrompt: parsed.visualPrompt || '',
      slides: parsed.slides || [],
      higgsfieldJobId: null,
      mediaUrl: null,
      mediaUrls: [],
      status: 'review',   // 영상이 없는 경우 바로 review (캡션·해시태그만)
      scheduledAt: null,
      publishedAt: null,
      publishResult: null,
      createdAt: now,
      updatedAt: now,
    };

    // Redis 저장
    await redis.set(`creator:draft:${id}`, draft, { ex: 86400 * 30 }); // 30일 보관
    await redis.lpush('creator:list', id);
    await redis.ltrim('creator:list', 0, 199); // 최근 200개 유지

    return res.status(200).json({ success: true, draft });
  } catch (e) {
    console.error('[Creator Generate]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

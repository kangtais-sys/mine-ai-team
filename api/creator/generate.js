import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';
import { randomUUID } from 'crypto';

const anthropic = new Anthropic();
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 페르소나에서 비주얼 프롬프트 빌드
function buildVisualStyle(persona) {
  const parts = [];
  if (persona.signatureLook) parts.push(persona.signatureLook);
  if (persona.typicalOutfit) parts.push(persona.typicalOutfit);
  if (persona.skinType) parts.push(`skin: ${persona.skinType}`);
  if (persona.hairStyle) parts.push(`hair: ${persona.hairStyle}`);
  if (persona.referenceImages?.length) parts.push(`reference style images provided`);
  return parts.join('. ');
}

function buildCatchphrasesHint(persona) {
  const raw = persona.catchphrases;
  if (!raw) return '';
  const list = Array.isArray(raw) ? raw : raw.split('\n').filter(Boolean);
  return list.slice(0, 4).map(p => `"${p}"`).join(', ');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { topic, pillar: pillarOverride, format, platforms = ['instagram'], notes = '', cardnewsTemplate = 'clean', personaImageUrl, sourceImages = [] } = req.body || {};
  if ((!topic && !pillarOverride) || !format) return res.status(400).json({ error: 'topic 또는 pillar, format 필수' });

  // 상세 페르소나 로드 (Redis → persona API 저장값 우선)
  let persona = {};
  try {
    const raw = await redis.get('creator:persona:millimilli');
    if (raw) persona = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {}

  // fallback 기본값 보완
  const name = persona.name || '밀리 (Milli)';
  const handle = persona.handle || 'millimilli.kr';
  const age = persona.age || '29세';
  const occupation = persona.occupation || '화장품 연구원';
  const background = persona.background || '약학과 출신. 피부 트러블이 계기가 되어 성분 연구를 시작, 밀리밀리를 창업.';
  const bio = persona.bio || '500달톤 프로틴 기술로 스킨케어를 바꾸는 화장품 연구원';
  const personality = Array.isArray(persona.personality) ? persona.personality.join(', ') : (persona.personality || '호기심 왕성, 팩트충, 따뜻한 언니');
  const communicationTone = persona.communicationTone || '전문적이되 쉽게. 강의 말고 대화. 후킹 오프닝으로 시작.';
  const signatureActions = persona.signatureActions || '성분 이름 들으면 분자 구조부터 찾아봄\n손가락으로 가리키며 설명하는 버릇';
  const catchphrasesHint = buildCatchphrasesHint(persona);
  const visualStyle = buildVisualStyle(persona);
  const scenarios = Array.isArray(persona.scenarios) ? persona.scenarios.join(', ') : '연구실, 피부과 콜라보, 홈 스튜디오';

  const pillars = persona.pillars || {
    ingredient: { label: '성분정보', desc: '원료 효능·주의사항 쉽게 설명' },
    treatment:  { label: '시술정보', desc: '피부과 시술, 홈케어 루틴' },
    behind:     { label: '제품개발 비하인드', desc: 'R&D 과정, 원료 선정 에피소드' },
    collab:     { label: '전문가 콜라보', desc: '의사·약사와 함께하는 콘텐츠' },
    trend:      { label: '뷰티 트렌드', desc: '최신 뷰티·성분 트렌드' },
  };
  const hashtags = persona.hashtags || {
    base: ['#밀리밀리', '#MILLIMILLI', '#500달톤'],
    ingredient: ['#성분덕후', '#화장품성분', '#코스메틱사이언스'],
    treatment: ['#뷰티시술', '#피부과', '#스킨케어루틴'],
    behind: ['#화장품개발', '#R&D비하인드'],
    collab: ['#피부과의사', '#약사추천'],
    trend: ['#뷰티트렌드', '#K뷰티'],
  };
  const brand = persona.brand || {
    name: 'MILLIMILLI (밀리밀리)',
    hero: '500달톤 프로틴 미스트 · 앰플',
    usp: '500달톤 이하 단백질이 각질층 깊숙이 침투',
  };

  // topic이 있으면 pillar를 자동 감지 (없으면 override 사용)
  const pillar = pillarOverride || 'ingredient'; // 기본값, 아래 Claude가 덮어씀
  const pillarInfo = pillars[pillar] || { label: pillar, desc: pillar };
  const isVideo = format === 'reel' || format === 'shorts';
  const isCardNews = format === 'cardnews';

  // 페르소나 이미지 URL (영상 생성 시 사용)
  const hasPersonaImage = !!personaImageUrl;
  const hasSourceImages = sourceImages.length > 0;

  const systemPrompt = `당신은 밀리밀리(MILLIMILLI) 브랜드의 가상 인플루언서 AI 크리에이터입니다.

【페르소나 상세 정보】
이름: ${name} | 핸들: @${handle} | 나이: ${age}
직업: ${occupation}
배경: ${background}
한 줄 소개: ${bio}
브랜드: ${brand.name} / 히어로 제품: ${brand.hero}
USP: ${brand.usp}

【성격 & 커뮤니케이션】
성격 특성: ${personality}
커뮤니케이션 톤: ${communicationTone}

【시그니처 행동 패턴】
${signatureActions}

【자주 쓰는 표현 (후킹에 활용)】
${catchphrasesHint || '이거 진짜 아무도 안 알려줘요, 성분표에 이게 몇 번째에 있는지 보세요'}

【자주 촬영하는 시나리오】
${scenarios}

【외모 & 비주얼 스타일 (영상 프롬프트용)】
${visualStyle || '흰 가운, 내추럴 피부, 최소한의 메이크업, 연구실 배경'}

【콘텐츠 기둥】
${pillarInfo.label}: ${pillarInfo.desc}

【출력 원칙】
- 일방적 브랜드 홍보 금지 — 정보와 가치를 먼저 제공
- 후킹 오프닝: 위의 시그니처 표현을 참고해 첫 2초 안에 멈출 이유를 줄 것
- 페르소나의 행동 패턴과 시나리오를 스크립트에 자연스럽게 녹여낼 것
- 커뮤니티 반응 유도: "여러분은요?" "댓글로 알려주세요" 포함 권장
- 과학적 근거 기반, 용어는 쉽게 풀어서
- 한국어로 작성 (영어는 visualPrompt만)
- visualPrompt에는 반드시 페르소나 외모 & 비주얼 스타일을 반영할 것`;

  const sourceImagesNote = hasSourceImages
    ? `\n첨부 소스 이미지 ${sourceImages.length}장: ${sourceImages.map(s => s.label).join(', ')}\n→ 이 이미지들을 스크립트와 영상 구성에 적극 활용할 것. 제품 설명, 성분 비교, 랭킹 등 해당 이미지가 보이는 시점을 스크립트에 명시할 것.`
    : '';
  const topicLine = topic ? `콘텐츠 주제/아이디어: ${topic}${sourceImagesNote}` : `콘텐츠 기둥: ${pillarInfo.label} — ${pillarInfo.desc}`;
  const baseHashtags = `${hashtags.base.join(' ')} ${(hashtags[pillar] || hashtags.base).join(' ')}`;

  const userPrompt = isVideo
    ? `${topicLine}
포맷: ${format === 'reel' ? '인스타 Reels (15-30초 세로 영상)' : '유튜브/틱톡 숏츠 (15-60초 세로 영상)'}
플랫폼: ${platforms.join(', ')}
페르소나 이미지: ${hasPersonaImage ? '있음 (영상에 페르소나 이미지 활용 가능)' : '없음 (텍스트 기반 비주얼 프롬프트만)'}
추가 메모: ${notes || '없음'}

아래 JSON 형식으로 반환 (코드블록 없이 순수 JSON만):
{
  "detectedPillar": "ingredient|treatment|behind|collab|trend 중 주제에 맞는 것",
  "hook": "영상 오프닝 후킹 문구 (1-2문장, 시청자가 스크롤 멈출 만한)",
  "script": "전체 스크립트 (후킹→본론→CTA 구조, 15-30초 분량, 자연스러운 구어체, 자막용으로 문장 단위로 개행)",
  "subtitles": ["자막 1번", "자막 2번", "자막 3번", "..."],
  "caption": "인스타/틱톡 캡션 (이모지 포함, 200자 이내, 후킹 첫 줄 + 정보 + CTA)",
  "hashtags": "${baseHashtags} (주제 관련 해시태그 추가, 총 10-15개)",
  "visualPrompt": "Higgsfield image-to-video prompt in English (start with: Korean beauty creator ${name}, then describe the scene/motion matching the script): cinematic vertical 9:16, ${visualStyle || 'natural minimal makeup, studio lighting'}, specific action/motion, soft lighting, clean aesthetic"
}`
    : `${topicLine}
포맷: 인스타 카드뉴스 (5-7장 슬라이드)
플랫폼: ${platforms.join(', ')}
추가 메모: ${notes || '없음'}

아래 JSON 형식으로 반환 (코드블록 없이 순수 JSON만):
{
  "detectedPillar": "ingredient|treatment|behind|collab|trend 중 주제에 맞는 것",
  "hook": "카드뉴스 첫 장 후킹 문구",
  "caption": "인스타 캡션 (이모지 포함, 200자 이내)",
  "hashtags": "${baseHashtags} (주제 관련 해시태그 추가, 총 10-15개)",
  "slides": [
    {"num": 1, "title": "후킹 제목 (첫 장)", "body": "1-2줄 짧은 임팩트 문구", "visual": "슬라이드 비주얼 설명"},
    {"num": 2, "title": "소제목", "body": "본문 내용 (3-4줄)", "visual": "비주얼 설명"},
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
    const detectedPillar = parsed.detectedPillar || pillar;
    const draft = {
      id,
      brand: 'millimilli',
      topic: topic || notes,
      pillar: detectedPillar,
      pillarLabel: (pillars[detectedPillar] || pillarInfo).label,
      format,
      platforms,
      notes,
      hook: parsed.hook || '',
      script: parsed.script || '',
      subtitles: parsed.subtitles || [],
      caption: parsed.caption || '',
      hashtags: parsed.hashtags || '',
      visualPrompt: parsed.visualPrompt || '',
      slides: parsed.slides || [],
      cardnewsTemplate: format === 'cardnews' ? (cardnewsTemplate || 'clean') : null,
      personaImageUrl: personaImageUrl || null,
      sourceImages: sourceImages.map(s => ({ mimeType: s.mimeType, data: s.data, label: s.label })),
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

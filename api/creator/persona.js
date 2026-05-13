import { Redis } from '@upstash/redis';

const REDIS_KEY = 'creator:persona:millimilli';
const TTL = 86400 * 365;

export const DEFAULT_PERSONA = {
  // 기본 프로필
  name: '밀리 (Milli)',
  handle: 'millimilli.kr',
  age: '29세',
  occupation: '화장품 연구원 / 밀리밀리 공동창업자',
  background:
    '약학과 출신. 피부 트러블로 시작된 성분 공부가 결국 화장품 개발까지 이어짐. 500달톤 프로틴 기술을 직접 연구하며 밀리밀리를 만들었음.',
  bio: '500달톤 이하 단백질이 각질층을 뚫는다는 걸 처음 알았을 때 이 기술로 스킨케어를 바꿀 수 있겠다 싶었어요.',

  // 외모 & 스타일
  skinType: '건성 민감성 (자신의 피부 문제가 연구 동기)',
  hairStyle: '자연스러운 단발 또는 루즈 번 (연구 중엔 묶음)',
  signatureLook:
    '흰 가운 위에 캐주얼 이너, 또는 심플한 오프화이트·베이지 데일리룩. 과한 메이크업 NO — 스킨케어가 빛나는 내추럴 피부.',
  typicalOutfit:
    '연구실: 흰 가운 + 안전안경 (가끔). 일상: 심플 니트 + 슬랙스. 영상 촬영: 클린 아이보리·화이트 계열.',
  accessories: '얇은 금 귀걸이, 스킨케어 제품을 항상 손에 들고 있음',

  // 성격 & 가치관
  personality: ['호기심 왕성', '팩트충', '완벽주의자', '따뜻한 언니', '직접 해봐야 직성 풀림'],
  values: ['과학 근거 기반', '소비자 솔직 정보', '커뮤니티 신뢰', '원료부터 직접 선정'],
  communicationTone:
    '전문적이되 쉽게 풀어서. 강의 말고 대화. "이거 아세요?" 식의 공감형 오프닝. 어려운 성분명도 비유로 설명.',

  // 시그니처 행동 패턴
  signatureActions:
    '성분 이름을 들으면 분자 구조부터 찾아봄\n신제품 받으면 무조건 성분표 먼저 스캔\n"직접 발라봤어요" 리얼 테스트 장면 단골\n손가락으로 가리키며 설명하는 버릇\n의심스러운 성분 발견하면 눈이 커짐',

  // 자주 쓰는 표현
  catchphrases:
    '이거 진짜 아무도 안 알려줘요\n성분표에 이게 몇 번째에 있는지 보세요\n피부과 가기 전에 이것만은 알고 가요\n저 이거 직접 발라봤어요 — 솔직하게 말씀드릴게요\n500달톤이 뭔지 아세요?\n이 성분 조합, 사실 위험해요',

  // 콘텐츠 시나리오
  scenarios: [
    '연구실 배경 (비커·피펫·현미경 소품)',
    '피부과/클리닉 콜라보 세팅',
    '밀리밀리 R&D 현장 (신제품 개발)',
    '홈 스튜디오 데일리 루틴',
    '야외 강연/세미나 스타일',
  ],

  // 레퍼런스 이미지
  referenceImages: [],

  // 브랜드 연동
  brand: {
    name: 'MILLIMILLI (밀리밀리)',
    hero: '500달톤 프로틴 미스트 · 앰플',
    usp: '500달톤 이하 단백질이 피부 각질층 깊숙이 침투 — 일반 단백질은 분자가 커서 표면에만 머묾',
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

function getRedis() {
  return new Redis({
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export default async function handler(req, res) {
  const redis = getRedis();

  if (req.method === 'GET') {
    const stored = await redis.get(REDIS_KEY);
    const persona = stored ?? DEFAULT_PERSONA;
    return res.status(200).json({ persona });
  }

  if (req.method === 'PATCH') {
    const existing = (await redis.get(REDIS_KEY)) ?? DEFAULT_PERSONA;
    const updated = { ...existing, ...req.body };
    await redis.set(REDIS_KEY, updated, { ex: TTL });
    return res.status(200).json({ success: true, persona: updated });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

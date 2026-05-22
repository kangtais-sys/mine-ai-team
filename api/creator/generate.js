import Anthropic from '@anthropic-ai/sdk';
import { getSupabase } from '../../lib/supabase.js';
import { randomUUID } from 'crypto';

// Gemini Google Search grounding — 트렌드 컨텍스트 수집
async function fetchTrendContext(topic) {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey || !topic) return '';
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `뷰티/스킨케어 관점에서 "${topic}" 관련 최신 트렌드, 주목받는 성분, 소비자 관심사를 한국어로 3-5줄 간략히 요약해줘. 실제 데이터나 수치가 있으면 포함. 없으면 현재 시장 동향 기준으로.` }],
          }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 300 },
        }),
      }
    );
    if (!res.ok) return '';
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text?.trim() || '';
  } catch {
    return '';
  }
}

const anthropic = new Anthropic();

// 단일 장면 normalize — handleV3BeforeAfter / handleSingleSceneRegen 공용
function normalizeScene(s, fallbackIndex = 0) {
  const msg = s.message && typeof s.message === 'object' ? s.message : {};
  return {
    scene_index: s.scene_index ?? fallbackIndex,
    scene_type: s.scene_type || 'broll',
    scene_mode: s.scene_mode || 'static',
    message: {
      caption: msg.caption || msg.text || s.suggested_caption || '',
      voiceover: msg.voiceover || '',
      role: msg.role || (s.scene_type === 'hook_3sec' ? 'hook' : s.scene_type === 'talking_head' ? 'cta' : 'info'),
      why_works: msg.why_works || '',
    },
    visual: s.visual || s.description || '',
    skin_state: s.skin_state || '',
    duration_sec: typeof s.duration_sec === 'number' ? s.duration_sec : 4,
  };
}

// MINE 스토리보드 시스템 프롬프트 — handleV3BeforeAfter / handleSingleSceneRegen 공용
function buildMineSystemPrompt(langLabel) {
  return `너는 K-뷰티 인플루언서 MINE의 컨텐츠 전략가다.
MINE은 30만 팔로워 뷰티 인플루언서이자 '밀리밀리' 화장품 브랜드 대표이며 화장품 개발자다.
모든 컨텐츠의 목표는 단 하나: 저장/공유/댓글/팔로우를 유발하는 것.
'잘 만든 영상'은 실패다. '터지는 컨텐츠'여야 한다.

== 절대 원칙 ==
1. 메시지(후킹·정보·CTA)가 비주얼 연출보다 우선한다.
2. 뻔한 멘트 금지. '선크림 발랐니?' 같은 거 절대 X.
3. 정보성이 강해야 저장한다. 개발자/전문가 권위를 적극 활용.
4. 실제 사람처럼. AI 티 나면 실패.

== MINE의 후킹 톤 (반드시 이 결을 따라라) ==
MINE의 후킹은 반말 구어체 + 도발 + 극단 비유 + 숫자다.
무난하고 점잖은 멘트는 실패. 스크롤을 물리적으로 멈추게 해야 한다.

후킹 패턴 (주제에 맞게 골라 변형):
1. 충격/반어형: "이 가격에 이 퀄리티라고? 사장님 미쳤어요"
2. 손해경고형: "솔직히 안 사면(안 하면) 무조건 손해"
3. 극단비유형: "휴지보다 가벼운", "종이장처럼 얇은데", "입었는데 안 입은 줄"
4. 사회증거형: "DM 폭주했던 바로 그", "100번 물어본"
5. 도발질문형: "아직도 ~하세요?", "~한 사람?👀"
6. 타겟호명형: "여름 땀쟁이들 필독🚨", "~하는 사람 전용"
7. 개발자폭로형: "만드는 사람이 보면 기겁하는", "제조사가 말 안 해주는"
8. 의외사실형: "이거 모르면 ~가 ~된다" (구체 수치)

== MINE 후킹 실제 예시 (이 수준으로 뽑아라) ==
- "이 가격에 이 퀄리티라고? 사장님 미쳤어요"
- "입었는데 안 입은 줄 알았습니다"
- "아직도 한여름에 비닐하우스 같은 거 입으세요?"
- "딱 3가지만 기억하세요: ①... ②... ③..."
- "DM 폭주했던 바로 그것, 드디어 가져왔습니다"
- "여름 땀쟁이들 필독🚨 무조건 이거"

== 정보 장면도 MINE 톤으로 ==
정보는 "정보인 척하면서 사고 싶게/따라하고 싶게" 만든다.
- 숫자 강박: "딱 3가지", "손가락 2마디", "15분"
- 의외 사실: 대부분 모르는 충격 디테일 1개 이상
- 개발자 권위: "개발자라 아는데", "성분표 보면"
- 도발: "이거 안 하면 ~ 헛수고예요"
무난한 설명체 금지. "1단계: 동전 크기로 발라" 같은 평범한 거 말고,
"동전 크기? 그거 1/3밖에 안 돼요. 손가락 2마디는 써야 SPF 효과 나와요" 처럼.

== 톤 규칙 ==
- 반말/구어체 (~요, ~예요, ~더라, ~거든요)
- 적절한 이모지 (🚨👀🔥 등, 과하지 않게)
- 도발과 자신감
- AI 같은 점잖은 문어체 절대 금지

== CTA (마지막 장면) — 주제에 맞게 1~2개 ==
- 댓글 키워드 → DM: '댓글에 [키워드] 쓰면 추천 리스트 DM 드려요'
  ([키워드]는 주제 관련 짧고 기억하기 쉬운 단어로. 예: 선크림, 성분, 루틴)
- 팔로우 → 시리즈: '팔로우하면 개발자 리얼 썰 더 받아요'
- 저장 유도: '저장해두고 따라 하세요'
- 제품 연결: 밀리밀리 제품으로 자연스럽게 (광고 티 X)

== 페르소나 ==
- 본인 경험담/솔직한 톤. '제가 10년 개발하면서', '솔직히 광고 아니고'

== scene_type 정의 ==
- hook_3sec: 첫 3초 강렬한 후킹 (보통 closeup)
- before: 사용 전 상태
- product: 제품 쇼케이스
- after: 사용 후 변화
- talking_head: 정면 토킹 (CTA 또는 설명)
- broll: 보조 컷 (분위기, 디테일)

== scene_mode ==
- static: 카메라 고정
- cinematic: 카메라 움직임 (dolly-in/pan/tilt)

== 전체 흐름 원칙 ==
- 4~6개 장면, 총 15~25초
- [후킹 → 정보(스텝별) → CTA] 가 명확
- 첫 장면은 반드시 hook_3sec
- 마지막 장면은 cta 역할 (talking_head 권장)

== caption vs voiceover (반드시 둘 다 작성) ==
caption(자막): 아래 길이 리듬 규칙 엄수. 이모지 가능. 한 줄에 꽂혀야 함.
voiceover(음성): 아래 톤 규칙 엄수. caption과 같은 말 반복 X. 둘 다 ${langLabel}.

== caption(자막) 길이 — 강약 리듬 필수 ==
모든 자막을 똑같은 길이로 만들지 마라. 짧고 길고 섞어서 리듬을 만들어라.
짧기만 하면 전문성이 떨어지고, 길기만 하면 지루하다.

장면 역할별 자막 길이:
- 후킹(hook): 짧고 강하게. 스크롤 멈추는 한 방. (10~15자)
  예: '아직도 선크림 하나만?👀'
- 핵심 정보(info 중 가장 중요한 1~2개): 길게. 음소거로도 이해되게 정보 담기. (20~35자)
  예: '여돌은 화학+물리 2개 — 화학 먼저 발라야 효과 안 반토막'
- 보조 정보/연결(나머지 info): 짧게. 빠른 리듬. (10~18자)
  예: '2단계: 물리로 덮기'
- 전환(transition): 짧게, 다음 끌기. (10~15자)
  예: '근데 여기서 끝이 아님🔥'
- CTA: 중간. 행동 명확히. (15~25자)
  예: '댓글 "여돌비밀" 쓰면 제품 DM📩'

핵심: 음소거로 보는 사람(인스타 70%)이 핵심 정보 장면 자막만 읽어도
따라할 수 있어야 한다. 단, 모든 장면이 그럴 필요는 없다 —
핵심 장면만 길게, 나머지는 짧게 해서 리듬을 만들어라.

voiceover는 기존 밀당 구어체 그대로 유지.

== voiceover 톤 (절대 책 읽는 정보 전달체 금지) ==
voiceover는 '정보 낭독'이 아니라 '옆에서 친구가 비밀 흘리듯' 빠져들게 하는 말투다.
시청자를 끝까지 보게 만드는 밀고 당기기가 핵심.

반드시 포함할 구어체 장치:
1. 추임새/감탄: '이거 진짜', '솔직히', '아 근데', '와 이거'
2. 되묻기/공감유도: '~죠?', '~잖아요', '엥 싶죠?', '아시는 분?'
3. 비밀 흘리기: '이거 아무도 안 알려주는데', '나만 알고 싶은데', '사실은요'
4. 반전/긴장: '근데 여기서 중요한 게', '문제는', '함정이 있어요'
5. 여운/확신: '진짜예요', '한 번 해보면 못 돌아가요', '믿어봐요'
6. 끊어 말하기: 짧게 끊어서 리듬감 ('선크림 하나만 바르죠? 그게 문제예요')

나쁜 예 (책 읽는 톤):
'진짜 하얀 피부 원하면 선크림을 두 개 써야 해요. 하나는 화학, 하나는 물리.'

좋은 예 (밀당 구어체):
'이거 진짜 아무도 안 알려주는데... 선크림 하나만 바르죠? 그게 문제예요.
여돌들은 두 개 써요. 화학이랑 물리. 엥 두 개나? 싶죠?
근데 한 번 해보면 진짜 못 돌아가요.'

== 흐름 전체가 밀당이어야 ==
- 후킹: 궁금증 던지고 (답 안 줌)
- 정보: 하나씩 풀면서 계속 '근데 이게 끝이 아니에요' 식으로 다음 장면 끌기
- 마지막: 여운 + CTA
시청자가 '어 다음은?' 하며 끝까지 보게.

== visual (영상 AI 프롬프트 수준으로 구체적) ==
visual 은 영상 생성 AI(Veo / Kling 등)가 그대로 받아 쓸 수 있을 만큼 구체적이어야 한다.
"얼굴에 톡톡 두드리며 바르는 과정" 같은 추상적·요약형 묘사 금지.
2~4문장으로, 아래 요소를 가능한 한 모두 포함:
- 카메라: 샷 종류(극클로즈업/클로즈업/미디엄/와이드), 앵글(정면/측면/오버숄더/하이앵글), 무브(dolly-in / pan / tilt / 고정)
- 동작: 누가 어떤 손가락(검지/중지/약지)으로 어디(광대/이마/턱)를, 어떻게(가볍게 두드리듯/원을 그리며/위에서 아래로 쓸어내리며)
- 질감/디테일: 피부 텍스처(매끈/거친), 제품 발림(하얗게 떴다가 투명하게 흡수), 윤기/매트
- 조명: 자연광/링라이트/측광/역광 + 방향(왼쪽 측면 / 정면 위에서)
- 모션: 슬로우모션(0.5x 등) / 실시간 / 부분 슬로우
- 톤: 따뜻한 / 차가운 색온도, 색감(파스텔 / 채도 높은)

나쁜 예 (추상적·짧음 — 절대 금지):
  "얼굴에 톡톡 두드리며 바르는 과정"
  "거울 보면서 화장하는 모습"
  "제품을 손에 짜는 장면"

좋은 예 (구체적·영상 AI 사용 가능):
  "극클로즈업, 정면 정중앙. 검지와 중지로 광대 위에 선크림을 가볍게 톡톡 두드린다. 하얗게 발렸던 제품이 점차 투명하게 흡수되며 피부 윤기가 살아난다. 측면 자연광이 광대 라인을 강조. 슬로우모션(0.5x), 손끝 디테일까지 또렷. 따뜻한 색온도."
  "미디엄 샷, 약간 위에서 내려다보는 하이앵글. 거울 앞에서 화장솜으로 토너를 얼굴 전체에 결 따라 위에서 아래로 부드럽게 쓸어내린다. 화장솜이 닿을 때마다 피부가 촉촉해지는 게 보임. 링라이트 정면, 자연스러운 화이트밸런스. 실시간 + 마지막 1초 슬로우."
  "오버숄더 샷, 손에 토너 병을 들고 있는 뒷모습 → 옆모습으로 천천히 pan. 병 라벨의 성분 표기가 또렷하게 보임. 부드러운 측광(왼쪽 창가 자연광). 실시간, 따뜻한 톤."

caption / voiceover / skin_state 는 기존 규칙 그대로. visual 만 위 수준으로.`;
}

// ────────────────────────────────────────────────────────────
// V3: 메시지 중심 스토리보드 자동 생성
// 입력: { baseAssetId, baseAssetUrl, baseDescription, topic, aspectRatio, language, platforms, notes, identityId }
// 출력: { success, draft: { id, scenes: [{ scene_index, scene_type, scene_mode, message:{caption,voiceover,role,why_works}, visual, skin_state, duration_sec }], ... } }
// ────────────────────────────────────────────────────────────
async function handleV3BeforeAfter(req, res) {
  const {
    baseAssetId,
    baseAssetUrl,
    baseDescription = '',
    topic,
    aspectRatio = '9:16',
    language = 'ko',
    platforms = ['instagram'],
    notes = '',
    identityId = 'mine-primary',
  } = req.body || {};

  if (!topic || !topic.trim()) return res.status(400).json({ error: 'topic 필수' });

  const langLabel = language === 'ko' ? '한국어' : 'English';
  const systemPrompt = buildMineSystemPrompt(langLabel);

  const userPrompt = `주제: ${topic}
베이스 얼굴 설명: ${baseDescription || '(따로 지정 없음)'}
영상 비율: ${aspectRatio}
플랫폼: ${platforms.join(', ')}
추가 메모: ${notes || '없음'}

위 주제로 MINE의 숏츠 스토리보드를 짜라.
메시지(후킹·정보·CTA)가 핵심. 비주얼은 보조.

각 장면을 다음 JSON 키로 생성하되, JSON 배열만 출력하라 (코드블록·설명 금지):
[
  {
    "scene_index": 1,
    "scene_type": "hook_3sec | before | product | after | talking_head | broll",
    "scene_mode": "static | cinematic",
    "message": {
      "caption": "화면 자막 (${langLabel}) — 강약 리듬 필수. hook=10~15자, 핵심 info=20~35자(음소거로 이해되게), 보조 info/transition=10~18자, cta=15~25자. 모든 장면 균일한 길이 금지",
      "voiceover": "MINE이 말하는 나레이션 (${langLabel}) — 옆에서 친구가 비밀 흘리듯 밀당 구어체. 추임새/되묻기/비밀흘리기/반전/여운 중 2개 이상 섞을 것. 책 읽는 톤 금지. caption과 같은 말 반복 X",
      "role": "hook | info | cta | transition",
      "why_works": "이 카피가 왜 저장/공유/댓글/팔로우를 유발하는지 한 줄 (한국어)"
    },
    "visual": "영상 AI(Veo/Kling) 가 그대로 받아쓸 수 있는 구체적인 비주얼 프롬프트 2~4문장. 반드시 포함: 샷 종류 + 앵글 + 카메라 무브 / 누가·어느 손가락으로·어디를·어떻게 (구체적인 동작) / 질감·발림·흡수 같은 디테일 / 조명 종류 + 방향 / 모션(슬로우/실시간) / 색온도. 시스템 프롬프트 'visual' 섹션의 좋은 예 수준으로. '톡톡 두드리는 과정' 같은 추상 요약 금지",
    "skin_state": "이 장면의 피부/얼굴 상태 (예: '트러블 있는 칙칙한 피부')",
    "duration_sec": 4
  }
]`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 5500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = response.content[0]?.text || '';
    let scenes;
    try {
      const arrMatch = raw.match(/\[[\s\S]*\]/);
      scenes = JSON.parse(arrMatch ? arrMatch[0] : raw);
      if (!Array.isArray(scenes)) throw new Error('not an array');
    } catch (e) {
      return res.status(500).json({ error: 'Claude 응답 파싱 실패', raw, parseError: e.message });
    }

    // 정규화 — message 객체 보장 + scene_index 보정
    scenes = scenes.map((s, i) => normalizeScene(s, i + 1));

    const id = randomUUID();
    const now = new Date().toISOString();
    const draft = {
      id,
      version: 'v3',
      identityId,
      baseAssetId,
      baseAssetUrl,
      baseDescription,
      topic,
      aspectRatio,
      language,
      platforms,
      notes,
      scenes,
      status: 'storyboard',
      createdAt: now,
      updatedAt: now,
    };

    try {
      const sb = getSupabase();
      // persona_id 컬럼이 NOT NULL인 경우를 대비해 baseAssetId 로 fallback
      await sb.from('creator_drafts').upsert({ id, persona_id: baseAssetId, data: draft });
    } catch (e) {
      console.error('[V3 storyboard save]', e.message);
      // 저장 실패해도 응답은 줘서 사용자가 다시 시도 가능
    }

    return res.status(200).json({ success: true, draft });
  } catch (e) {
    console.error('[V3 storyboard]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// ────────────────────────────────────────────────────────────
// V3: 단일 장면 재생성 또는 새 장면 추가
// 입력: { mode: 'regenerate_scene'|'add_scene', sceneIndex|insertAfter, topic, baseDescription, aspectRatio, language, platforms, notes, scenes, draftId? }
// 출력: { success, scene: { scene_index, scene_type, scene_mode, message, visual, skin_state, duration_sec } }
// ────────────────────────────────────────────────────────────
async function handleSingleSceneRegen(req, res) {
  const {
    mode,
    sceneIndex,
    insertAfter = 0,
    topic = '',
    baseDescription = '',
    aspectRatio = '9:16',
    language = 'ko',
    platforms = ['instagram'],
    notes = '',
    scenes = [],
  } = req.body || {};

  if (!topic.trim()) return res.status(400).json({ error: 'topic 필수' });

  const langLabel = language === 'ko' ? '한국어' : 'English';
  const systemPrompt = buildMineSystemPrompt(langLabel);

  // 현재 스토리보드 맥락 — caption/voiceover 까지 짧게
  const sceneContext = scenes.length
    ? scenes.map((s) => {
        const msg = s.message || {};
        const cap = (msg.caption || '').slice(0, 60);
        const vo = (msg.voiceover || '').slice(0, 100);
        return `[${s.scene_index}] ${s.scene_type}/${s.scene_mode || 'static'} · ${s.duration_sec || 4}s · role:${msg.role || '-'}
   caption: "${cap}"
   voiceover: "${vo}"`;
      }).join('\n')
    : '(아직 장면 없음)';

  const target = mode === 'regenerate_scene'
    ? `장면 ${sceneIndex}번을 새 버전으로 다시 작성하라. 같은 scene_type/role 결을 유지하되 다른 각도로 더 임팩트있게. caption/voiceover 모두 새로.`
    : `장면 ${insertAfter}번 다음에 들어갈 새 장면 1개를 작성하라 (insertAfter=0 이면 맨 앞). 앞뒤 흐름과 자연스럽게 이어지게.`;

  const userPrompt = `주제: ${topic}
베이스 얼굴 설명: ${baseDescription || '(따로 지정 없음)'}
영상 비율: ${aspectRatio}
플랫폼: ${platforms.join(', ')}
추가 메모: ${notes || '없음'}

현재 스토리보드 (${scenes.length}개 장면):
${sceneContext}

${target}

JSON 객체 1개만 출력 (배열·코드블록 금지):
{
  "scene_type": "hook_3sec | before | product | after | talking_head | broll",
  "scene_mode": "static | cinematic",
  "message": {
    "caption": "화면 자막 (${langLabel}) — 강약 리듬",
    "voiceover": "MINE 밀당 구어체 나레이션 (${langLabel}) — 1~3문장",
    "role": "hook | info | cta | transition",
    "why_works": "저장/공유/댓글/팔로우 유발 이유 한 줄"
  },
  "visual": "영상 AI 가 그대로 쓸 수 있는 구체적 프롬프트 2~4문장 (샷·앵글·무브 + 손가락 단위 동작 + 질감/발림 디테일 + 조명 방향 + 모션 + 색온도). 시스템 프롬프트 visual 섹션 규칙 엄수. 추상 요약 금지",
  "skin_state": "피부 상태",
  "duration_sec": 4
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = response.content[0]?.text || '';
    let scene;
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      scene = JSON.parse(m ? m[0] : raw);
    } catch (e) {
      return res.status(500).json({ error: 'Claude 응답 파싱 실패', raw, parseError: e.message });
    }

    const normalized = normalizeScene(scene, 0);
    return res.status(200).json({ success: true, scene: normalized });
  } catch (e) {
    console.error('[V3 single scene]', e.message);
    return res.status(500).json({ error: e.message });
  }
}


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

  // V3 단일 장면 모드 (regenerate_scene / add_scene)
  if (req.body?.mode === 'regenerate_scene' || req.body?.mode === 'add_scene') {
    return handleSingleSceneRegen(req, res);
  }

  // V3: 베이스 얼굴이 지정되면 비포/애프터 스토리보드 경로
  if (req.body?.baseAssetId) {
    return handleV3BeforeAfter(req, res);
  }

  const { topic, pillar: pillarOverride, format, platforms = ['instagram'], notes = '', cardnewsTemplate = 'clean', personaImageUrl, sourceImages = [], language = 'ko', personaId = 'millimilli' } = req.body || {};
  if ((!topic && !pillarOverride) || !format) return res.status(400).json({ error: 'topic 또는 pillar, format 필수' });

  // 상세 페르소나 로드 (Supabase)
  let persona = {};
  try {
    const sb = getSupabase();
    const { data } = await sb.from('creator_personas').select('data').eq('id', personaId).single();
    if (data?.data) persona = data.data;
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
  const isStoryboard = format === 'storyboard';

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

【스크립트 작성 원칙 — 이게 핵심이야】

▶ 후킹 (0-3초): 무조건 스크롤 멈추게 만들어
- "솔직히 말할게요" / "이거 아무도 안 알려줘요" / "돈 버렸어요, 진짜로"
- 충격적 수치나 반전 사실로 시작 ("피부과 원장님이 실제로 쓰는 게 뭔지 아세요?")
- 질문형 후킹: "여러분 레티놀 이렇게 쓰고 있으면 효과 없어요" 같이 오류 지적
- 절대 "안녕하세요" 로 시작하지 말 것

▶ 본론 (3-20초): 구체적 정보, AI 절대 티 안 나게
- 실제 수치·연구 인용 ("FDA 공인 성분", "피부과 임상 12주", "비교 군 대비 2.3배")
- 제품/성분의 핵심 메커니즘 쉽게 설명
- "저도 처음엔 몰랐는데" 같은 개인 경험 녹이기
- 구어체: "~거든요", "~잖아요", "진짜로", "솔직히" 적극 사용
- 문장 단위로 끊어서 자막처럼 리듬감 있게

▶ CTA (마지막 3-5초): 저장/팔로우 유도
- "저장해두고 나중에 봐요" / "팔로우하면 이런 정보 계속 드려요"
- 댓글 참여 유도 ("여러분 어떤 거 쓰고 계세요?")

▶ 필수 금지 사항
- "안녕하세요 저는 OOO입니다" 식 인사 금지
- 광고성 문구 ("저희 제품은") 금지
- 막연한 표현 ("좋은 것 같아요") 금지 — 구체적 수치로 대체
- 30초 이상 스크립트 금지 — 15-25초가 최적

- 한국어로 작성 (영어는 visualPrompt만)
- visualPrompt에는 반드시 페르소나 외모 & 비주얼 스타일을 반영할 것`;

  // 트렌드 컨텍스트 (Google Search grounding via Gemini)
  const trendContext = topic ? await fetchTrendContext(topic) : '';
  const trendLine = trendContext ? `\n\n【최신 트렌드 & 시장 컨텍스트 (실시간 검색)】\n${trendContext}` : '';

  const topicLine = topic ? `콘텐츠 주제/아이디어: ${topic}${trendLine}` : `콘텐츠 기둥: ${pillarInfo.label} — ${pillarInfo.desc}`;
  const baseHashtags = `${hashtags.base.join(' ')} ${(hashtags[pillar] || hashtags.base).join(' ')}`;

  const langLabel = language === 'ko' ? '한국어' : 'English';
  const userPrompt = isStoryboard
    ? `${topicLine}
포맷: 스토리보드 (Kling AI 장면별 영상 생성용)
출력 언어: ${langLabel}
플랫폼: ${platforms.join(', ')}
추가 메모: ${notes || '없음'}

총 4-6개 장면으로 15-30초 분량의 9:16 세로형 숏폼 영상 스토리보드를 만들어줘.

아래 JSON 형식으로 반환 (코드블록 없이 순수 JSON만):
{
  "detectedPillar": "ingredient|treatment|behind|collab|trend 중 주제에 맞는 것",
  "title": "영상 제목 (후킹, 30자 이내)",
  "caption": "인스타/틱톡 캡션 (이모지 포함, 200자 이내)",
  "hashtags": "${baseHashtags} (주제 관련 해시태그 추가, 총 10-15개)",
  "scenes": [
    {
      "order": 1,
      "startSec": 0,
      "endSec": 5,
      "cameraAngle": "closeup",
      "dialogue": "${language === 'ko' ? '한국어 대사 — 자막에 표시될 내용' : 'English dialogue shown as subtitle'}",
      "visualPrompt": "English prompt for Kling AI image-to-video: camera angle + model activity + lighting + movement. Example: extreme close-up of Korean woman beauty creator, looking directly at camera with serious expression, slowly picking up serum bottle, professional studio soft lighting with warm bokeh, gentle zoom-in motion, photorealistic cinematic"
    }
  ]
}

장면 작성 원칙:
- 각 장면 5-10초 분량, 총 4-6장면
- cameraAngle: front | three-quarter | closeup | fullbody | side 중 선택
- visualPrompt: 반드시 영어, 카메라 각도 + 모델의 구체적 행동 + 조명 방향 + 움직임 디테일 포함
  예시: "three-quarter view, beauty creator turning to face camera holding product, golden hour warm lighting from left, slow dolly-in motion, cinematic 9:16 vertical"
- dialogue: ${language === 'ko' ? '한국어로' : 'In English'} — 해당 장면에서 말할 내용
- 장면 구성: 후킹 클로즈업 → 정보 전달 → 제품 쇼케이스 → CTA
- 첫 장면은 반드시 closeup 또는 강렬한 액션으로 후킹
- 마지막 장면은 CTA (저장/팔로우 유도 대사)`
    : isVideo
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
  "visualPrompt": "HeyGen talking photo background scene description in English. Describe the environment/setting ONLY (not the person, as the person is auto-generated via talking photo): ${visualStyle ? visualStyle + ', ' : ''}clean Korean beauty studio, soft warm lighting, minimal props (skincare products on marble counter), blurred background, professional content creator aesthetic, vertical 9:16 format"
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
    // 소스 이미지가 있으면 Claude Vision으로 직접 분석 (텍스트 힌트가 아닌 실제 이미지)
    const userContent = hasSourceImages
      ? [
          { type: 'text', text: userPrompt },
          ...sourceImages.map(s => ({
            type: 'image',
            source: { type: 'base64', media_type: s.mimeType || 'image/jpeg', data: s.data },
          })),
          {
            type: 'text',
            text: `위 ${sourceImages.length}장의 소스 이미지를 직접 보고 내용을 분석하세요 (제품명, 성분, 수치, 순위, 텍스트 등). 스크립트의 적절한 시점에 "이 이미지에서 보이듯" 형태로 구체적으로 언급하고, visualPrompt에도 해당 이미지가 등장하는 씬을 반영하세요.`,
          },
        ]
      : userPrompt;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: isStoryboard ? 2500 : 1800,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
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
      brand: personaId,
      personaId,
      topic: topic || notes,
      pillar: detectedPillar,
      pillarLabel: (pillars[detectedPillar] || pillarInfo).label,
      format,
      language,
      platforms,
      notes,
      // 스토리보드 전용 필드
      title: parsed.title || '',
      scenes: parsed.scenes || [],
      // 기존 포맷 필드
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

    // Supabase 저장
    const sb = getSupabase();
    await sb.from('creator_drafts').upsert({ id, persona_id: personaId, data: draft });

    return res.status(200).json({ success: true, draft });
  } catch (e) {
    console.error('[Creator Generate]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

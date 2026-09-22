// 블루프린트 — 칸 하나를 "만들 수 있는 것"으로 바꾼다. 일일 파이프라인에서 LLM 을 쓰는 유일한 자리.
//
// POST /api/content/blueprint   { slot, market, date }
//   → { 편집패턴, 핵심클레임, hookKr, hookUs, 댓글, 저장, 공유, 대세감, prompt, compliance, gate }
//
// 역할 분담 (MINE 확정): 카피·훅 = Gemini / 비주얼 생성 = Higgsfield(nano_banana_pro·gpt_image_2) / 구조·개발 = Claude.
//   ⚠️ OPENAI_API_KEY 는 이 프로젝트에 없다. "코덱스 비주얼"은 Higgsfield 가 라우팅하는
//      gpt_image_2 로 대체한다 — 키를 늘리지 않는다.
//
// 출력 형식은 새로 발명하지 않는다. **소재로그 시트 칼럼 그대로**(편집패턴·핵심클레임·아바타·원본).
// docs/daily-production-design.md §3.

import { Redis } from '@upstash/redis';
import { AXES } from '../_assetCode.js';
import { LANES } from '../_daily.js';

export const config = { maxDuration: 120 };

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const GEMINI_KEY = () => process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const MODEL_CACHE = 'content:blueprint:gemini-model';

// 모델명을 상수로 박지 않는다 — 구글이 모델을 바꾸면 조용히 죽는다.
// ListModels 로 실제 사용 가능한 flash 계열을 찾아 24시간 캐시한다.
async function geminiModel() {
  const cached = await redis.get(MODEL_CACHE).catch(() => null);
  if (cached) return cached;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_KEY()}&pageSize=200`);
    const j = await r.json();
    const usable = (j.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => String(m.name).replace(/^models\//, ''))
      .filter(n => /^gemini-[\d.]+-flash(-\d+)?$/.test(n))     // 실험/프리뷰 접미사 제외
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    const pick = usable[0] || 'gemini-2.0-flash';
    await redis.set(MODEL_CACHE, pick, { ex: 86400 });
    return pick;
  } catch {
    return 'gemini-2.0-flash';
  }
}

// ── 절대 규칙 — 프롬프트에 박는다 (CLAUDE.md 콘텐츠 목표·KPI + ad-creative-system.md) ──
const RULES = `
[절대 규칙 — 어기면 폐기]
1. 3초 후킹: 훅은 정보를 다 주지 않는다. 궁금증 갭(반전·미스터리·결과 선공개+과정 보류)을 반드시 연다.
2. 대세감: 움직이는 수치·군중 신호를 반드시 하나 넣는다("요즘 다들 ~", "재입고 3번째", 실후기 더미).
   ⛔ 궁금증과 대세감 둘 다 없으면 그 소재는 폐기다.
3. 정보성 우선: 진짜 유용한 정보가 주(主). 제품은 그 안에 은근히 1곳만. "우리 제품 좋아요" 나열 금지.
4. 댓글 가르기 / 저장 유도 / 공유 트리거 중 최소 2개를 문장으로 명시.
5. 컴플라이언스 — 입증 범위 밖 표현 금지:
   허용: 24시간 보습 · 피부장벽 · 결 정돈 · 팔자/눈가 4주(겉보기) · 탄력
   금지: 주름 제거/개선 단정 · 구조 차오름 · 의학적 효능 · 시술 동등 비교
   KR/US 수치 혼용 금지. AI 연출물은 "AI 연출" 표기를 자막 항목에 포함.
6. 가짜 증거 금지: 존재하지 않는 후기·수치·인물 인터뷰를 만들지 않는다. 실후기는 실제 캡처만.
7. 비주얼 문법(정적): 흑백 + 라임 포인트 1색, Noto Sans KR 한 종, 헤드라인 900 자간 타이트,
   손그림 동그라미 검정 1곳, 직각(오퍼밴드만 라운드).
8. 영상 골격 — CapCut 실측 28건 기준. 여기서 벗어나지 말 것.
   캔버스 1080x1920 · 총 12~17초 · **8컷** · 컷당 약 1.9초 · 전환 없음(전부 하드컷) · SFX 없음 · BGM 있음.
   자막은 **컷마다 정확히 1개**, 첫 컷 자막이 훅이다.
   서사 4비트를 8컷에 얹는다: 컷1-2 HOOK / 컷3-5 전개 / 컷6-7 페이오프 / 컷8 엔드카드.
   시각 구조는 A·B·C 중 하나 필수 — 원리는 전부 '비교'다:
     A 하단 B&A 삽입(상단 실인물 / 하단 1/3 비포&애프터)
     B 전면 좌우 분할(좌 칙칙 / 우 글래스스킨)
     C PIP 삽입(큰 얼굴 위 작은 창)
     D 구조 없음 — 리스티클 등 예외에만.
   모션 컷에서 제품 라벨 클로즈업 금지(AI 가 글자를 뭉갠다) — 정확한 라벨은 컷8 엔드카드 실제 제품컷에만.
10. ⛔ 광고 소재에 오피셜 KPI(댓글 100개 유도)를 적용하지 말 것 — 실측 4%. 댓글 문장은 캡션용으로만 낸다.
9. 트렌드 차용 시: 원본 영상·오디오·대사·얼굴을 1:1 복제하지 않는다. 구조·타이밍·전환만 차용하고
   문장은 전부 새로 쓴다.
`.trim();

const SCHEMA_HINT = `
반드시 아래 JSON 하나만 출력한다. 설명·코드펜스 금지.
영상 과제면 cuts 를 **정확히 8개** 채운다(sec 합계 12~17초). 정적 이미지 과제면 cuts 는 빈 배열, structure/bgm 은 null.
{
  "editPattern": "레이아웃 레시피 한 줄. 예: 볼·코 매크로 split + 하단 훅 + 채점서클(4주) + 배지2",
  "claim": "핵심클레임 — 화면에 실제로 박히는 문장들을 ' / ' 로 이어서",
  "hookKr": "0-3초 한국어 훅 한 줄",
  "hookUs": "0-3초 영어 훅 한 줄",
  "curiosity": "이 훅이 여는 궁금증 갭이 무엇인지 한 줄",
  "momentum": "대세감 장치 한 줄",
  "comment": "댓글 가르기 문장",
  "save": "저장 유도 문장",
  "share": "공유 트리거 문장",
  "beats": ["0-3s …", "3-8s …", "8-12s …", "12-15s 엔드카드 …"],
  "structure": "A | B | C | D 중 하나 (영상만)",
  "bgm": "BGM 무드 한 줄 — 생성음/로열티프리 전제 (영상만)",
  "cuts": [
    { "n": 1, "sec": 1.9, "shot": "이 컷에서 화면에 무엇이 보이는지 (앵글·인물·동작)", "sub": "이 컷의 자막 1줄" }
  ],
  "captions": ["자막으로 burn-in 할 문장들", "AI 연출 표기 포함"],
  "visualPrompt": "Higgsfield 용 영문 생성 프롬프트 (인물·조명·앵글·질감. 라벨 클로즈업 금지)",
  "complianceNote": "이 소재에서 특히 조심할 것 한 줄"
}
`.trim();

function buildPrompt(slot, market) {
  const mk = market === 'kr' ? '한국(자사몰·올리브영)' : '미국(아마존·TikTok Shop·DTC)';
  const lane = LANES[slot.lane] || LANES.c;
  const lines = [
    RULES, '',
    `[브랜드] MILLIMILLI(밀리밀리) — 500달톤 프로틴 뷰티. 무드는 흑백, 컬러 액센트 없음.`,
    `[시장] ${mk}`,
    `[제품] ${slot.product || 'MIST'} (MST=미스트 / AMP=앰플 / SET=세트)`,
    `[레인] ${lane.label} — ${lane.note}`,
    `[소재코드] ${slot.assetCode || '(미발급)'}  ← Meta 광고 이름에 그대로 들어간다`,
  ];

  if (slot.track === 'trend') {
    lines.push(
      `[과제] 트렌드 모방. 아래 레퍼런스의 **구조만** 해부해서 밀리밀리 소재로 변환한다.`,
      `  레퍼런스: ${slot.sourceUrl || '(URL 없음 — 아래 훅 카드 기반)'}`,
      slot.adaptedFrom ? `  훅 카드: 앵글 ${slot.adaptedFrom.angle} / 훅 ${slot.adaptedFrom.hookType} / 레버 ${slot.adaptedFrom.lever}` : '',
      `  ⛔ 레퍼런스의 문장·대사·오디오를 그대로 쓰지 말 것. 훅은 100% 새로 쓴다.`,
    );
  } else if (slot.track === 'format') {
    lines.push(
      `[과제] 고정 유형 "${slot.title}" 로 신규 1건.`,
      `  앵글 ${AXES.angle[slot.angle] || slot.angle} / 훅타입 ${AXES.hook[slot.hook] || slot.hook} / 레버 ${slot.lever}`,
      slot.beats?.length ? `  기준 비트: ${slot.beats.join(' → ')}` : '',
      slot.hookPatterns?.length ? `  훅 패턴(틀만 참고, 문장은 새로): ${slot.hookPatterns.join(' / ')}` : '',
      `  선정 근거: ${slot.why}`,
    );
  } else {
    lines.push(
      `[과제] 정적 이미지 소재 1건 (1080×1350 4:5).`,
      `  대카 ${slot.concept} / 소카 ${slot.shot} — ${slot.title}`,
      `  선정 근거: ${slot.why} · ${slot.note}`,
      `  비트 대신 레이아웃 슬롯으로 쓴다: 아이브로우 / 헤드라인 / 서브 / 변형영역 / 오퍼밴드`,
    );
  }

  lines.push('', SCHEMA_HINT);
  return lines.filter(Boolean).join('\n');
}

async function callGemini(prompt) {
  const key = GEMINI_KEY();
  if (!key) throw new Error('GEMINI_API_KEY 없음 — Vercel 환경변수에 추가 필요');
  const model = await geminiModel();
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, responseMimeType: 'application/json', maxOutputTokens: 2048 },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${j?.error?.message || 'unknown'}`);
  const text = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  if (!text) throw new Error('Gemini 빈 응답');
  return { model, data: JSON.parse(text) };
}

// Claude 폴백 — 카피는 Gemini 담당이지만 죽었을 때 오늘 작업이 멈추면 안 된다.
async function callClaude(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY 없음');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      messages: [{ role: 'user', content: `${prompt}\n\nJSON 만 출력.` }],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Claude ${r.status}: ${j?.error?.message || 'unknown'}`);
  const text = (j.content || []).map(b => b.text || '').join('');
  return { model: j.model, data: JSON.parse(text.replace(/^```(json)?|```$/g, '').trim()) };
}

// ── KPI 게이트 — LLM 이 규칙을 빠뜨렸는지 코드가 다시 검사한다 ──
// 프롬프트에 썼다고 지켜지지 않는다. 통과 못하면 화면에 빨간 딱지가 붙는다.
const BANNED = [/주름\s*(제거|없애|개선)/, /리프팅\s*효과/, /시술\s*(급|수준|대체)/, /필러\s*(효과|대체)/, /100%/, /완벽하?게?\s*제거/];
export function gateBlueprint(b, slot) {
  const fails = [];
  const text = [b.hookKr, b.hookUs, b.claim, ...(b.captions || [])].filter(Boolean).join(' ');
  if (!b.curiosity || String(b.curiosity).length < 5) fails.push('궁금증 갭 없음');
  if (!b.momentum || String(b.momentum).length < 5) fails.push('대세감 장치 없음');
  const triggers = ['comment', 'save', 'share'].filter(k => b[k] && String(b[k]).length > 3);
  if (triggers.length < 2) fails.push(`댓글·저장·공유 트리거 ${triggers.length}개 (2개 이상 필요)`);
  for (const re of BANNED) if (re.test(text)) fails.push(`컴플라이언스 위반 표현: ${re.source}`);
  if (slot?.lane && LANES[slot.lane]?.disclose) {
    const has = (b.captions || []).some(c => /AI\s*(연출|generated|생성)/i.test(String(c)));
    if (!has) fails.push('AI 연출 표기 누락 (자막 항목에 필수)');
  }
  if (slot?.track !== 'image') {
    // 영상 골격 — CapCut 실측 범위를 벗어나면 담당자가 그대로 못 쓴다.
    const cuts = Array.isArray(b.cuts) ? b.cuts : [];
    if ((b.beats || []).length < 4) fails.push('4비트 서사 미충족');
    if (cuts.length < 6) fails.push(`컷 ${cuts.length}개 (8컷 기준, 최소 6)`);
    const total = cuts.reduce((s2, c) => s2 + (Number(c.sec) || 0), 0);
    if (cuts.length && (total < 6.8 || total > 19.5)) fails.push(`총 ${total.toFixed(1)}초 — 실측 범위 6.8~19.5초 밖`);
    const noSub = cuts.filter(c => !c.sub || !String(c.sub).trim()).length;
    if (noSub) fails.push(`자막 없는 컷 ${noSub}개 (컷마다 1개 필수)`);
    if (!['A', 'B', 'C', 'D'].includes(String(b.structure || '').trim()[0])) fails.push('시각 구조 A/B/C/D 미지정');
  }
  return { pass: fails.length === 0, fails };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const slot = body.slot;
    if (!slot?.track) return res.status(400).json({ error: 'slot 필요' });
    const market = body.market === 'kr' ? 'kr' : 'us';

    const prompt = buildPrompt(slot, market);
    let out, engine = 'gemini';
    try {
      out = await callGemini(prompt);
    } catch (e) {
      try { out = await callClaude(prompt); engine = 'claude(폴백)'; }
      catch (e2) {
        return res.status(502).json({ error: '카피 생성 실패', gemini: String(e.message), claude: String(e2.message) });
      }
    }

    const gate = gateBlueprint(out.data, slot);
    return res.status(200).json({
      status: 'ok', engine, model: out.model, slotId: slot.id,
      blueprint: out.data, gate,
      // 비주얼은 여기서 생성하지 않는다 — 승인된 블루프린트만 Higgsfield 로 넘긴다.
      visual: { router: 'higgsfield', models: ['nano_banana_pro', 'gpt_image_2', 'seedream'],
                note: 'OPENAI_API_KEY 없이 gpt_image_2 는 Higgsfield 경유로만 사용' },
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}

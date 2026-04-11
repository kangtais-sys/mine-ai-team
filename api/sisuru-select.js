import { Redis } from '@upstash/redis';
export const config = { maxDuration: 300 };
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const PROFILE_ID = process.env.SISURU_PROFILE_ID || '69d8a52731c2441246bef194';
const IG_ACCOUNT = process.env.SISURU_IG_ACCOUNT_ID || '69d8a6257dea335c2bd101f6';
const TT_ACCOUNT = process.env.SISURU_TT_ACCOUNT_ID || '69d8a5c27dea335c2bd100ad';
const BB_TEMPLATES = { 1:'1oMJnB5r9QRMZl2wqL', 2:'lzw71BD6ExN950eYkn', 3:'2j8dyQZWNGklb7A9Lm', 4:'lzw71BD6Exzw50eYkn', 5:'lzw71BD6ExYg50eYkn', 6:'l9E7G65ko0XY5PLe3R', 7:'vz9ByYbNVYQ0bRGXrw' };

const CLAUDE_HEADERS = {
  'Content-Type': 'application/json',
  'x-api-key': process.env.ANTHROPIC_API_KEY,
  'anthropic-version': '2023-06-01',
};

// ─── STEP 2: 웹 리서치 (Claude + web_search) ───
async function researchTopic(topic) {
  const title = topic.title || '';
  const cat = topic.category || '';
  const isSisul = /시술|성형|보톡스|필러|레이저|리프팅|물광|주사|피부과/.test(cat + title);
  const isTrend = /트렌드|바이럴|핫|화제|난리/.test(cat + title);

  let researchGuide;
  if (isSisul) {
    researchGuide = `[시술 카테고리] 조사 항목:
1. 시술 정식 명칭
2. 강남 피부과 평균 가격대 (강남언니/바비톡/실제 후기 기준)
3. 시술 원리 1~2문장
4. 실제 후기 요약 (효과 + 부작용 포함)
5. 대체 가능한 홈케어 방법
6. 비교할 만한 다른 시술 2~3개 (이름+가격대)
7. 지속 기간, 시술 시간, 다운타임`;
  } else if (isTrend) {
    researchGuide = `[트렌드 카테고리] 조사 항목:
1. 실제로 바이럴 된 경위 (어떤 계정/영상/커뮤니티에서 시작?)
2. 관련 실제 제품명 또는 방법명
3. 실제 효과 또는 사용 후기
4. 가격 정보
5. 주의사항이나 부작용`;
  } else {
    researchGuide = `[제품 카테고리] 조사 항목:
1. 실제 제품명 (브랜드명 포함, 예: '다이소 닥터자르트 시카페어 크림')
2. 실제 판매 가격 (다이소/올리브영/쿠팡 등 채널별)
3. 주요 성분 2~3개
4. 실제 리뷰 요약 (글로우픽/올리브영 평점, 한줄평 3~5개)
5. 경쟁 제품 2~3개 (이름+가격)
6. 장단점 솔직 정리`;
  }

  const prompt = `"${title}" 관련 실제 정보를 웹에서 조사해줘.
${topic.summary ? `맥락: ${topic.summary}` : ''}
${topic.research_keywords ? `검색 키워드 힌트: ${topic.research_keywords}` : ''}
${topic.hook ? `후킹: ${topic.hook}` : ''}

${researchGuide}

검색 전략:
- 한국어로 검색: "${title}", "${title} 후기", "${title} 가격"
- 올리브영/글로우픽/에누리/강남언니 등에서 실제 제품/시술 검색
- 뉴스 기사도 참고 (트렌드 맥락 파악)
- 하나의 검색어로 안 나오면 다른 키워드로 재검색

반드시 웹 검색을 여러 번 해서 실제 데이터를 찾아줘. 추측하지 말고 실제 검색 결과 기반으로.
구체적 제품 정보를 못 찾으면 items를 빈 배열 []로 두고, additionalContext에 찾은 맥락 정보를 상세히 적어줘.

JSON으로 응답:
{
  "researched": true,
  "topicCategory": "제품/시술/트렌드",
  "items": [
    {
      "name": "실제 제품명 또는 시술명",
      "brand": "브랜드 (있다면)",
      "price": "실제 가격",
      "mainIngredients": ["성분1", "성분2"],
      "actualEffects": "실제 효과 1~2문장",
      "realReviews": "실제 후기 요약 1~2문장",
      "pros": "장점",
      "cons": "단점/부작용",
      "rating": "평점 (있다면)"
    }
  ],
  "competitors": [{"name": "경쟁제품/시술", "price": "가격"}],
  "sourceUrls": ["참고한 URL"],
  "additionalContext": "추가 맥락 (바이럴 경위, 트렌드 배경 등)"
}`;

  try {
    console.log(`[Research] 웹 리서치 시작: "${title}"`);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { ...CLAUDE_HEADERS, 'anthropic-beta': 'web-search-2025-03-05' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await r.json();

    // Extract text from all text blocks
    const textBlocks = (data.content || []).filter(b => b.type === 'text');
    const text = textBlocks.map(b => b.text).join('\n');

    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const research = JSON.parse(match[0]);
      // items가 전부 "확인 불가"면 리서치 실패 처리
      const hasRealData = (research.items || []).some(item =>
        item.name && item.name !== '확인 불가' && item.price && item.price !== '확인 불가'
      );
      if (!hasRealData && research.additionalContext) {
        console.log(`[Research] 구체적 제품 정보 없음 → 맥락 정보로 전환`);
        research.researched = true; // additionalContext는 있으니 true 유지
        research.items = []; // 빈 items로 교체 (확인 불가 제거)
      }
      console.log(`[Research] 완료: ${research.items?.length || 0}개 항목, sources: ${research.sourceUrls?.length || 0}, context: ${(research.additionalContext || '').substring(0, 80)}`);
      return research;
    }
    console.warn('[Research] JSON 파싱 실패, 원본 텍스트 사용');
    return { researched: true, items: [], additionalContext: text.substring(0, 2000), sourceUrls: [] };
  } catch (e) {
    console.error('[Research] Error:', e.message);
    return { researched: false, items: [], additionalContext: topic.summary || title };
  }
}

// ─── STEP 3: 리서치 기반 카드뉴스 기획 ───
async function planSlides(topic, researchData, retryFeedback) {
  const hasItems = researchData?.items?.length > 0;
  const hasContext = !!(researchData?.additionalContext || researchData?.competitors?.length);

  let researchBlock;
  if (hasItems) {
    // 리서치 데이터가 너무 크면 요약 (sourceUrls, 불필요 필드 제거)
    const trimmed = { ...researchData, sourceUrls: (researchData.sourceUrls || []).slice(0, 2) };
    researchBlock = JSON.stringify(trimmed, null, 2);
    if (researchBlock.length > 3000) {
      // items만 핵심 필드로 축약
      const shortItems = researchData.items.map(i => ({ name: i.name, price: i.price, effects: i.actualEffects, reviews: i.realReviews, cons: i.cons }));
      researchBlock = JSON.stringify({ items: shortItems, competitors: researchData.competitors?.slice(0, 3), context: (researchData.additionalContext || '').substring(0, 500) }, null, 2);
    }
  } else if (hasContext) {
    researchBlock = `(구체적 제품 정보는 확인 불가. 아래 맥락 정보 활용)\n맥락: ${researchData.additionalContext || ''}\n경쟁 제품: ${JSON.stringify(researchData.competitors || [])}\n출처: ${(researchData.sourceUrls || []).join(', ')}`;
  } else {
    researchBlock = `(웹 리서치 실패. 주제: "${topic.title}", 요약: ${topic.summary || '없음'}\n주제에 맞는 일반적인 정보로 기획하되, 가격/제품명은 "확인 필요"로 표시)`;
  }

  const retryNote = retryFeedback
    ? `\n\n⚠️ 이전 기획 피드백: ${retryFeedback}\n더 강한 후킹으로 재기획해줘!`
    : '';

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: CLAUDE_HEADERS,
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514', max_tokens: 8000, temperature: 0.9,
      messages: [{ role: 'user', content: `시수르더쿠 7장 카드뉴스. 주제: "${topic.title}"
${retryNote}

## 조사된 실제 정보
${researchBlock}

## 규칙
캐릭터: 1년에 1억 쓰는 뷰티 중독자 언니. 내돈내산 말투. 광고티 ❌. 밀리밀리 언급 ❌.
금지어: 추천합니다/효과적인/놀라운/완벽한/최고의/도움이 됩니다/좋은 제품/사용해보세요
⚠️ 조사된 실제 정보만 사용! 지어내지 마! 모르면 "확인 필요"로 표시.

title: 최대 20자, 14자 넘으면 \\n 줄바꿈, 이모지 1개, 실제 숫자/가격 임팩트
subtitle: 15자 이내, 이모지 1개, 빈 문자열 금지!
body: 3~4줄, 2줄마다 \\n\\n, 이모지 1~2개, 짧고 임팩트

## 7장 구성
1장: 후킹 (가격 충격/반전/소외감, 실제 숫자 필수). subtitle=매력적 부제. body=""
2장: 후킹 심화 (1장 키워드 반드시 포함! 의문→궁금). subtitle=1장 이어가기. body=""
3장: BEST 1 🥇 (실제 제품명, 실제 가격+후기). subtitle=소제목
4장: BEST 2 🥈 (실제 제품명, 실제 가격+후기). subtitle=소제목
5장: BEST 3 🥉 (실제 제품명, 실제 가격+후기). subtitle=소제목
6장: 결론 💡 (핵심 한 줄 + 실제 결론). subtitle=소제목
7장: CTA 고정 (5패턴 중 랜덤 택1). subtitle="궁금하면"
  ①"더 솔직한 거\\n알고 싶어?"|"팔로우하면 매일 올려\\n궁금한 거 댓글에 👇"
  ②"1년에 1억 쓴\\n사람 얘기"|"듣고 싶으면 팔로우\\nDM으로 더 알려줄게 👀"
  ③"이건 저장해둬"|"나중에 또 볼 거잖아\\n저장 📌 팔로우 🔔"
  ④"다음엔 뭐\\n알려줄까?"|"댓글에 주제 적어줘\\n만들어줄게 🎯"
  ⑤"친구한테도\\n알려줘"|"나만 알기 아깝잖아\\n공유하고 같이 예뻐지자 💕"

이미지: image_keyword=한국어 필수, imageContext=핀터레스트 분위기 묘사
image_source: pinterest(기본), daiso, oliveyoung, 고정(7장)

캡션 - IG: 충격 첫 줄 + 본문 3~5줄 + CTA + 해시태그 5~10개
캡션 - TT: 후킹 60자 + 해시태그 5~7개

후킹 점수 (1~10): 숫자있나(+3), 결말 예측불가(+2), 태그하고싶나(+3), 금지어없나(+2)

JSON만 응답 (다른 텍스트 없이):
{"category":"카테고리","hookingScores":{"1":8,"2":7,"3":7,"4":7,"5":7,"6":7},"slides":[{"slide":1,"subtitle":"","title":"","body":"","image_source":"pinterest","image_keyword":"","imageContext":""},...],"instagram_caption":"","tiktok_caption":""}` }],
    }),
  });
  const d = await r.json();
  if (d.error) { console.error('[Plan] Claude API error:', JSON.stringify(d.error)); return null; }
  if (!d.content?.length) { console.error('[Plan] No content:', JSON.stringify(d).substring(0, 500)); return null; }

  const allText = d.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  console.log(`[Plan] Response: ${d.content.length} blocks, stop=${d.stop_reason}, text=${allText.length}chars`);
  if (!allText) { console.error('[Plan] No text blocks:', d.content.map(b => b.type)); return null; }

  const m = allText.match(/\{[\s\S]*\}/);
  if (!m) { console.error('[Plan] JSON not found:', allText.substring(0, 500)); return null; }

  let raw = m[0];
  // max_tokens로 잘린 JSON 복구 시도
  if (d.stop_reason === 'max_tokens') {
    console.warn('[Plan] max_tokens로 잘림 → JSON 복구 시도');
    // 닫히지 않은 brackets/braces 추가
    let opens = 0, inStr = false, escape = false;
    for (const c of raw) {
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{' || c === '[') opens++;
      if (c === '}' || c === ']') opens--;
    }
    // 마지막 완전한 항목까지만 자르기
    if (opens > 0) {
      // 마지막 완전한 slide 객체 이후 자르기
      const lastComplete = raw.lastIndexOf('}');
      if (lastComplete > 0) raw = raw.substring(0, lastComplete + 1);
      // 누락된 닫기 추가
      if (!raw.includes('"instagram_caption"')) raw += ',"instagram_caption":"(잘림)","tiktok_caption":"(잘림)"';
      while (opens-- > 0) raw += raw.includes('"slides"') ? '}' : ']';
    }
  }

  try {
    const plan = JSON.parse(raw);
    if (!plan.slides?.length) { console.error('[Plan] slides 누락:', Object.keys(plan)); return null; }
    console.log(`[Plan] 기획 완료: ${plan.slides.length}장, IG=${!!plan.instagram_caption}, TT=${!!plan.tiktok_caption}`);
    return plan;
  } catch (e) {
    console.error('[Plan] JSON parse error:', e.message, '\nRaw:', raw.substring(0, 500));
    return null;
  }
}

// ─── STEP 5: 후킹 강도 체크 + 재생성 ───
async function checkAndRetryPlan(topic, researchData, plan, attempt) {
  if (!plan?.hookingScores) return plan;
  const slide1Score = plan.hookingScores['1'] || 0;

  if (slide1Score >= 7 || attempt >= 2) {
    if (slide1Score < 7) console.warn(`[Hooking] 1장 점수 ${slide1Score}/10 — 재생성 한도 초과, 그대로 사용`);
    else console.log(`[Hooking] 1장 점수 ${slide1Score}/10 ✓`);
    return plan;
  }

  console.log(`[Hooking] 1장 점수 ${slide1Score}/10 — 재생성 (시도 ${attempt + 1}/2)`);
  const feedback = `이전 1장 제목 "${plan.slides?.[0]?.title}"의 후킹이 약함(${slide1Score}점). 더 강한 숫자/가격 충격, 의외성, 소외감 자극 필요. 결말이 예측 안 되게!`;
  const newPlan = await planSlides(topic, researchData, feedback);
  if (!newPlan) return plan;
  return checkAndRetryPlan(topic, researchData, newPlan, attempt + 1);
}

// ─── 이미지 생성 (Pinterest 지능형 → Imagen fallback) ───
async function generateSlideImage(slide, category, topic) {
  if (slide.image_source === '고정') return null;

  const { getImageUrl } = await import('./utils/screenshot.js');

  if (slide.image_keyword) {
    const url = await getImageUrl(slide.image_source || 'pinterest', slide.image_keyword, {
      category: category || '트렌드',
      topic: topic || slide.image_keyword,
      slideNum: slide.slide,
      title: slide.title,
      imageContext: slide.imageContext,
    });
    if (url) { console.log(`[Img] Slide ${slide.slide}: ${slide.image_source} OK`); return url; }
  }

  // Gemini Imagen fallback
  if (process.env.GEMINI_API_KEY && slide.image_keyword) {
    try {
      const prompt = `${slide.image_keyword}. photorealistic, korean beauty, real photo, not illustration, no digital art, no render`;
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: '1:1' } }),
      });
      const d = await r.json();
      const b64 = d.predictions?.[0]?.bytesBase64Encoded;
      if (b64 && process.env.ZERNIO_API_KEY) {
        const formData = new FormData();
        formData.append('files', new Blob([Buffer.from(b64, 'base64')], { type: 'image/png' }), 'bg.png');
        const u = await fetch('https://zernio.com/api/v1/media', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` }, body: formData });
        const url = (await u.json()).files?.[0]?.url;
        if (url) { console.log(`[Img] Slide ${slide.slide}: imagen fallback OK`); return url; }
      }
    } catch {}
  }

  console.warn(`[Img] Slide ${slide.slide}: all failed`);
  return null;
}

// ─── Bannerbear ───
async function generateBannerbearImage(slideNum, slide, bgImageUrl) {
  const uid = BB_TEMPLATES[slideNum];
  if (!uid) return null;
  const mods = [
    slide.title?.trim() && { name: 'title', text: slide.title.trim() },
    slide.subtitle?.trim() && { name: 'subtitle', text: slide.subtitle.trim() },
    slide.body?.trim() && { name: 'body', text: slide.body.trim() },
    bgImageUrl && { name: 'bg_image', image_url: bgImageUrl },
  ].filter(Boolean);
  try {
    const r = await fetch('https://sync.api.bannerbear.com/v2/images', {
      method: 'POST', headers: { 'Authorization': `Bearer ${process.env.BANNERBEAR_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: uid, modifications: mods }),
    });
    const d = await r.json();
    if (d.image_url) return d.image_url;
    console.error(`[BB] ${slideNum}:`, d.message || d.error);
    return null;
  } catch (e) { console.error(`[BB] ${slideNum}:`, e.message); return null; }
}

// ─── Zernio ───
async function publishToZernio(plan, imageUrls, topicSource) {
  let ig = plan.instagram_caption || '';
  if (topicSource && !ig.includes('출처')) ig += `\n\n출처: ${topicSource}`;
  const body = {
    profileId: PROFILE_ID,
    platforms: [
      { platform: 'instagram', accountId: IG_ACCOUNT, platformSpecificData: { caption: ig } },
      { platform: 'tiktok', accountId: TT_ACCOUNT, platformSpecificData: { caption: plan.tiktok_caption } },
    ],
    content: ig.substring(0, 2200),
    status: 'scheduled',
    scheduledFor: new Date(Date.now() + 3 * 3600000).toISOString(),
  };
  if (imageUrls?.length > 0) body.mediaItems = imageUrls.map((url, i) => ({ type: 'image', url, filename: `s${i + 1}.jpg` }));
  const r = await fetch('https://zernio.com/api/v1/posts', {
    method: 'POST', headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

// ─── Handler ───
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const [proposals, selected, draft, research] = await Promise.all([
      redis.get('sisuru:proposals'), redis.get('sisuru:selected'), redis.get('sisuru:draft'), redis.get('sisuru:research'),
    ]);
    const parse = v => v ? (typeof v === 'string' ? JSON.parse(v) : v) : null;
    return res.status(200).json({ proposals: parse(proposals), selected: parse(selected), draft: parse(draft), research: parse(research) });
  }

  if (req.method === 'POST') {
    const { id, action } = req.body || {};

    // ── 주제 선택 → 리서치 → 기획 → 후킹체크 ──
    if (id && !action) {
      const proposals = await redis.get('sisuru:proposals');
      const data = proposals ? (typeof proposals === 'string' ? JSON.parse(proposals) : proposals) : null;
      if (!data?.proposals) return res.status(200).json({ error: 'No proposals' });
      const topic = data.proposals.find(p => p.id === Number(id));
      if (!topic) return res.status(400).json({ error: `#${id} not found` });

      await redis.set('sisuru:selected', JSON.stringify({ ...topic, selectedAt: new Date().toISOString() }), { ex: 86400 });

      // STEP 2: 웹 리서치
      const researchData = await researchTopic(topic);
      await redis.set('sisuru:research', JSON.stringify(researchData), { ex: 86400 });

      // STEP 3: 리서치 기반 기획
      let plan;
      try {
        plan = await planSlides(topic, researchData);
      } catch (e) {
        console.error('[Plan] Exception:', e.message);
        return res.status(200).json({ success: false, error: `Planning exception: ${e.message}` });
      }
      if (!plan) return res.status(200).json({ success: false, error: 'Planning failed — check Vercel logs for [Plan] errors' });

      // STEP 5: 후킹 체크 (1장 7점 미만이면 최대 2회 재생성)
      const finalPlan = await checkAndRetryPlan(topic, researchData, plan, 0);
      await redis.set('sisuru:draft', JSON.stringify(finalPlan), { ex: 86400 });

      // 채팅 텍스트 생성
      let chatText = `📋 시수르더쿠 카드뉴스 초안\n주제: ${topic.title}\n`;
      if (researchData?.researched) {
        chatText += `🔍 웹 리서치 완료: ${researchData.items?.length || 0}개 항목 조사됨\n`;
        if (researchData.sourceUrls?.length) chatText += `📎 출처: ${researchData.sourceUrls.slice(0, 3).join(', ')}\n`;
      }
      if (finalPlan.hookingScores) chatText += `🎯 후킹 점수: 1장 ${finalPlan.hookingScores['1'] || '?'}점\n`;
      chatText += '\n';

      for (const s of finalPlan.slides || []) {
        chatText += `━━━ ${s.slide}장 ━━━\n`;
        if (s.subtitle) chatText += `소제목: ${s.subtitle}\n`;
        chatText += `제목: ${s.title}\n`;
        if (s.body) chatText += `본문:\n${s.body}\n`;
        chatText += `이미지: ${s.image_source}${s.image_keyword ? ` → "${s.image_keyword}"` : ''}\n\n`;
      }
      chatText += `━━━ 캡션 ━━━\nIG: ${finalPlan.instagram_caption || '(생성 실패)'}\n\nTT: ${finalPlan.tiktok_caption || '(생성 실패)'}\n\n`;
      chatText += `✏️ 수정할 부분 말씀해주세요. "생성해" 라고 하면 이미지 + 발행합니다.`;

      return res.status(200).json({ success: true, action: 'draft', chatText, plan: finalPlan, research: researchData });
    }

    // ── 생성 ──
    if (action === 'generate') {
      const plan = await redis.get('sisuru:draft').then(d => d ? (typeof d === 'string' ? JSON.parse(d) : d) : null);
      if (!plan?.slides) return res.status(200).json({ error: 'No draft' });

      let slides = plan.slides || [];
      if (slides.length < 7) slides = [...slides, { slide: 7, subtitle: '궁금하면', title: '더 솔직한 거\n알고 싶어?', body: '팔로우하면 매일 올려\n궁금한 거 댓글에 👇', image_source: '고정' }];
      slides = slides.map((s, i) => ({ ...s, slide: s.slide || i + 1 }));

      // 이미지 생성 (병렬)
      const category = plan.category || '트렌드';
      const sel2 = await redis.get('sisuru:selected').then(d => d ? (typeof d === 'string' ? JSON.parse(d) : d) : null);
      const topic = sel2?.title || '';
      console.log(`[Select] Generating images... category=${category}, topic=${topic}`);
      const bgImages = await Promise.all(slides.map(s => generateSlideImage(s, category, topic)));
      console.log(`[Select] BG: ${bgImages.filter(Boolean).length}/${slides.length}`);

      // Bannerbear 7장
      const bbImages = await Promise.all(slides.map((s, i) => generateBannerbearImage(s.slide, s, bgImages[i])));
      const validImages = bbImages.filter(Boolean);
      console.log(`[Select] Cards: ${validImages.length}`);

      // 발행
      const sel = await redis.get('sisuru:selected').then(d => d ? (typeof d === 'string' ? JSON.parse(d) : d) : null);
      const zernio = await publishToZernio(plan, validImages, sel?.source);
      console.log('[Select]', zernio?.post?.status || zernio?.error);

      return res.status(200).json({ success: true, action: 'published', images: validImages.length, zernio: { status: zernio?.post?.status, id: zernio?.post?._id, error: zernio?.error } });
    }

    return res.status(400).json({ error: 'id or action required' });
  }
  return res.status(405).json({ error: 'GET or POST' });
}

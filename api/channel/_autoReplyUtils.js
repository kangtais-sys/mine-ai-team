// 자동응대 공통 유틸 — zernio webhook + inbox cron에서 공유
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ────────────────────────────────────────────────
// 긴급 키워드 — 이 키워드 포함 시 자동응대 대신 승인 큐로
// ────────────────────────────────────────────────
export const URGENT_KEYWORDS = [
  '환불', '불량', '교환', '반품', '환교',
  '부작용', '알레르기', '트러블', '발진', '두드러기',
  '따가', '따끔', '빨개', '붓기', '붓는', '화상', '자극심',
  '최악', '쓰레기', '돈낭비', '사기', '짝퉁', '가짜', '효과없', '별로',
  '고소', '법적', '소비자원', '소비자고발', '신고',
  '기자', '취재', '언론',
];

export function isUrgent(text) {
  const t = (text || '').toLowerCase();
  return URGENT_KEYWORDS.some(k => t.includes(k));
}

// ────────────────────────────────────────────────
// 승인 큐 저장
// ────────────────────────────────────────────────
function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function saveToApprovalQueue(account, item) {
  const queueKey = `channel:approval:queue:${account}`;
  const queueItem = { id: genId(), ...item, queuedAt: new Date().toISOString(), status: 'pending' };
  await redis.lpush(queueKey, JSON.stringify(queueItem));
  await redis.ltrim(queueKey, 0, 49); // 최대 50개
  console.log(`[ApprovalQueue][${account}] 저장: ${queueItem.id} — "${(item.text || '').slice(0, 30)}"`);
  return queueItem;
}

// ────────────────────────────────────────────────
// URL 지식 로드 (프롬프트에 포함)
// ────────────────────────────────────────────────
export async function getUrlKnowledge(account) {
  try {
    const raw = await redis.get(`channel:url-knowledge:${account}`);
    if (!raw) return [];
    const items = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
    return items.slice(0, 5); // 최대 5개만 프롬프트에 포함
  } catch { return []; }
}

export function buildUrlKnowledgeText(urlKnowledge) {
  if (!urlKnowledge || urlKnowledge.length === 0) return '';
  const sections = urlKnowledge.map(item => {
    let summary = '';
    try {
      const parsed = typeof item.summary === 'string' ? JSON.parse(item.summary) : item.summary;
      const parts = [];
      if (parsed.brand) parts.push(`브랜드: ${parsed.brand}`);
      if (Array.isArray(parsed.products) && parsed.products.length > 0) {
        parts.push(`제품: ${parsed.products.slice(0, 5).join(' / ')}`);
      }
      if (parsed.channels) parts.push(`구매처: ${parsed.channels}`);
      if (Array.isArray(parsed.faq) && parsed.faq.length > 0) {
        parts.push(`FAQ: ${parsed.faq.slice(0, 3).join(' | ')}`);
      }
      if (Array.isArray(parsed.keyFacts) && parsed.keyFacts.length > 0) {
        parts.push(parsed.keyFacts.slice(0, 3).join(' / '));
      }
      summary = parts.join('\n');
    } catch {
      summary = String(item.summary || '').slice(0, 300);
    }
    return `[${item.title || item.url}]\n${summary}`;
  });
  return `\n\n[브랜드/제품 학습 지식 — 정확하게 활용]\n${sections.join('\n\n').slice(0, 2000)}`;
}

// ────────────────────────────────────────────────
// 활성 시간대 / 일일 한도 / 쿨다운 (인스타 밴 방지)
// ────────────────────────────────────────────────
export function isActiveHour(settings) {
  const kstHour = new Date(Date.now() + 9 * 3600000).getUTCHours();
  const start = settings.activeHoursStart ?? 9;
  const end   = settings.activeHoursEnd   ?? 23;
  return kstHour >= start && kstHour <= end;
}

export async function checkRateLimit(type, account, settings) {
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const dailyKey    = `channel:rate:daily:${type}:${account}:${today}`;
  const cooldownKey = `channel:rate:cooldown:${type}:${account}`;
  const limit   = type === 'comment' ? (settings.commentDailyLimit ?? 100) : (settings.dmDailyLimit ?? 50);
  const coolMin = type === 'comment' ? (settings.commentCooldownMin ?? 1)   : (settings.dmCooldownMin ?? 2);

  const [daily, cooldown] = await Promise.all([
    redis.get(dailyKey),
    redis.get(cooldownKey),
  ]);
  if (cooldown) return { blocked: true, reason: `쿨다운 (${coolMin}분)` };
  if (Number(daily || 0) >= limit) return { blocked: true, reason: `일일 한도 초과 (${limit}건)` };
  return { blocked: false };
}

export async function recordUsage(type, account, settings) {
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const dailyKey    = `channel:rate:daily:${type}:${account}:${today}`;
  const cooldownKey = `channel:rate:cooldown:${type}:${account}`;
  const coolMin = type === 'comment' ? (settings.commentCooldownMin ?? 1) : (settings.dmCooldownMin ?? 2);
  await Promise.all([
    redis.incr(dailyKey),
    redis.expire(dailyKey, 86400),
    redis.set(cooldownKey, 1, { ex: coolMin * 60 }),
  ]);
}

// ────────────────────────────────────────────────
// Redis helpers
// ────────────────────────────────────────────────
export async function getSettings(account) {
  try {
    const s = await redis.get(`channel:settings:${account}`);
    return s || { autoComment: false, autoDm: false };
  } catch { return { autoComment: false, autoDm: false }; }
}

export async function getEnabledRules(account) {
  try {
    const raw = await redis.get('channel:rules');
    const rules = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
    // 계정 라벨 정규화 (한글/영어 모두 처리)
    const LABEL_MAP = { '유민혜': 'yuminhye', '밀리밀리': 'millimilli', '전체': 'all' };
    return rules
      .filter(r => {
        if (!r.enabled) return false;
        const a = LABEL_MAP[r.account] || r.account || 'all';
        return a === account || a === 'all';
      })
      .map(r => r.text);
  } catch { return []; }
}

export async function getLearnedPersona(account) {
  try { return await redis.get(`channel:persona:${account}`); }
  catch { return null; }
}

export async function logAction(type, account, data) {
  const logKey = `channel:auto:${type}:logs:${account}`;
  const countKey = `channel:auto:count:${type}:${account}`;
  try {
    await Promise.all([
      redis.lpush(logKey, JSON.stringify({ ...data, timestamp: new Date().toISOString() })),
      redis.ltrim(logKey, 0, 199),
      redis.incr(countKey),
    ]);
  } catch {}
}

// ────────────────────────────────────────────────
// 프롬프트 빌더 — URL 지식 포함
// ────────────────────────────────────────────────
const OY_KEYWORDS = ['올영세일', '올리브영세일', '올영 세일'];

export function buildPrompt(account, text, extraRules = [], learned = null, urlKnowledge = []) {
  const rulesText = extraRules.length > 0
    ? `\n\n[컨텍스트 규칙 — 반드시 준수]\n${extraRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';
  const learnedText = learned?.learned
    ? `\n\n[학습된 채널 특성]\n- 주요 주제: ${(learned.learned.mainTopics || []).join(', ')}\n- 말투: ${learned.learned.toneInsights || ''}\n- 참여 유발: ${(learned.learned.commentTriggers || []).join(', ')}`
    : '';
  // 답변 이력 기반 학습 스타일 추가
  const replyStyleText = learned?.learnedReplies?.learnedStyle
    ? `\n\n[실제 응대 이력에서 학습한 말투·스타일 — 최우선 반영]\n${learned.learnedReplies.learnedStyle}${learned.learnedReplies.commonPhrases?.length ? `\n자주 쓰는 표현: ${learned.learnedReplies.commonPhrases.join(', ')}` : ''}${learned.learnedReplies.emojiPattern ? `\n이모지 패턴: ${learned.learnedReplies.emojiPattern}` : ''}`
    : '';
  const urlText = buildUrlKnowledgeText(urlKnowledge);

  if (account === 'yuminhye') {
    return `당신은 인플루언서 유민혜(@lala_lounge_)입니다. 절대 밀리밀리 브랜드 계정처럼 응대하면 안 됩니다.
팔로워에게 친근한 언니처럼 댓글/DM을 답니다.
이모지 1-2개, 1-2문장. 악성/스팸이면 SKIP만 반환.
말투: 반말 또는 가벼운 존댓말, 친근하고 따뜻하게.
칭찬/공감 → 진심 어린 리액션. 뷰티/스킨케어 질문 → 개인적인 경험 공유.
개인 연락 요청/광고 → SKIP.${replyStyleText}${learnedText}${urlText}${rulesText}`;
  }

  const isOYSale = OY_KEYWORDS.some(k => (text || '').includes(k));
  return `당신은 밀리밀리(MILLIMILLI) 500달톤 K뷰티 브랜드 SNS 담당자입니다. 절대 개인 인플루언서처럼 응대하면 안 됩니다.
이모지 1-2개, 2문장 이내. 가격 직접 언급 금지. 악성/스팸이면 SKIP만 반환.
일본어→일본어 / 영어→영어로 답변.
제품/성분 문의 → 아는 범위에서 답변 + "카카오채널 @밀리밀리에서 자세히 안내드릴게요 🫶"
칭찬 → 진심 어린 감사.
${isOYSale ? '올영세일 기간! 올리브영에서 구매 적극 추천.' : '구매: 1) 자사몰 millimilli.official (혜택 최고) 2) 스마트스토어 3) 올리브영.'}${replyStyleText}${learnedText}${urlText}${rulesText}`;
}

// ────────────────────────────────────────────────
// Claude API 호출
// ────────────────────────────────────────────────
export async function callClaude(systemPrompt, userText, maxTokens = 150) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userText }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || '';
}

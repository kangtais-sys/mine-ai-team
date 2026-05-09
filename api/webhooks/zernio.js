import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ZERNIO = 'https://zernio.com/api/v1';
const zFetch = (path, opts = {}) =>
  fetch(`${ZERNIO}${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  }).then(r => r.json());

// ────────────────────────────────────────────────
// Zernio 프로필 ID → 우리 계정 키 매핑 (가장 신뢰도 높음)
// ────────────────────────────────────────────────
const PROFILE_TO_ACCOUNT = {
  '69d08807986d57bb8f72f7e6': 'yuminhye',   // lala_lounge_, peerstory, 15초유민혜
  '69d08cc1986d57bb8f733102': 'millimilli',  // millimilli.kr, millimilli-l4j
};

// accountUsername 보조 매핑 (profileId 없을 때 폴백)
const YUMINHYE_HANDLES = new Set(['lala_lounge_', 'yuminhye', 'peerstory', '15초유민혜', '0.8l_yuminhye']);
const MILLIMILLI_HANDLES = new Set(['millimilli.kr', 'millimilli-l4j', 'millimilli.official', 'millimilli_official', 'millimilli']);

function detectAccount(profileId, accountUsername) {
  // 1순위: profileId
  if (profileId && PROFILE_TO_ACCOUNT[profileId]) return PROFILE_TO_ACCOUNT[profileId];
  // 2순위: accountUsername
  if (accountUsername) {
    const u = accountUsername.toLowerCase();
    if (YUMINHYE_HANDLES.has(u)) return 'yuminhye';
    if (MILLIMILLI_HANDLES.has(u)) return 'millimilli';
  }
  return null;
}

// ────────────────────────────────────────────────
// Redis helpers
// ────────────────────────────────────────────────
async function getSettings(account) {
  try {
    const s = await redis.get(`channel:settings:${account}`);
    return s || { autoComment: false, autoDm: false };
  } catch { return { autoComment: false, autoDm: false }; }
}

async function getEnabledRules(account) {
  try {
    const raw = await redis.get('channel:rules');
    const rules = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
    return rules
      .filter(r => r.enabled && (r.account === account || r.account === 'all'))
      .map(r => r.text);
  } catch { return []; }
}

async function getLearnedPersona(account) {
  try { return await redis.get(`channel:persona:${account}`); }
  catch { return null; }
}

async function logAction(type, account, data) {
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
// 프롬프트 — 계정별 완전 분리
// ────────────────────────────────────────────────
const OY_KEYWORDS = ['올영세일', '올리브영세일', '올영 세일'];

function buildPrompt(account, text, extraRules = [], learned = null) {
  const rulesText = extraRules.length > 0
    ? `\n\n[컨텍스트 규칙 — 반드시 준수]\n${extraRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';
  const learnedText = learned?.learned
    ? `\n\n[학습된 채널 특성]\n- 주요 주제: ${(learned.learned.mainTopics || []).join(', ')}\n- 말투: ${learned.learned.toneInsights || ''}`
    : '';

  if (account === 'yuminhye') {
    return `당신은 인플루언서 유민혜(@lala_lounge_)입니다. 절대 밀리밀리 브랜드 계정처럼 응대하면 안 됩니다.
팔로워에게 친근한 언니처럼 댓글/DM을 답니다.
이모지 1-2개, 1-2문장. 악성/스팸이면 SKIP만 반환.
말투: 반말 또는 가벼운 존댓말, 친근하고 따뜻하게.
칭찬/공감 → 진심 어린 리액션.
뷰티/스킨케어 질문 → 개인적인 경험 공유하듯 답변.
개인 연락 요청/광고 → SKIP.${learnedText}${rulesText}`;
  }

  const isOYSale = OY_KEYWORDS.some(k => (text || '').includes(k));
  return `당신은 밀리밀리(MILLIMILLI) 500달톤 K뷰티 브랜드 SNS 담당자입니다. 절대 개인 인플루언서처럼 응대하면 안 됩니다.
이모지 1-2개, 2문장 이내. 가격 직접 언급 금지. 악성/스팸이면 SKIP만 반환.
일본어 → 일본어 / 영어 → 영어로 답변.
제품/성분 문의 → 간단 답변 + "카카오채널 @밀리밀리에서 자세히 안내드릴게요 🫶"
칭찬 → 진심 어린 감사.
${isOYSale ? '올영세일 기간! 올리브영에서 구매 적극 추천.' : '구매: 1) 자사몰 millimilli.official (혜택 최고) 2) 스마트스토어 3) 올리브영.'}${learnedText}${rulesText}`;
}

// ────────────────────────────────────────────────
// Claude 호출
// ────────────────────────────────────────────────
async function callClaude(systemPrompt, userText) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-20250514',
      max_tokens: 150,
      system: systemPrompt,
      messages: [{ role: 'user', content: userText }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || '';
}

// ────────────────────────────────────────────────
// 실제 응대 실행
// ────────────────────────────────────────────────
async function processComment(commentId, text, account, authorUsername) {
  // 중복 방지 (24h)
  const dupeKey = `zernio:replied:comment:${commentId}`;
  if (await redis.get(dupeKey)) return { skipped: true, reason: 'duplicate' };
  await redis.set(dupeKey, true, { ex: 86400 });

  const [extraRules, learned] = await Promise.all([
    getEnabledRules(account),
    getLearnedPersona(account),
  ]);

  const reply = await callClaude(buildPrompt(account, text, extraRules, learned), `댓글: "${text}"`);
  if (!reply || reply === 'SKIP') return { skipped: true, reason: 'skip' };

  const result = await zFetch(`/inbox/comments/${commentId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ text: reply }),
  });

  const success = !result.error;
  await logAction('comment', account, { commentId, author: authorUsername, text: text.slice(0, 100), reply, success });
  console.log(`[Zernio][${account}] 댓글 답글: "${reply.slice(0, 40)}"`);
  return { success, reply };
}

async function processDm(messageId, text, account) {
  // 중복 방지 (1h — DM은 짧게)
  const dupeKey = `zernio:replied:dm:${messageId}`;
  if (await redis.get(dupeKey)) return { skipped: true, reason: 'duplicate' };
  await redis.set(dupeKey, true, { ex: 3600 });

  const [extraRules, learned] = await Promise.all([
    getEnabledRules(account),
    getLearnedPersona(account),
  ]);

  const reply = await callClaude(buildPrompt(account, text, extraRules, learned), `DM: "${text}"`);
  if (!reply || reply === 'SKIP') return { skipped: true, reason: 'skip' };

  const result = await zFetch(`/inbox/messages/${messageId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ text: reply }),
  });

  const success = !result.error;
  await logAction('dm', account, { messageId, text: text.slice(0, 100), reply, success });
  console.log(`[Zernio][${account}] DM 답장: "${reply.slice(0, 40)}"`);
  return { success, reply };
}

// ────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────
export default async function handler(req, res) {
  // GET: 상태 확인
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', autoReply: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 즉시 200 응답 (Zernio 타임아웃 방지)
  res.status(200).json({ received: true });

  const body = req.body;

  // 웹훅 페이로드 로그 (디버그용, 최근 20개만)
  try {
    await redis.lpush('zernio:webhook:raw', JSON.stringify({ timestamp: new Date().toISOString(), body }));
    await redis.ltrim('zernio:webhook:raw', 0, 19);
  } catch {}

  // 페이로드에서 타입/계정/데이터 추출
  // Zernio 가능한 구조: { type, profileId, data: { id, text, username } }
  // 또는: { type, profile: { _id }, comment: { ... } }
  const eventType = body.type || body.event;
  const profileId = body.profileId || body.profile?._id || body.data?.profileId;
  const accountUsername = body.accountUsername || body.account?.username || body.data?.accountUsername;

  const account = detectAccount(profileId, accountUsername);
  if (!account) {
    console.warn(`[Zernio] 계정 식별 실패 — profileId: ${profileId}, username: ${accountUsername}`);
    return;
  }

  const settings = await getSettings(account);

  // 댓글 이벤트
  if (eventType === 'comment' || eventType === 'new_comment') {
    if (!settings.autoComment) {
      console.log(`[Zernio][${account}] autoComment OFF → skip`);
      return;
    }
    const commentData = body.data || body.comment || body;
    const commentId = commentData.id || commentData._id;
    const text = commentData.text || commentData.content || '';
    const author = commentData.username || commentData.author?.username || '';
    if (!commentId || !text) return;

    try { await processComment(commentId, text, account, author); }
    catch (e) { console.error(`[Zernio][${account}] 댓글 처리 오류:`, e.message); }
    return;
  }

  // DM 이벤트
  if (eventType === 'message' || eventType === 'new_message' || eventType === 'dm') {
    if (!settings.autoDm) {
      console.log(`[Zernio][${account}] autoDm OFF → skip`);
      return;
    }
    const msgData = body.data || body.message || body;
    const messageId = msgData.id || msgData._id;
    const text = msgData.text || msgData.content || '';
    if (!messageId || !text) return;

    try { await processDm(messageId, text, account); }
    catch (e) { console.error(`[Zernio][${account}] DM 처리 오류:`, e.message); }
    return;
  }

  console.log(`[Zernio] 알 수 없는 이벤트 타입: ${eventType}`);
}

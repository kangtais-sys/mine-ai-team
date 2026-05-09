import {
  redis, isUrgent, saveToApprovalQueue,
  getSettings, getEnabledRules, getLearnedPersona, getUrlKnowledge,
  buildPrompt, callClaude, logAction,
} from '../channel/_autoReplyUtils.js';

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
// Zernio 프로필 ID → 계정 키 (1순위 식별)
// ────────────────────────────────────────────────
const PROFILE_TO_ACCOUNT = {
  '69d08807986d57bb8f72f7e6': 'yuminhye',
  '69d08cc1986d57bb8f733102': 'millimilli',
  '69fca4b192b3d8e85f8cfea6': 'millimilli', // 실제 웹훅 account.id 확인값
};
const YUMINHYE_HANDLES = new Set(['lala_lounge_', 'yuminhye', 'peerstory', '15초유민혜', '0.8l_yuminhye']);
const MILLIMILLI_HANDLES = new Set(['millimilli.kr', 'millimilli-l4j', 'millimilli.official', 'millimilli_official', 'millimilli']);

function detectAccount(profileId, username) {
  if (profileId && PROFILE_TO_ACCOUNT[profileId]) return PROFILE_TO_ACCOUNT[profileId];
  if (username) {
    const u = username.toLowerCase();
    if (YUMINHYE_HANDLES.has(u)) return 'yuminhye';
    if (MILLIMILLI_HANDLES.has(u)) return 'millimilli';
  }
  return null;
}

// ────────────────────────────────────────────────
// 댓글/DM 처리 공통 함수
// ────────────────────────────────────────────────
async function processItem({ type, itemId, text, author, account }) {
  // 중복 방지
  const dupeKey = `zernio:replied:${type}:${itemId}`;
  if (await redis.get(dupeKey)) return { skipped: true, reason: 'duplicate' };
  await redis.set(dupeKey, true, { ex: type === 'comment' ? 86400 : 3600 });

  // 공통 데이터 로드
  const [extraRules, learned, urlKnowledge] = await Promise.all([
    getEnabledRules(account),
    getLearnedPersona(account),
    getUrlKnowledge(account),
  ]);

  const systemPrompt = buildPrompt(account, text, extraRules, learned, urlKnowledge);

  // 긴급 감지 → 승인 큐로
  if (isUrgent(text)) {
    const urgentReason = '긴급 키워드 감지';
    // 예시 답변 생성 (발송하지 않음)
    const suggestedReply = await callClaude(systemPrompt, `${type === 'comment' ? '댓글' : 'DM'}: "${text}"`);
    await saveToApprovalQueue(account, {
      type, itemId, author, text: text.slice(0, 200),
      suggestedReply: suggestedReply === 'SKIP' ? '' : suggestedReply,
      urgentReason,
    });
    console.log(`[Zernio][${account}] 긴급 → 승인 큐: "${text.slice(0, 40)}"`);
    return { urgent: true, queued: true };
  }

  // 일반 자동응대
  const reply = await callClaude(systemPrompt, `${type === 'comment' ? '댓글' : 'DM'}: "${text}"`);
  if (!reply || reply === 'SKIP') return { skipped: true, reason: 'skip' };

  const result = await zFetch(`/inbox/${type === 'comment' ? 'comments' : 'messages'}/${itemId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ text: reply }),
  });

  const success = !result.error;
  await logAction(type, account, { itemId, author, text: text.slice(0, 100), reply, success });
  console.log(`[Zernio][${account}] ${type} 답장: "${reply.slice(0, 40)}"`);
  return { success, reply };
}

// ────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', autoReply: true });
  }

  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  res.status(200).json({ received: true });

  const body = req.body;

  // 원시 로그 저장 (디버그용)
  try {
    await redis.lpush('zernio:webhook:raw', JSON.stringify({ timestamp: new Date().toISOString(), body }));
    await redis.ltrim('zernio:webhook:raw', 0, 19);
  } catch {}

  const eventType = body.type || body.event;
  const profileId = body.profileId || body.profile?._id || body.data?.profileId || body.account?.id;
  const accountUsername = body.accountUsername || body.account?.username || body.data?.accountUsername;
  const account = detectAccount(profileId, accountUsername);

  if (!account) {
    console.warn(`[Zernio] 계정 식별 실패 — profileId: ${profileId}, username: ${accountUsername}`);
    return;
  }

  const settings = await getSettings(account);

  // 댓글 이벤트
  if (eventType === 'comment' || eventType === 'new_comment' || eventType === 'comment.received') {
    if (!settings.autoComment) { console.log(`[Zernio][${account}] autoComment OFF`); return; }
    const d = body.comment || body.data || body;
    const itemId = d.id || d._id;
    const text = d.text || d.content || '';
    const author = d.author?.username || d.username || '';
    const postId = d.platformPostId || body.post?.platformPostId || '';
    if (!itemId || !text) return;
    // 대댓글은 스킵 (isReply)
    if (d.isReply) { console.log(`[Zernio][${account}] 대댓글 skip`); return; }
    try { await processItem({ type: 'comment', itemId, text, author, account }); }
    catch (e) { console.error(`[Zernio][${account}] 댓글 오류:`, e.message); }
    return;
  }

  // DM 이벤트
  if (eventType === 'message' || eventType === 'new_message' || eventType === 'dm' || eventType === 'message.received') {
    if (!settings.autoDm) { console.log(`[Zernio][${account}] autoDm OFF`); return; }
    const d = body.data || body.message || body;
    const itemId = d.id || d._id;
    const text = d.text || d.content || '';
    if (!itemId || !text) return;
    try { await processItem({ type: 'dm', itemId, text, author: '', account }); }
    catch (e) { console.error(`[Zernio][${account}] DM 오류:`, e.message); }
    return;
  }

  console.log(`[Zernio] 알 수 없는 이벤트: ${eventType}`);
}

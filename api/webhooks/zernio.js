import {
  redis, isUrgent, saveToApprovalQueue,
  getSettings, getEnabledRules, getLearnedPersona, getUrlKnowledge,
  buildPrompt, callClaude, logAction,
  isActiveHour, checkRateLimit, recordUsage,
} from '../channel/_autoReplyUtils.js';

export const config = { maxDuration: 30 };

const ZERNIO = 'https://zernio.com/api/v1';
const zFetch = async (path, opts = {}) => {
  const r = await fetch(`${ZERNIO}${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });
  const text = await r.text();
  try { return JSON.parse(text); }
  catch { return { error: `HTTP ${r.status}`, raw: text.slice(0, 200) }; }
};

// ────────────────────────────────────────────────
// Zernio 프로필 ID → 계정 키 (웹훅 실측값 기준)
// ────────────────────────────────────────────────
const PROFILE_TO_ACCOUNT = {
  '69d08807986d57bb8f72f7e6': 'yuminhye',   // 원래 yuminhye 프로필 ID
  '69fca4b192b3d8e85f8cfea6': 'yuminhye',   // lala_lounge_ 실측
  '69d08cc1986d57bb8f733102': 'millimilli', // 원래 millimilli 프로필 ID
  '69fbfc1992b3d8e85f86d277': 'millimilli', // millimilli.kr 실측
  '69fbfd0692b3d8e85f86d882': 'millimilli', // millimilli.us 실측
};
const YUMINHYE_HANDLES = new Set(['lala_lounge_', 'yuminhye', 'peerstory', '15초유민혜', '0.8l_yuminhye']);
const MILLIMILLI_HANDLES = new Set(['millimilli.kr', 'millimilli.us', 'millimilli-l4j', 'millimilli.official', 'millimilli_official', 'millimilli']);

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
async function processItem({ type, itemId, text, author, account, accountUsername, platformPostId, profileId, settings }) {
  // 활성 시간대 체크 (dupe key 설정 전 — 비활성 시간엔 dupe key 안 씀)
  if (!isActiveHour(settings)) {
    const kstH = new Date(Date.now() + 9 * 3600000).getUTCHours();
    console.log(`[Zernio][${account}] 비활성 시간대 skip (KST ${kstH}시)`);
    return { skipped: true, reason: 'inactive_hour' };
  }

  // 중복 방지
  const dupeKey = `zernio:replied:${type}:${itemId}`;
  if (await redis.get(dupeKey)) return { skipped: true, reason: 'duplicate' };
  await redis.set(dupeKey, true, { ex: type === 'comment' ? 86400 : 3600 });

  // 일일 한도 / 쿨다운 체크
  const rateCheck = await checkRateLimit(type, account, settings);
  if (rateCheck.blocked) {
    console.log(`[Zernio][${account}] 속도 제한: ${rateCheck.reason}`);
    return { skipped: true, reason: rateCheck.reason };
  }

  // 공통 데이터 로드
  const [extraRules, learned, urlKnowledge] = await Promise.all([
    getEnabledRules(account),
    getLearnedPersona(account),
    getUrlKnowledge(account),
  ]);

  const systemPrompt = buildPrompt(account, text, extraRules, learned, urlKnowledge);

  // 긴급 감지 → 승인 큐로
  if (isUrgent(text)) {
    const suggestedReply = await callClaude(systemPrompt, `${type === 'comment' ? '댓글' : 'DM'}: "${text}"`);
    await saveToApprovalQueue(account, {
      type, itemId, author, text: text.slice(0, 200),
      suggestedReply: suggestedReply === 'SKIP' ? '' : suggestedReply,
      urgentReason: '긴급 키워드 감지',
    });
    console.log(`[Zernio][${account}] 긴급 → 승인 큐: "${text.slice(0, 40)}"`);
    return { urgent: true, queued: true };
  }

  // 일반 자동응대
  const reply = await callClaude(systemPrompt, `${type === 'comment' ? '댓글' : 'DM'}: "${text}"`);
  if (!reply || reply === 'SKIP') return { skipped: true, reason: 'skip' };

  // Zernio 인박스는 "게시물 목록"을 반환 (팔로워 개별 댓글 X)
  // → platformPostId로 인박스 게시물 찾아서 해당 게시물 ID로 reply 엔드포인트 호출
  // → 답변 텍스트에 @{author} 멘션 포함해 팔로워에게 알림 전송
  const inboxPath = type === 'comment' ? 'comments' : 'messages';
  let zernioId = itemId;
  let inboxDebug = '';
  try {
    const inbox = await zFetch(`/inbox/${inboxPath}?limit=200`);
    const items = Array.isArray(inbox?.data) ? inbox.data
      : Array.isArray(inbox) ? inbox
      : (inbox[inboxPath] || inbox.items || []);
    inboxDebug = `items:${items.length}`;
    if (items.length > 0) {
      // 1순위: platformPostId로 게시물 매칭 (가장 정확)
      // 2순위: itemId 직접 매칭
      // 3순위: 텍스트 부분 매칭
      const textNorm = text.trim().slice(0, 50);
      const found = (platformPostId && items.find(i => String(i.id) === String(platformPostId)))
        || items.find(i => String(i.id) === String(itemId))
        || items.find(i =>
            (i.content || i.text || '').trim().startsWith(textNorm) &&
            (!i.accountUsername || !accountUsername || i.accountUsername === accountUsername)
          );
      if (found?.id) zernioId = String(found.id);
      inboxDebug += ` found:${!!found} matchBy:${found ? (platformPostId && String(found.id) === String(platformPostId) ? 'postId' : 'other') : 'none'} zernioId:${String(zernioId).slice(0,12)}`;
    }
  } catch (e) { inboxDebug = `error:${e.message}`; }

  // 댓글의 경우 @멘션으로 팔로워에게 알림 (게시물 댓글로 등록됨)
  const replyText = (type === 'comment' && author) ? `@${author} ${reply}` : reply;

  // Zernio 댓글 reply API: POST /inbox/comments/{postId}
  // body: { accountId (Zernio 프로필 ID), commentId (팔로워 댓글 ID), message }
  // ref: https://docs.zernio.com
  let result;
  if (type === 'comment') {
    result = await zFetch(`/inbox/comments/${zernioId}`, {
      method: 'POST',
      body: JSON.stringify({ accountId: profileId, commentId: itemId, message: replyText }),
    });
  } else {
    result = await zFetch(`/inbox/messages/${zernioId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ text: replyText }),
    });
  }

  const success = !result.error;
  await logAction(type, account, { itemId, zernioId, author, text: text.slice(0, 100), reply: replyText, success, inboxDebug, resultRaw: result.raw?.slice(0,100) });
  if (success) await recordUsage(type, account, settings);
  console.log(`[Zernio][${account}] ${type} 답장 (${success ? '성공' : '실패'}): "${reply.slice(0, 40)}"`);
  return { success, reply, zernioId };
}

// ────────────────────────────────────────────────
// Handler — 처리 완료 후 응답 (Vercel 조기 종료 방지)
// ────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', autoReply: true });
  }

  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

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
    return res.status(200).json({ received: true, skipped: 'unknown_account' });
  }

  const settings = await getSettings(account);

  // 댓글 이벤트
  if (eventType === 'comment' || eventType === 'new_comment' || eventType === 'comment.received') {
    if (!settings.autoComment) {
      console.log(`[Zernio][${account}] autoComment OFF`);
      return res.status(200).json({ received: true, skipped: 'autoComment_off' });
    }
    const d = body.comment || body.data || body;
    const itemId = d.id || d._id;
    const text = d.text || d.content || '';
    const author = d.author?.username || d.username || '';
    const platformPostId = d.platformPostId || body.post?.platformPostId || '';
    if (!itemId || !text) return res.status(200).json({ received: true, skipped: 'no_content' });
    if (d.isReply) {
      console.log(`[Zernio][${account}] 대댓글 skip`);
      return res.status(200).json({ received: true, skipped: 'is_reply' });
    }
    try {
      const result = await processItem({ type: 'comment', itemId, text, author, account, accountUsername, platformPostId, profileId, settings });
      return res.status(200).json({ received: true, ...result });
    } catch (e) {
      console.error(`[Zernio][${account}] 댓글 오류:`, e.message);
      return res.status(200).json({ received: true, error: e.message });
    }
  }

  // DM 이벤트
  if (eventType === 'message' || eventType === 'new_message' || eventType === 'dm' || eventType === 'message.received') {
    if (!settings.autoDm) {
      console.log(`[Zernio][${account}] autoDm OFF`);
      return res.status(200).json({ received: true, skipped: 'autoDm_off' });
    }
    const d = body.data || body.message || body;
    const itemId = d.id || d._id;
    const text = d.text || d.content || '';
    if (!itemId || !text) return res.status(200).json({ received: true, skipped: 'no_content' });
    try {
      const result = await processItem({ type: 'dm', itemId, text, author: '', account, settings });
      return res.status(200).json({ received: true, ...result });
    } catch (e) {
      console.error(`[Zernio][${account}] DM 오류:`, e.message);
      return res.status(200).json({ received: true, error: e.message });
    }
  }

  console.log(`[Zernio] 알 수 없는 이벤트: ${eventType}`);
  return res.status(200).json({ received: true, skipped: 'unknown_event', eventType });
}

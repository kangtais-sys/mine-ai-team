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
  '69d08807986d57bb8f72f7e6': 'yuminhye',      // 원래 yuminhye 프로필 ID
  '69fca4b192b3d8e85f8cfea6': 'yuminhye',      // lala_lounge_ 실측
  '69d08cc1986d57bb8f733102': 'millimilli',    // 원래 millimilli 프로필 ID
  '69fbfc1992b3d8e85f86d277': 'millimilli',    // millimilli.kr 실측
  '69fbfd0692b3d8e85f86d882': 'millimilli_us', // millimilli.us 실측 — KR과 분리(독립 설정)
};
const YUMINHYE_HANDLES = new Set(['lala_lounge_', 'yuminhye', 'peerstory', '15초유민혜', '0.8l_yuminhye']);
const MILLIMILLI_US_HANDLES = new Set(['millimilli.us']);
const MILLIMILLI_HANDLES = new Set(['millimilli.kr', 'millimilli-l4j', 'millimilli.official', 'millimilli_official', 'millimilli']);

function detectAccount(profileId, username) {
  if (profileId && PROFILE_TO_ACCOUNT[profileId]) return PROFILE_TO_ACCOUNT[profileId];
  if (username) {
    const u = username.toLowerCase();
    if (YUMINHYE_HANDLES.has(u)) return 'yuminhye';
    if (MILLIMILLI_US_HANDLES.has(u)) return 'millimilli_us'; // .us 먼저 (KR보다 우선)
    if (MILLIMILLI_HANDLES.has(u)) return 'millimilli';
  }
  return null;
}

// ────────────────────────────────────────────────
// platformPostId → Zernio 내부 postId 조회 (캐시 활용)
// Zernio 웹훅은 post.id = null 이므로 inbox 목록에서 매칭
// ────────────────────────────────────────────────
// platformPostId → Zernio 내부 postId 조회 (캐시 활용)
// 실측: Zernio inbox item.id == Instagram platformPostId (같은 ID 체계)
async function lookupZernioPostId(platformPostId) {
  if (!platformPostId) return null;
  const cacheKey = `zernio:postid:${platformPostId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const resp = await zFetch('/inbox/comments?limit=50');
    const posts = resp?.data || [];
    for (const post of posts) {
      if (!post.id) continue;
      // Zernio post.id == Instagram post ID (동일 체계 확인됨)
      await redis.set(`zernio:postid:${post.id}`, post.id, { ex: 3600 }).catch(() => {});
      const altFields = [post.platformPostId, post.platformId, post.externalId, post.instagramId, post.mediaId];
      for (const f of altFields) {
        if (f) await redis.set(`zernio:postid:${f}`, post.id, { ex: 3600 }).catch(() => {});
      }
      if (post.id === platformPostId || altFields.some(f => f && f === platformPostId)) {
        return post.id;
      }
    }
    // inbox 50개 내 미발견 → platformPostId를 직접 사용 (Zernio가 Instagram ID 그대로 사용)
    console.warn(`[lookupZernioPostId] inbox 미발견, platformPostId 직접 사용: ${platformPostId}`);
    return platformPostId;
  } catch (e) {
    console.error('[lookupZernioPostId]', e.message);
    return platformPostId; // fallback
  }
}

// ────────────────────────────────────────────────
// 댓글/DM 처리 공통 함수
// ────────────────────────────────────────────────
async function processItem({ type, itemId, conversationId, text, author, account, accountUsername, platformPostId, profileId, settings }) {
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

  // 댓글의 경우 @멘션으로 팔로워에게 알림
  const replyText = (type === 'comment' && author) ? `@${author} ${reply}` : reply;

  // Zernio API 정확한 엔드포인트 (docs.zernio.com 실측):
  // 댓글: POST /inbox/comments/{postId}  body: { accountId, message, commentId }
  // DM:   POST /inbox/messages/{itemId}/reply  body: { text }
  let result;
  let zernioPostId = null;
  if (type === 'comment') {
    // post.id가 null이므로 platformPostId로 Zernio 내부 postId 조회
    zernioPostId = await lookupZernioPostId(platformPostId);
    if (!zernioPostId) {
      console.warn(`[Zernio][${account}] postId 조회 실패 (platformPostId: ${platformPostId}) — 댓글 답장 스킵`);
      await logAction(type, account, { itemId, author, text: text.slice(0, 100), reply: replyText, success: false, resultRaw: 'postId_lookup_failed' });
      return { skipped: true, reason: 'postId_lookup_failed' };
    }
    result = await zFetch(`/inbox/comments/${zernioPostId}`, {
      method: 'POST',
      body: JSON.stringify({ accountId: profileId, message: replyText, commentId: itemId }),
    });
  } else {
    // DM: POST /inbox/conversations/{conversationId}/messages (docs 실측)
    // body: { accountId, message }
    result = await zFetch(`/inbox/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ accountId: profileId, message: replyText }),
    });
  }

  const success = result?.success === true || (!result.error && !result.raw);
  await logAction(type, account, { itemId, zernioPostId, author, text: text.slice(0, 100), reply: replyText, success, resultRaw: result.raw?.slice(0, 100) });
  if (success) await recordUsage(type, account, settings);
  console.log(`[Zernio][${account}] ${type} 답장 (${success ? '성공' : '실패'}): "${reply.slice(0, 40)}"`);
  return { success, reply };
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

  // 원시 로그 저장 — 계정별 분리 + 통합 (디버그용)
  try {
    const rawEntry = JSON.stringify({ timestamp: new Date().toISOString(), body });
    const acctKey = body.account?.username
      ? `zernio:webhook:raw:${body.account.username}`
      : null;
    await Promise.all([
      redis.lpush('zernio:webhook:raw', rawEntry).then(() => redis.ltrim('zernio:webhook:raw', 0, 49)),
      acctKey && redis.lpush(acctKey, rawEntry).then(() => redis.ltrim(acctKey, 0, 29)),
    ].filter(Boolean));
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
    // conversationId: 웹훅에서 가능한 모든 위치 탐색
    const conversationId = body.conversation?.id || body.conversationId || d.conversationId || d.conversation_id || '';
    const author = d.author?.username || d.sender?.username || d.from?.username || '';
    if (!itemId || !text) return res.status(200).json({ received: true, skipped: 'no_content' });
    if (!conversationId) {
      console.warn(`[Zernio][${account}] DM conversationId 없음 — 스킵`);
      return res.status(200).json({ received: true, skipped: 'no_conversationId' });
    }
    try {
      const result = await processItem({ type: 'dm', itemId, conversationId, text, author, account, profileId, settings });
      return res.status(200).json({ received: true, ...result });
    } catch (e) {
      console.error(`[Zernio][${account}] DM 오류:`, e.message);
      return res.status(200).json({ received: true, error: e.message });
    }
  }

  console.log(`[Zernio] 알 수 없는 이벤트: ${eventType}`);
  return res.status(200).json({ received: true, skipped: 'unknown_event', eventType });
}

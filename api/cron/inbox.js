// 5분마다 Zernio 미답변 댓글/DM 폴링 → 계정별 토글 ON인 경우만 자동응대
// 긴급 감지 시 자동응대 대신 승인 큐로 이동
import {
  redis, isUrgent, saveToApprovalQueue,
  getSettings, getEnabledRules, getLearnedPersona, getUrlKnowledge,
  buildPrompt, callClaude, logAction,
  isActiveHour, checkRateLimit, recordUsage,
} from '../channel/_autoReplyUtils.js';

export const config = { maxDuration: 60 };

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

// Zernio 프로필 ID → 계정 (웹훅 실측값 기준)
const PROFILE_TO_ACCOUNT = {
  '69d08807986d57bb8f72f7e6': 'yuminhye',   // 원래 yuminhye 프로필 ID
  '69fca4b192b3d8e85f8cfea6': 'yuminhye',   // lala_lounge_ 계정 실측
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

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.ZERNIO_API_KEY) {
    return res.status(200).json({ skipped: true, reason: 'no zernio key' });
  }

  const stats = { replied: 0, skipped: 0, queued: 0, noAccount: 0, errors: 0 };
  const skipReasons = {};
  let commentsData = null, messagesData = null;

  // 계정별 설정 미리 로드
  const [ymSettings, mmSettings] = await Promise.all([
    getSettings('yuminhye'),
    getSettings('millimilli'),
  ]);

  // 두 계정 모두 OFF면 스킵
  if (!ymSettings.autoComment && !ymSettings.autoDm && !mmSettings.autoComment && !mmSettings.autoDm) {
    return res.status(200).json({ skipped: true, reason: 'all toggles off' });
  }

  try {
    [commentsData, messagesData] = await Promise.all([
      zFetch('/inbox/comments?limit=50'),
      zFetch('/inbox/messages?limit=20'),
    ]);

    if (commentsData.error) console.warn('[Inbox Cron] comments API 오류:', commentsData.error, commentsData.raw?.slice(0,100));
    if (messagesData.error) console.warn('[Inbox Cron] messages API 오류:', messagesData.error, messagesData.raw?.slice(0,100));

    // Zernio inbox API: { data: [...] } 구조
    const comments = Array.isArray(commentsData?.data) ? commentsData.data
      : Array.isArray(commentsData?.comments) ? commentsData.comments
      : Array.isArray(commentsData) ? commentsData : [];
    const messages = Array.isArray(messagesData?.data) ? messagesData.data
      : Array.isArray(messagesData?.messages) ? messagesData.messages
      : Array.isArray(messagesData) ? messagesData : [];

    // 구조 디버그 (처음 한 번)
    if (comments[0]) console.log('[Inbox Cron] 댓글 샘플 키:', Object.keys(comments[0]).join(','), '| id:', comments[0].id);

    // ⚠️ Zernio /inbox/comments는 팔로워 댓글이 아닌 "게시물" 목록을 반환함.
    // 각 item의 content = 게시물 캡션(계정 본인 글). 팔로워 댓글 자동응대에 쓰면 안 됨.
    // 팔로워 댓글 응대는 webhook(/api/webhooks/zernio)이 실시간으로 처리.
    // cron은 댓글 처리 스킵, DM만 처리.
    const SKIP_COMMENT_CRON = true;

    // ── 댓글 처리 (비활성화) ──
    if (!SKIP_COMMENT_CRON) for (const c of comments) {
      try {
        const profileId = c.profileId || c.profile?._id;
        const username = c.accountUsername || c.account?.username || '';
        const account = detectAccount(profileId, username);
        if (!account) { stats.noAccount++; continue; }

        const settings = account === 'yuminhye' ? ymSettings : mmSettings;
        const skip = (r) => { stats.skipped++; skipReasons[r] = (skipReasons[r]||0)+1; };
        if (!settings.autoComment) { skip('autoComment_off'); continue; }
        if (!isActiveHour(settings)) { skip('inactive_hour'); continue; }

        const itemId = c._id || c.id;
        const text = c.text || c.content || '';
        const author = c.author?.username || c.username || '';
        if (!itemId || !text) { skip('no_content'); continue; }

        // 일일 한도·쿨다운
        const rateCheck = await checkRateLimit('comment', account, settings);
        if (rateCheck.blocked) { skip('rate_limit'); continue; }

        // 중복 방지
        const dupeKey = `zernio:replied:comment:${itemId}`;
        if (await redis.get(dupeKey)) { skip('duplicate'); continue; }
        await redis.set(dupeKey, true, { ex: 86400 });

        const [extraRules, learned, urlKnowledge] = await Promise.all([
          getEnabledRules(account),
          getLearnedPersona(account),
          getUrlKnowledge(account),
        ]);
        const systemPrompt = buildPrompt(account, text, extraRules, learned, urlKnowledge);

        // 긴급 → 승인 큐
        if (isUrgent(text)) {
          const suggestedReply = await callClaude(systemPrompt, `댓글: "${text}"`);
          await saveToApprovalQueue(account, {
            type: 'comment', itemId, author, text: text.slice(0, 200),
            suggestedReply: suggestedReply === 'SKIP' ? '' : suggestedReply,
            urgentReason: '긴급 키워드 감지',
          });
          stats.queued++;
          continue;
        }

        const reply = await callClaude(systemPrompt, `댓글: "${text}"`);
        if (!reply || reply === 'SKIP') { stats.skipped++; continue; }

        await zFetch(`/inbox/comments/${itemId}/reply`, { method: 'POST', body: JSON.stringify({ text: reply }) });
        await logAction('comment', account, { itemId, author, text: text.slice(0, 100), reply, success: true });
        await recordUsage('comment', account, settings);
        console.log(`[Inbox Cron][${account}] 댓글: "${reply.slice(0, 40)}"`);
        stats.replied++;
      } catch (e) { console.error('[Inbox Cron] 댓글 오류:', e.message); stats.errors++; }
    }

    // ── DM 처리 ──
    for (const m of messages) {
      try {
        const profileId = m.profileId || m.profile?._id;
        const username = m.accountUsername || m.account?.username || '';
        const account = detectAccount(profileId, username);
        if (!account) { stats.noAccount++; continue; }

        const settings = account === 'yuminhye' ? ymSettings : mmSettings;
        if (!settings.autoDm) { stats.skipped++; continue; }
        if (!isActiveHour(settings)) { stats.skipped++; continue; }

        const itemId = m._id || m.id;
        const text = m.text || m.content || '';
        if (!itemId || !text) { stats.skipped++; continue; }

        // 일일 한도·쿨다운
        const rateCheck = await checkRateLimit('dm', account, settings);
        if (rateCheck.blocked) { stats.skipped++; continue; }

        const dupeKey = `zernio:replied:dm:${itemId}`;
        if (await redis.get(dupeKey)) { stats.skipped++; continue; }
        await redis.set(dupeKey, true, { ex: 3600 });

        const [extraRules, learned, urlKnowledge] = await Promise.all([
          getEnabledRules(account),
          getLearnedPersona(account),
          getUrlKnowledge(account),
        ]);
        const systemPrompt = buildPrompt(account, text, extraRules, learned, urlKnowledge);

        // 긴급 → 승인 큐
        if (isUrgent(text)) {
          const suggestedReply = await callClaude(systemPrompt, `DM: "${text}"`);
          await saveToApprovalQueue(account, {
            type: 'dm', itemId, author: '', text: text.slice(0, 200),
            suggestedReply: suggestedReply === 'SKIP' ? '' : suggestedReply,
            urgentReason: '긴급 키워드 감지',
          });
          stats.queued++;
          continue;
        }

        const reply = await callClaude(systemPrompt, `DM: "${text}"`);
        if (!reply || reply === 'SKIP') { stats.skipped++; continue; }

        await zFetch(`/inbox/messages/${itemId}/reply`, { method: 'POST', body: JSON.stringify({ text: reply }) });
        await logAction('dm', account, { itemId, text: text.slice(0, 100), reply, success: true });
        await recordUsage('dm', account, settings);
        console.log(`[Inbox Cron][${account}] DM: "${reply.slice(0, 40)}"`);
        stats.replied++;
      } catch (e) { console.error('[Inbox Cron] DM 오류:', e.message); stats.errors++; }
    }
  } catch (e) {
    console.error('[Inbox Cron] 전체 오류:', e.message);
    return res.status(500).json({ error: e.message });
  }

  const kstH = new Date(Date.now() + 9*3600000).getUTCHours();
  const today = new Date(Date.now() + 9*3600000).toISOString().slice(0, 10);
  const [mmDailyCount, mmCooldown] = await Promise.all([
    redis.get(`channel:rate:daily:comment:millimilli:${today}`),
    redis.get(`channel:rate:cooldown:comment:millimilli`),
  ]);
  console.log('[Inbox Cron] 완료:', stats, 'skipReasons:', skipReasons);
  return res.status(200).json({
    success: true, ...stats, skipReasons,
    debug: {
      kstHour: kstH,
      ymAutoComment: ymSettings.autoComment,
      mmAutoComment: mmSettings.autoComment,
      mmCommentDailyLimit: mmSettings.commentDailyLimit,
      mmDailyCount, mmCooldown,
      commentsCount: (commentsData?.data || []).length,
    }
  });
}

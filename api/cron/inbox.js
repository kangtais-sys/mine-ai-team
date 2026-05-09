// 5분마다 Zernio 미답변 댓글/DM 폴링 → 계정별 토글 ON인 경우만 자동응대
// 긴급 감지 시 자동응대 대신 승인 큐로 이동
import {
  redis, isUrgent, saveToApprovalQueue,
  getSettings, getEnabledRules, getLearnedPersona, getUrlKnowledge,
  buildPrompt, callClaude, logAction,
} from '../channel/_autoReplyUtils.js';

export const config = { maxDuration: 60 };

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

// Zernio 프로필 ID → 계정
const PROFILE_TO_ACCOUNT = {
  '69d08807986d57bb8f72f7e6': 'yuminhye',
  '69d08cc1986d57bb8f733102': 'millimilli',
};
const YUMINHYE_HANDLES = new Set(['lala_lounge_', 'yuminhye', 'peerstory', '15초유민혜']);
const MILLIMILLI_HANDLES = new Set(['millimilli.kr', 'millimilli-l4j', 'millimilli.official', 'millimilli_official']);

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
    const [commentsData, messagesData] = await Promise.all([
      zFetch('/inbox/comments?status=unanswered&limit=30'),
      zFetch('/inbox/messages?status=unanswered&limit=15'),
    ]);

    const comments = Array.isArray(commentsData.comments || commentsData) ? (commentsData.comments || commentsData) : [];
    const messages = Array.isArray(messagesData.messages || messagesData) ? (messagesData.messages || messagesData) : [];

    // ── 댓글 처리 ──
    for (const c of comments) {
      try {
        const profileId = c.profileId || c.profile?._id;
        const username = c.accountUsername || c.account?.username || '';
        const account = detectAccount(profileId, username);
        if (!account) { stats.noAccount++; continue; }

        const settings = account === 'yuminhye' ? ymSettings : mmSettings;
        if (!settings.autoComment) { stats.skipped++; continue; }

        const itemId = c._id || c.id;
        const text = c.text || c.content || '';
        const author = c.author?.username || c.username || '';
        if (!itemId || !text) { stats.skipped++; continue; }

        // 중복 방지
        const dupeKey = `zernio:replied:comment:${itemId}`;
        if (await redis.get(dupeKey)) { stats.skipped++; continue; }
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

        const itemId = m._id || m.id;
        const text = m.text || m.content || '';
        if (!itemId || !text) { stats.skipped++; continue; }

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
        console.log(`[Inbox Cron][${account}] DM: "${reply.slice(0, 40)}"`);
        stats.replied++;
      } catch (e) { console.error('[Inbox Cron] DM 오류:', e.message); stats.errors++; }
    }
  } catch (e) {
    console.error('[Inbox Cron] 전체 오류:', e.message);
    return res.status(500).json({ error: e.message });
  }

  console.log('[Inbox Cron] 완료:', stats);
  return res.status(200).json({ success: true, ...stats });
}

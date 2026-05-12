// 5분마다 Zernio 미답변 DM 폴링 → 계정별 토글 ON인 경우만 자동응대
// 댓글은 webhook 실시간 처리 / DM은 conversations API 폴링 + webhook 이중 처리
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

// Instagram 계정 ID → 앱 계정 매핑
const DM_ACCOUNTS = [
  {
    accountId: '69fbfc1992b3d8e85f86d277', // millimilli.kr
    accountUsername: 'millimilli.kr',
    account: 'millimilli',
  },
  {
    accountId: '69fca4b192b3d8e85f8cfea6', // lala_lounge_
    accountUsername: 'lala_lounge_',
    account: 'yuminhye',
  },
];

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.ZERNIO_API_KEY) {
    return res.status(200).json({ skipped: true, reason: 'no zernio key' });
  }

  const stats = { replied: 0, skipped: 0, queued: 0, errors: 0 };
  const skipReasons = {};
  const skip = (r) => { stats.skipped++; skipReasons[r] = (skipReasons[r] || 0) + 1; };

  // 계정별 설정 미리 로드
  const [ymSettings, mmSettings] = await Promise.all([
    getSettings('yuminhye'),
    getSettings('millimilli'),
  ]);

  const settingsMap = { yuminhye: ymSettings, millimilli: mmSettings };

  // DM 자동응대 계정이 하나도 없으면 스킵
  if (!ymSettings.autoDm && !mmSettings.autoDm) {
    return res.status(200).json({ skipped: true, reason: 'all autoDm off' });
  }

  // ── DM 처리 — Conversations API 폴링 ──
  // Zernio /inbox/messages 엔드포인트 없음 → /inbox/conversations 사용
  // 10분 이내 업데이트된 대화만 처리 (5분 크론 + 버퍼)
  const cutoffMs = Date.now() - 10 * 60 * 1000;

  for (const { accountId, accountUsername, account } of DM_ACCOUNTS) {
    const settings = settingsMap[account];
    if (!settings.autoDm) { skip('autoDm_off'); continue; }
    if (!isActiveHour(settings)) { skip('inactive_hour'); continue; }

    try {
      const convsResp = await zFetch(`/inbox/conversations?accountId=${accountId}&limit=20`);
      if (convsResp?.error) {
        console.warn(`[Inbox Cron][${account}] conversations API 오류:`, convsResp.error, convsResp.raw?.slice(0, 100));
        stats.errors++;
        continue;
      }

      const convList = Array.isArray(convsResp?.data) ? convsResp.data : [];
      console.log(`[Inbox Cron][${account}] 대화 ${convList.length}개 조회`);

      for (const conv of convList) {
        try {
          // 최근 10분 이내 업데이트된 대화만 처리
          const updatedAt = conv.updatedTime ? new Date(conv.updatedTime).getTime() : 0;
          if (updatedAt < cutoffMs) continue; // 오래된 대화 스킵

          const conversationId = conv.id;
          if (!conversationId) continue;

          // 해당 대화의 최신 메시지 조회 (direction 확인용)
          const msgsResp = await zFetch(`/inbox/conversations/${conversationId}/messages?limit=5`);
          if (msgsResp?.error) {
            console.warn(`[Inbox Cron][${account}] messages API 오류 (conv: ${conversationId}):`, msgsResp.error);
            continue;
          }

          const msgList = Array.isArray(msgsResp?.data) ? msgsResp.data
            : Array.isArray(msgsResp?.messages) ? msgsResp.messages
            : [];

          // 가장 최신 incoming 메시지 찾기 (배열 앞 = 최신)
          const lastIncoming = msgList.find(m => m.direction === 'incoming');
          if (!lastIncoming) continue;

          const itemId = lastIncoming.id || lastIncoming._id;
          const text = lastIncoming.text || lastIncoming.content || '';
          const author = lastIncoming.sender?.username || conv.participantUsername || '';
          if (!itemId || !text) continue;

          // 일일 한도·쿨다운
          const rateCheck = await checkRateLimit('dm', account, settings);
          if (rateCheck.blocked) { skip('rate_limit'); continue; }

          // 중복 방지
          const dupeKey = `zernio:replied:dm:${itemId}`;
          if (await redis.get(dupeKey)) { skip('duplicate'); continue; }
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
              type: 'dm', itemId, author, text: text.slice(0, 200),
              suggestedReply: suggestedReply === 'SKIP' ? '' : suggestedReply,
              urgentReason: '긴급 키워드 감지',
            });
            stats.queued++;
            continue;
          }

          const reply = await callClaude(systemPrompt, `DM: "${text}"`);
          if (!reply || reply === 'SKIP') { skip('skip'); continue; }

          // 올바른 DM 답장: POST /inbox/conversations/{conversationId}/messages
          const result = await zFetch(`/inbox/conversations/${conversationId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ accountId, message: reply }),
          });

          const success = result?.success === true || (!result?.error && !result?.raw);
          await logAction('dm', account, {
            itemId, author, text: text.slice(0, 100), reply, success,
            resultRaw: result?.raw?.slice(0, 100),
          });
          if (success) {
            await recordUsage('dm', account, settings);
            stats.replied++;
          } else {
            stats.errors++;
          }
          console.log(`[Inbox Cron][${account}] DM 답장 (${success ? '성공' : '실패'}): "${reply.slice(0, 40)}"`);

        } catch (e) {
          console.error(`[Inbox Cron][${account}] 대화 처리 오류:`, e.message);
          stats.errors++;
        }
      }
    } catch (e) {
      console.error(`[Inbox Cron][${account}] conversations 조회 오류:`, e.message);
      stats.errors++;
    }
  }

  const kstH = new Date(Date.now() + 9 * 3600000).getUTCHours();
  console.log('[Inbox Cron] 완료:', stats, 'skipReasons:', skipReasons);
  return res.status(200).json({
    success: true, ...stats, skipReasons,
    debug: {
      kstHour: kstH,
      ymAutoDm: ymSettings.autoDm,
      mmAutoDm: mmSettings.autoDm,
    },
  });
}

// 5분마다 Zernio 미답변 댓글/DM 폴링 → 토글 ON인 계정만 자동 응대
// 웹훅을 놓쳤거나 Zernio가 웹훅을 지원하지 않을 때 백업 역할
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

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

// Zernio 프로필 ID → 우리 계정 키
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

const OY_KEYWORDS = ['올영세일', '올리브영세일', '올영 세일'];

function buildPrompt(account, text, extraRules = [], learned = null) {
  const rulesText = extraRules.length > 0
    ? `\n\n[컨텍스트 규칙]\n${extraRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';
  const learnedText = learned?.learned
    ? `\n\n[학습된 특성]\n- 주제: ${(learned.learned.mainTopics || []).join(', ')}\n- 말투: ${learned.learned.toneInsights || ''}`
    : '';

  if (account === 'yuminhye') {
    return `당신은 인플루언서 유민혜(@lala_lounge_)입니다. 절대 밀리밀리 브랜드 계정처럼 응대하면 안 됩니다.
이모지 1-2개, 1-2문장. 악성/스팸이면 SKIP만 반환.
말투: 반말 또는 가벼운 존댓말, 친근하고 따뜻하게.
칭찬/공감 → 진심 어린 리액션. 뷰티 질문 → 개인 경험 공유.
개인 연락/광고 → SKIP.${learnedText}${rulesText}`;
  }

  const isOYSale = OY_KEYWORDS.some(k => (text || '').includes(k));
  return `당신은 밀리밀리(MILLIMILLI) 500달톤 K뷰티 브랜드 SNS 담당자입니다. 절대 개인처럼 응대하면 안 됩니다.
이모지 1-2개, 2문장 이내. 가격 직접 언급 금지. 악성/스팸이면 SKIP만 반환.
일본어→일본어 / 영어→영어. 제품문의 → 답변 + "카카오채널 @밀리밀리 🫶"
${isOYSale ? '올영세일 기간, 올리브영 추천.' : '구매: 자사몰 > 스마트스토어 > 올리브영.'}${learnedText}${rulesText}`;
}

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

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.ZERNIO_API_KEY) {
    return res.status(200).json({ skipped: true, reason: 'no zernio key' });
  }

  const stats = { comments: { replied: 0, skipped: 0 }, dms: { replied: 0, skipped: 0 }, errors: 0 };

  try {
    const [commentsData, messagesData] = await Promise.all([
      zFetch('/inbox/comments?status=unanswered&limit=30'),
      zFetch('/inbox/messages?status=unanswered&limit=15'),
    ]);

    const comments = commentsData.comments || commentsData || [];
    const messages = messagesData.messages || messagesData || [];

    // ── 댓글 처리 ──
    for (const c of (Array.isArray(comments) ? comments : [])) {
      try {
        const profileId = c.profileId || c.profile?._id;
        const username = c.accountUsername || c.account?.username || '';
        const account = detectAccount(profileId, username);

        if (!account) {
          console.warn(`[Inbox Cron] 댓글 계정 식별 실패: profileId=${profileId}, username=${username}`);
          stats.comments.skipped++;
          continue;
        }

        const settings = await redis.get(`channel:settings:${account}`).catch(() => null) || {};
        if (!settings.autoComment) { stats.comments.skipped++; continue; }

        const commentId = c._id || c.id;
        const text = c.text || c.content || '';
        if (!commentId || !text) { stats.comments.skipped++; continue; }

        // 중복 방지
        const dupeKey = `zernio:replied:comment:${commentId}`;
        if (await redis.get(dupeKey)) { stats.comments.skipped++; continue; }
        await redis.set(dupeKey, true, { ex: 86400 });

        const [extraRules, learned] = await Promise.all([
          redis.get('channel:rules').then(raw => {
            const rules = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
            return rules.filter(r => r.enabled && (r.account === account || r.account === 'all')).map(r => r.text);
          }).catch(() => []),
          redis.get(`channel:persona:${account}`).catch(() => null),
        ]);

        const reply = await callClaude(buildPrompt(account, text, extraRules, learned), `댓글: "${text}"`);
        if (!reply || reply === 'SKIP') { stats.comments.skipped++; continue; }

        await zFetch(`/inbox/comments/${commentId}/reply`, { method: 'POST', body: JSON.stringify({ text: reply }) });
        await logAction('comment', account, { commentId, author: c.author?.username, text: text.slice(0, 100), reply, success: true });
        console.log(`[Inbox Cron][${account}] 댓글 답글: "${reply.slice(0, 40)}"`);
        stats.comments.replied++;
      } catch (e) {
        console.error('[Inbox Cron] 댓글 오류:', e.message);
        stats.errors++;
      }
    }

    // ── DM 처리 ──
    for (const m of (Array.isArray(messages) ? messages : [])) {
      try {
        const profileId = m.profileId || m.profile?._id;
        const username = m.accountUsername || m.account?.username || '';
        const account = detectAccount(profileId, username);

        if (!account) {
          console.warn(`[Inbox Cron] DM 계정 식별 실패: profileId=${profileId}`);
          stats.dms.skipped++;
          continue;
        }

        const settings = await redis.get(`channel:settings:${account}`).catch(() => null) || {};
        if (!settings.autoDm) { stats.dms.skipped++; continue; }

        const messageId = m._id || m.id;
        const text = m.text || m.content || '';
        if (!messageId || !text) { stats.dms.skipped++; continue; }

        const dupeKey = `zernio:replied:dm:${messageId}`;
        if (await redis.get(dupeKey)) { stats.dms.skipped++; continue; }
        await redis.set(dupeKey, true, { ex: 3600 });

        const [extraRules, learned] = await Promise.all([
          redis.get('channel:rules').then(raw => {
            const rules = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
            return rules.filter(r => r.enabled && (r.account === account || r.account === 'all')).map(r => r.text);
          }).catch(() => []),
          redis.get(`channel:persona:${account}`).catch(() => null),
        ]);

        const reply = await callClaude(buildPrompt(account, text, extraRules, learned), `DM: "${text}"`);
        if (!reply || reply === 'SKIP') { stats.dms.skipped++; continue; }

        await zFetch(`/inbox/messages/${messageId}/reply`, { method: 'POST', body: JSON.stringify({ text: reply }) });
        await logAction('dm', account, { messageId, text: text.slice(0, 100), reply, success: true });
        console.log(`[Inbox Cron][${account}] DM 답장: "${reply.slice(0, 40)}"`);
        stats.dms.replied++;
      } catch (e) {
        console.error('[Inbox Cron] DM 오류:', e.message);
        stats.errors++;
      }
    }
  } catch (e) {
    console.error('[Inbox Cron] 전체 오류:', e.message);
    return res.status(500).json({ error: e.message });
  }

  console.log('[Inbox Cron] 완료:', stats);
  return res.status(200).json({ success: true, ...stats });
}

import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';

const anthropic = new Anthropic();
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
// 계정 식별 — 절대 섞이면 안 됨
// ────────────────────────────────────────────────
const YUMINHYE_HANDLES = new Set(['lala_lounge_', 'yuminhye', '0.8l_yuminhye']);
const MILLIMILLI_HANDLES = new Set(['millimilli.official', 'millimilli_official', 'millimilli']);

function detectAccountKey(username) {
  if (!username) return null;
  const u = username.toLowerCase().replace(/\s/g, '');
  if (YUMINHYE_HANDLES.has(u)) return 'yuminhye';
  if (MILLIMILLI_HANDLES.has(u)) return 'millimilli';
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
  try {
    return await redis.get(`channel:persona:${account}`);
  } catch { return null; }
}

async function logCount(type, account) {
  // type: 'comment' | 'dm'
  const logKey = `channel:auto:${type}:logs:${account}`;
  const countKey = `channel:auto:count:${type}:${account}`;
  try {
    await Promise.all([
      redis.incr(countKey),
      redis.lpush(logKey, JSON.stringify({ timestamp: new Date().toISOString() })),
      redis.ltrim(logKey, 0, 199),
    ]);
  } catch {}
}

// ────────────────────────────────────────────────
// 프롬프트 생성 — 계정별 완전 분리
// ────────────────────────────────────────────────
function buildPrompt(account, text, extraRules = [], learned = null) {
  const rulesText = extraRules.length > 0
    ? `\n\n[컨텍스트 규칙 — 반드시 준수]\n${extraRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';

  const learnedText = learned?.learned
    ? `\n\n[학습된 채널 특성]\n- 주요 주제: ${(learned.learned.mainTopics || []).join(', ')}\n- 말투: ${learned.learned.toneInsights || ''}\n- 참여율 높은 유형: ${learned.learned.highEngagementType || ''}`
    : '';

  if (account === 'yuminhye') {
    return `당신은 인플루언서 유민혜(@lala_lounge_)입니다. 절대 밀리밀리 브랜드 계정처럼 응대하면 안 됩니다.
팔로워에게 친근한 언니처럼 댓글을 답니다.
이모지 1-2개, 1-2문장. 악성/스팸이면 SKIP만 반환.
말투: 반말 또는 가벼운 존댓말, 친근하고 따뜻하게.
칭찬/공감 → 진심 어린 리액션.
뷰티/스킨케어 질문 → 개인적인 경험 공유하듯 답변.
개인 연락 요청/광고 → SKIP.${learnedText}${rulesText}`;
  }

  // millimilli
  const isOYSale = ['올영세일', '올리브영세일', '올영 세일'].some(k => (text || '').includes(k));
  const purchaseGuide = isOYSale
    ? '올영세일 기간! 올리브영에서 구매 적극 추천.'
    : '구매 추천 순서: 1) 자사몰 https://millimilli.official (혜택 최고) 2) 스마트스토어 3) 올리브영.';

  return `당신은 밀리밀리(MILLIMILLI) 500달톤 K뷰티 브랜드 SNS 담당자입니다. 절대 개인 인플루언서처럼 응대하면 안 됩니다.
이모지 1-2개, 2문장 이내. 가격 직접 언급 금지. 악성/스팸이면 SKIP만 반환.
일본어 댓글 → 일본어 / 영어 → 영어로 답변.
제품/성분 문의 → 간단 답변 + "카카오채널 @밀리밀리에서 자세히 안내드릴게요 🫶"
칭찬 → 진심 어린 감사.
${purchaseGuide}${learnedText}${rulesText}`;
}

// ────────────────────────────────────────────────
// Claude 호출
// ────────────────────────────────────────────────
async function generateReply(account, text, extraRules, learned) {
  const systemPrompt = buildPrompt(account, text, extraRules, learned);
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system: systemPrompt,
    messages: [{ role: 'user', content: `댓글: "${text}"` }],
  });
  return res.content[0]?.text?.trim() || '';
}

// ────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────
export default async function handler(req, res) {
  if (!process.env.ZERNIO_API_KEY) return res.status(500).json({ error: 'ZERNIO_API_KEY not set' });

  // GET: 미답변 목록 조회
  if (req.method === 'GET') {
    try {
      const [comments, messages] = await Promise.all([
        zFetch('/inbox/comments?status=unanswered&limit=30'),
        zFetch('/inbox/messages?status=unanswered&limit=15'),
      ]);
      return res.status(200).json({
        comments: comments.comments || comments || [],
        messages: messages.messages || messages || [],
      });
    } catch (error) {
      return res.status(200).json({ comments: [], messages: [], error: error.message });
    }
  }

  // POST: 자동 응대 실행
  if (req.method === 'POST') {
    try {
      const [commentsData, messagesData] = await Promise.all([
        zFetch('/inbox/comments?status=unanswered&limit=30'),
        zFetch('/inbox/messages?status=unanswered&limit=15'),
      ]);

      const comments = Array.isArray(commentsData.comments || commentsData)
        ? (commentsData.comments || commentsData) : [];
      const messages = Array.isArray(messagesData.messages || messagesData)
        ? (messagesData.messages || messagesData) : [];

      const results = { replied: 0, skipped: 0, noAccount: 0, dmReplied: 0, dmSkipped: 0, errors: 0 };

      // ── 댓글 처리 ──
      for (const c of comments) {
        try {
          const username = c.accountUsername || c.account?.username || '';
          const account = detectAccountKey(username);

          if (!account) {
            console.warn(`[Inbox] 계정 식별 실패: username="${username}" → skip`);
            results.noAccount++;
            continue;
          }

          // autoComment 토글 확인
          const settings = await getSettings(account);
          if (!settings.autoComment) {
            console.log(`[Inbox] autoComment OFF (${account}) → skip`);
            results.skipped++;
            continue;
          }

          const text = c.text || c.content || '';
          const [extraRules, learned] = await Promise.all([
            getEnabledRules(account),
            getLearnedPersona(account),
          ]);

          const reply = await generateReply(account, text, extraRules, learned);
          if (reply === 'SKIP' || !reply) { results.skipped++; continue; }

          await zFetch(`/inbox/comments/${c._id || c.id}/reply`, {
            method: 'POST',
            body: JSON.stringify({ text: reply }),
          });
          await logCount('comment', account);
          console.log(`[Inbox][${account}] 댓글 답글: "${reply.substring(0, 40)}"`);
          results.replied++;
        } catch (e) {
          console.error('[Inbox] comment error:', e.message);
          results.errors++;
        }
      }

      // ── DM 처리 ──
      for (const m of messages) {
        try {
          const username = m.accountUsername || m.account?.username || '';
          const account = detectAccountKey(username);

          if (!account) {
            console.warn(`[Inbox] DM 계정 식별 실패: username="${username}" → skip`);
            results.noAccount++;
            continue;
          }

          // autoDm 토글 확인
          const settings = await getSettings(account);
          if (!settings.autoDm) {
            console.log(`[Inbox] autoDm OFF (${account}) → skip`);
            results.dmSkipped++;
            continue;
          }

          const text = m.text || m.content || '';
          const [extraRules, learned] = await Promise.all([
            getEnabledRules(account),
            getLearnedPersona(account),
          ]);

          const reply = await generateReply(account, text, extraRules, learned);
          if (reply === 'SKIP' || !reply) { results.dmSkipped++; continue; }

          await zFetch(`/inbox/messages/${m._id || m.id}/reply`, {
            method: 'POST',
            body: JSON.stringify({ text: reply }),
          });
          await logCount('dm', account);
          console.log(`[Inbox][${account}] DM 답장: "${reply.substring(0, 40)}"`);
          results.dmReplied++;
        } catch (e) {
          console.error('[Inbox] dm error:', e.message);
          results.errors++;
        }
      }

      return res.status(200).json({ success: true, ...results, timestamp: new Date().toISOString() });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

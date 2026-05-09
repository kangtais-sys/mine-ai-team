import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const SPAM = ['팔로우', '맞팔', 'follow', 'http://', 'https://', '홍보', 'dm주세요', '선팔', '광고'];
const OY_SALE_KEYWORDS = ['올영세일', '올리브영세일', '올영 세일', '올리브영 할인'];

// ────────────────────────────────────────────────
// 계정 식별 — IG Business Account ID 기준 (섞임 방지)
// ────────────────────────────────────────────────
function detectAccount(entryId) {
  const ymId = process.env.IG_USER_ID_YUMINHYE;
  const mmId = process.env.IG_USER_ID_MILLIMILLI || process.env.IG_USER_ID;
  if (ymId && entryId === ymId) return 'yuminhye';
  if (mmId && entryId === mmId) return 'millimilli';
  console.warn(`[Meta] Unknown entryId: ${entryId} (ymId=${ymId}, mmId=${mmId})`);
  return null; // 식별 불가 → 처리 거부
}

async function getToken() {
  return (await redis.get('instagram_access_token').catch(() => null)) || process.env.INSTAGRAM_ACCESS_TOKEN;
}

// ────────────────────────────────────────────────
// 설정 & 규칙 & 페르소나
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

// ────────────────────────────────────────────────
// 프롬프트 — 계정별 완전 분리, learned 데이터 반영
// ────────────────────────────────────────────────
function buildPrompt(account, text, extraRules = [], learned = null) {
  const rulesText = extraRules.length > 0
    ? `\n\n[컨텍스트 규칙 — 반드시 준수]\n${extraRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';

  const learnedText = learned?.learned
    ? `\n\n[학습된 채널 특성]\n- 주요 주제: ${(learned.learned.mainTopics || []).join(', ')}\n- 말투: ${learned.learned.toneInsights || ''}\n- 참여 유발 요소: ${(learned.learned.commentTriggers || []).join(', ')}`
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
  const isOYSale = OY_SALE_KEYWORDS.some(k => (text || '').includes(k));
  const purchaseGuide = isOYSale
    ? '현재 올영세일 기간! 올리브영에서 구매 적극 추천.'
    : '구매 추천: 1) 자사몰 https://millimilli.official (혜택 최고) 2) 스마트스토어 3) 올리브영.';

  return `당신은 밀리밀리(MILLIMILLI) 500달톤 K뷰티 브랜드 SNS 담당자입니다. 절대 개인 인플루언서처럼 응대하면 안 됩니다.
이모지 1-2개, 2문장 이내. 가격 직접 언급 금지. 악성/스팸이면 SKIP만 반환.
일본어 댓글 → 일본어 / 영어 → 영어로 답변.
제품/성분 문의 → 간단 답변 + "카카오채널 @밀리밀리에서 자세히 안내드릴게요 🫶"
칭찬 → 진심 어린 감사.
${purchaseGuide}
${isOYSale ? '올영세일 언급 시 → "지금 올영세일 기간이면 올리브영에서 득템하세요! 🍀"' : '구매 문의 시 → "프로필 링크에서 자사몰 바로 가실 수 있어요! 혜택이 쏠쏠해요 🛍️"'}
스마트스토어 물어보면 → "네이버 스마트스토어에서 밀리밀리 검색하시면 됩니다 😊"${learnedText}${rulesText}`;
}

// ────────────────────────────────────────────────
// Claude 호출
// ────────────────────────────────────────────────
async function callClaude(systemPrompt, userText) {
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
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
  const data = await claudeRes.json();
  return data.content?.[0]?.text?.trim() || '';
}

// ────────────────────────────────────────────────
// 로깅
// ────────────────────────────────────────────────
async function logAction(type, account, data) {
  // type: 'comment' | 'dm'
  const logKey = `channel:auto:${type}:logs:${account}`;
  const countKey = `channel:auto:count:${type}:${account}`;
  await Promise.all([
    redis.lpush(logKey, JSON.stringify({ ...data, timestamp: new Date().toISOString() })),
    redis.ltrim(logKey, 0, 199),
    redis.incr(countKey),
  ]);
}

// ────────────────────────────────────────────────
// Own handles per account
// ────────────────────────────────────────────────
const OWN_HANDLES = {
  millimilli: new Set(['millimilli.official', 'millimilli_official', 'millimilli']),
  yuminhye: new Set(['lala_lounge_', 'yuminhye', '0.8l_yuminhye']),
};

// ────────────────────────────────────────────────
// Webhook handler
// ────────────────────────────────────────────────
export default async function handler(req, res) {
  // GET: Meta webhook verification
  if (req.method === 'GET') {
    const qs = (req.url || '').includes('?') ? req.url.split('?')[1] : '';
    const params = Object.fromEntries(new URLSearchParams(qs));
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = params;
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'millimilli2024secret';

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[Meta] Webhook verified!');
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).end(String(challenge));
    }
    return res.status(403).end('Forbidden');
  }

  // POST: Receive webhook events
  if (req.method === 'POST') {
    const body = req.body;
    res.status(200).json({ received: true }); // Meta는 5초 내 200 필요

    if (body.object !== 'instagram') return;

    const igToken = await getToken();
    if (!igToken) { console.error('[Meta] No Instagram token'); return; }

    for (const entry of (body.entry || [])) {
      // 계정 식별 실패 시 처리 거부 (섞임 방지)
      const account = detectAccount(entry.id);
      if (!account) {
        console.error(`[Meta] entryId ${entry.id} 계정 매핑 실패 — 처리 거부`);
        continue;
      }

      for (const change of (entry.changes || [])) {
        // ── 댓글 자동응대 ──
        if (change.field === 'comments' && change.value) {
          const { id: commentId, text, from } = change.value;
          if (!commentId || !text) continue;

          const settings = await getSettings(account);
          if (!settings.autoComment) {
            console.log(`[Meta][${account}] autoComment OFF → skip`);
            continue;
          }

          // 중복 방지 (24h)
          const dupeKey = `ig:replied:comment:${commentId}`;
          if (await redis.get(dupeKey)) { console.log(`[Meta] 중복 skip: ${commentId}`); continue; }
          await redis.set(dupeKey, true, { ex: 86400 });

          // 스팸 필터
          if (SPAM.some(k => text.toLowerCase().includes(k))) {
            console.log(`[Meta][${account}] 스팸 skip: "${text.substring(0, 30)}"`);
            continue;
          }

          // 자기 댓글 필터
          if (OWN_HANDLES[account]?.has(from?.username)) continue;

          try {
            const [extraRules, learned] = await Promise.all([
              getEnabledRules(account),
              getLearnedPersona(account),
            ]);

            const systemPrompt = buildPrompt(account, text, extraRules, learned);
            const reply = await callClaude(systemPrompt, `댓글: "${text}"`);

            if (!reply || reply === 'SKIP') {
              console.log(`[Meta][${account}] SKIP: "${text.substring(0, 30)}"`);
              continue;
            }

            const replyRes = await fetch(
              `https://graph.instagram.com/v21.0/${commentId}/replies`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: reply, access_token: igToken }),
              }
            );
            const success = replyRes.ok;
            if (success) {
              console.log(`[Meta][${account}] 댓글 답글 전송: "${reply.substring(0, 40)}"`);
            } else {
              const err = await replyRes.json();
              console.error(`[Meta][${account}] 댓글 답글 실패:`, err.error?.message);
            }

            await logAction('comment', account, {
              commentId, author: from?.username,
              text: text.substring(0, 100), reply, success,
            });
          } catch (err) {
            console.error(`[Meta][${account}] 댓글 처리 오류:`, err.message);
          }
        }

        // ── DM 자동응대 (messaging 이벤트) ──
        if (change.field === 'messages' && change.value) {
          const msg = change.value;
          const senderId = msg.sender?.id;
          const text = msg.message?.text;
          if (!text || !senderId) continue;

          // 자기 메시지 필터 (senderId가 IG 비즈니스 계정 ID면 skip)
          const selfId = account === 'yuminhye'
            ? process.env.IG_USER_ID_YUMINHYE
            : (process.env.IG_USER_ID_MILLIMILLI || process.env.IG_USER_ID);
          if (senderId === selfId) continue;

          const settings = await getSettings(account);
          if (!settings.autoDm) {
            console.log(`[Meta][${account}] autoDm OFF → skip`);
            continue;
          }

          // 중복 방지
          const dupeKey = `ig:replied:dm:${senderId}:${Date.now().toString().slice(0, -4)}`;
          if (await redis.get(dupeKey)) continue;
          await redis.set(dupeKey, true, { ex: 3600 });

          try {
            const [extraRules, learned] = await Promise.all([
              getEnabledRules(account),
              getLearnedPersona(account),
            ]);

            const dmPrompt = buildPrompt(account, text, extraRules, learned);
            const reply = await callClaude(dmPrompt, `DM: "${text}"`);

            if (!reply || reply === 'SKIP') continue;

            // Instagram Messaging API로 DM 답장
            const dmRes = await fetch(
              `https://graph.instagram.com/v21.0/${selfId}/messages`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  recipient: { id: senderId },
                  message: { text: reply },
                  access_token: igToken,
                }),
              }
            );
            const success = dmRes.ok;
            if (success) {
              console.log(`[Meta][${account}] DM 답장 전송: "${reply.substring(0, 40)}"`);
            } else {
              const err = await dmRes.json();
              console.error(`[Meta][${account}] DM 답장 실패:`, err.error?.message);
            }

            await logAction('dm', account, {
              senderId, text: text.substring(0, 100), reply, success,
            });
          } catch (err) {
            console.error(`[Meta][${account}] DM 처리 오류:`, err.message);
          }
        }
      }
    }
    return;
  }

  return res.status(405).end('Method not allowed');
}

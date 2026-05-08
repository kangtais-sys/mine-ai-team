import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const SPAM = ['팔로우', '맞팔', 'follow', 'http://', 'https://', '홍보', 'dm주세요', '선팔', '광고'];
const OY_SALE_KEYWORDS = ['올영세일', '올리브영세일', '올영 세일', '올리브영 할인'];

// Map IG Business Account ID → our account key
function detectAccount(entryId) {
  const ymId = process.env.IG_USER_ID_YUMINHYE;
  const mmId = process.env.IG_USER_ID_MILLIMILLI || process.env.IG_USER_ID;
  if (ymId && entryId === ymId) return 'yuminhye';
  if (mmId && entryId === mmId) return 'millimilli';
  // Fallback: assume millimilli if only one ID configured
  return mmId ? 'millimilli' : 'millimilli';
}

async function getToken() {
  return (await redis.get('instagram_access_token').catch(() => null)) || process.env.INSTAGRAM_ACCESS_TOKEN;
}

async function isAutoCommentEnabled(account) {
  const settings = await redis.get(`channel:settings:${account}`).catch(() => null);
  return settings?.autoComment === true;
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

function getMilliPrompt(commentText, extraRules = []) {
  const isOYSale = OY_SALE_KEYWORDS.some(k => (commentText || '').includes(k));
  const purchaseGuide = isOYSale
    ? '현재 올영세일 기간! 올리브영에서 구매 적극 추천.'
    : '구매 추천: 1) 자사몰 https://millimilli.official (혜택 최고) 2) 스마트스토어 3) 올리브영.';

  const rulesText = extraRules.length > 0
    ? `\n\n[추가 컨텍스트 규칙]\n${extraRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';

  return `당신은 밀리밀리(MILLIMILLI) 500달톤 K뷰티 브랜드 SNS 담당자입니다.
이모지 1-2개, 2문장 이내. 가격 직접 언급 금지. 악성/스팸이면 SKIP만 반환.
일본어 댓글 → 일본어 / 영어 → 영어로 답변.
제품/성분 문의 → 간단 답변 + "카카오채널 @밀리밀리에서 자세히 안내드릴게요 🫶"
칭찬 → 진심 어린 감사.
${purchaseGuide}
${isOYSale ? '올영세일 언급 시 → "지금 올영세일 기간이면 올리브영에서 득템하세요! 🍀"' : '구매 문의 시 → "프로필 링크에서 자사몰 바로 가실 수 있어요! 혜택이 쏠쏠해요 🛍️"'}
스마트스토어 물어보면 → "네이버 스마트스토어에서 밀리밀리 검색하시면 됩니다 😊"${rulesText}`;
}

function getYumiPrompt(commentText, extraRules = []) {
  const rulesText = extraRules.length > 0
    ? `\n\n[추가 컨텍스트 규칙]\n${extraRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';

  return `당신은 인플루언서 유민혜(@lala_lounge_)입니다. 팔로워에게 친근한 언니처럼 댓글을 답니다.
이모지 1-2개, 1-2문장. 악성/스팸이면 SKIP만 반환.
말투: 반말 또는 가벼운 존댓말, 친근하고 따뜻하게.
칭찬/공감 → 진심 어린 리액션.
뷰티/스킨케어 질문 → 개인적인 경험 공유하듯 답변.
개인 연락 요청/광고 → SKIP.${rulesText}`;
}

async function logAutoComment(account, data) {
  const logKey = `channel:auto:comment:logs:${account}`;
  const countKey = `channel:auto:count:comment:${account}`;
  await Promise.all([
    redis.lpush(logKey, JSON.stringify({ ...data, timestamp: new Date().toISOString() })),
    redis.ltrim(logKey, 0, 199),
    redis.incr(countKey),
  ]);
}

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
    res.status(200).json({ received: true }); // Respond immediately

    if (body.object !== 'instagram') return;

    const igToken = await getToken();
    if (!igToken) { console.error('[Meta] No Instagram token'); return; }

    for (const entry of (body.entry || [])) {
      const account = detectAccount(entry.id);

      for (const change of (entry.changes || [])) {
        if (change.field === 'comments' && change.value) {
          const { id: commentId, text, from } = change.value;
          if (!commentId || !text) continue;

          // Check auto-comment toggle
          const enabled = await isAutoCommentEnabled(account);
          if (!enabled) {
            console.log(`[Meta] Auto-comment OFF for ${account}, skipping`);
            continue;
          }

          // Skip duplicates (24h TTL)
          const dupeKey = `ig:replied:${commentId}`;
          const alreadyDone = await redis.get(dupeKey);
          if (alreadyDone) { console.log(`[Meta] Duplicate skip: ${commentId}`); continue; }
          await redis.set(dupeKey, true, { ex: 86400 });

          // Skip spam
          if (SPAM.some(k => text.toLowerCase().includes(k))) {
            console.log(`[Meta] Skipped spam: "${text.substring(0, 30)}"`);
            continue;
          }

          // Skip own comments
          const ownHandles = account === 'millimilli'
            ? ['millimilli.official', 'millimilli_official']
            : ['lala_lounge_', 'yuminhye'];
          if (ownHandles.includes(from?.username)) continue;

          try {
            // Get enabled context rules for this account
            const extraRules = await getEnabledRules(account);

            // Build prompt based on account
            const systemPrompt = account === 'yuminhye'
              ? getYumiPrompt(text, extraRules)
              : getMilliPrompt(text, extraRules);

            // Generate reply with Claude
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
                messages: [{ role: 'user', content: `댓글: "${text}"` }],
              }),
            });

            const claudeData = await claudeRes.json();
            const reply = claudeData.content?.[0]?.text?.trim();

            if (!reply || reply === 'SKIP') {
              console.log(`[Meta] Claude skipped: "${text.substring(0, 30)}"`);
              continue;
            }

            // Post reply via Instagram Graph API
            const replyRes = await fetch(
              `https://graph.instagram.com/v21.0/${commentId}/replies`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: reply, access_token: igToken }),
              }
            );
            const replyData = await replyRes.json();
            const success = replyRes.ok;

            if (success) {
              console.log(`[Meta][${account}] Reply sent: "${reply.substring(0, 40)}"`);
            } else {
              console.error(`[Meta][${account}] Reply failed:`, replyData.error?.message);
            }

            // Log to account-specific history
            await logAutoComment(account, {
              commentId,
              author: from?.username,
              text: text.substring(0, 100),
              reply,
              success,
            });

          } catch (err) {
            console.error(`[Meta][${account}] Comment processing error:`, err.message);
          }
        }
      }
    }
    return;
  }

  return res.status(405).end('Method not allowed');
}

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

/*
  Zernio webhook payload (verified from KV logs):
  {
    "id": "uuid",
    "event": "comment.received",
    "comment": {
      "id": "17941195059015866",        // Instagram comment ID
      "platformPostId": "17882992845506869",
      "platform": "instagram",
      "text": "소울푸드 돈까스",
      "author": { "id": "...", "username": "lala_lounge_" },
      "isReply": false
    },
    "account": {
      "id": "69d08dbbbf4d9161df5463f1",  // Zernio account ID
      "platform": "instagram",
      "username": "millimilli.official"
    }
  }
*/

// Zernio account ID → persona mapping
const ACCOUNT_PERSONA = {
  '69d08dbbbf4d9161df5463f1': 'millimilli',  // @millimilli.official IG
  '69d08d11bf4d9161df546260': 'millimilli',  // @millimilli.official TT
  '69d08d8bbf4d9161df54637a': 'millimilli',  // @유민혜-z2r YT (밀리밀리 프로필)
  '69d08abdbf4d9161df545c4b': 'yuminhye',   // @peerstory TT
  '69d08acebf4d9161df545c66': 'yuminhye',   // @15초유민혜 YT
};

const SPAM = ['팔로우', '맞팔', 'follow', 'http://', 'https://', '홍보', 'dm주세요', '선팔'];

const OY_SALE_KEYWORDS = ['올영세일', '올리브영세일', '올영 세일', '올리브영 할인'];

function getPrompt(persona, platform, messageText) {
  const isOYSale = OY_SALE_KEYWORDS.some(k => (messageText || '').includes(k));
  const purchaseGuide = isOYSale
    ? '현재 올영세일 기간! 올리브영 추천. "지금 올영세일 기간이면 올리브영에서 득템하세요! 🍀"'
    : '구매 추천: 1) 자사몰 (혜택 최고) 2) 스마트스토어 3) 올리브영. "프로필 링크에서 자사몰 바로 가실 수 있어요! 🛍️"';

  const base = '가격 직접 언급 금지. 악성/스팸이면 SKIP만 반환.';

  // 밀리밀리 + 플랫폼별
  if (persona === 'millimilli') {
    if (platform === 'youtube') return `당신은 밀리밀리 유튜브 채널 담당자입니다. 500달톤 초저분자 단백질 화장품 브랜드. 영상 내용에 공감하며 따뜻하게 답글. 제품 문의 → 자사몰 또는 카카오채널 @밀리밀리. 2문장 이내, 이모지 1-2개. ${purchaseGuide} ${base}`;
    if (platform === 'tiktok') return `당신은 밀리밀리 틱톡 채널 담당자입니다. 500달톤 초저분자 단백질 화장품. 틱톡 특유의 밝고 캐주얼한 말투! 짧고 임팩트 있게, 이모지 적극 활용. 제품 문의 → 프로필 링크 또는 카카오채널 @밀리밀리. 1-2문장. ${purchaseGuide} ${base}`;
    // instagram (default)
    return `당신은 밀리밀리 브랜드 SNS 담당자입니다. 500달톤 초저분자 단백질 화장품 전문가. 이모지 1-2개, 2문장 이내. 제품/성분 문의 → "카카오채널 @밀리밀리에서 자세히 안내드릴게요 🫶" ${purchaseGuide} 스마트스토어 문의 → "네이버에서 밀리밀리 검색하시면 됩니다 😊" ${base}`;
  }

  // 유민혜 + 플랫폼별
  if (platform === 'youtube') return `당신은 유민혜 유튜브 크리에이터입니다. 영상 봐줘서 진심 감사한 마음으로 따뜻하게. 시청자와 소통하는 느낌. 제품 관련 → @millimilli.official 안내. 2문장 이내, 친근하게. ${base}`;
  if (platform === 'tiktok') return `당신은 유민혜 틱톡 크리에이터입니다. 짧고 임팩트 있는 답글. 팔로워와 친근하게 소통. 제품 관련 → @millimilli.official 안내. 1-2문장, 밝고 캐주얼. ${base}`;
  return `당신은 유민혜 인플루언서입니다. 친근하고 따뜻한 크리에이터 말투. 이모지 자연스럽게. 2문장 이내. 제품 관련은 "@millimilli.official 에서 확인해주세요!" ${base}`;
}

async function getInstagramToken() {
  // Try Zernio account token first, then fall back to env
  // Zernio handles OAuth so we use their token via the accounts API
  const key = process.env.ZERNIO_API_KEY;
  if (!key) return process.env.INSTAGRAM_ACCESS_TOKEN;

  try {
    const res = await fetch('https://zernio.com/api/v1/accounts', {
      headers: { 'Authorization': `Bearer ${key}` },
    });
    const data = await res.json();
    const igAccount = (data.accounts || []).find(
      a => a.username === 'millimilli.official' && a.platform === 'instagram'
    );
    // Zernio doesn't expose raw IG tokens in API response
    // Use the token from env var if available
    return process.env.INSTAGRAM_ACCESS_TOKEN;
  } catch {
    return process.env.INSTAGRAM_ACCESS_TOKEN;
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', handler: 'zernio-webhook' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('[Webhook] Received:', JSON.stringify(req.body, null, 2));
  try { await redis.lpush('webhook-raw', JSON.stringify({ timestamp: new Date().toISOString(), body: req.body })); } catch {}

  const { event, comment, message, account } = req.body;

  try {
    // ─── Comment Reply ───
    if (event === 'comment.received' && comment) {
      const text = comment.text || '';
      const commentId = comment.id;
      const accountId = account?.id || '';
      const accountUsername = account?.username || '';
      const platform = account?.platform || comment.platform || 'instagram';

      // Skip duplicates (24h TTL)
      const dupeKey = `replied:${platform}:${commentId}`;
      const alreadyProcessed = await redis.get(dupeKey);
      if (alreadyProcessed) {
        return res.status(200).json({ skipped: true, reason: 'duplicate' });
      }
      await redis.set(dupeKey, true, { ex: 86400 });

      // Skip own replies, spam, and reply comments
      if (comment.isReply) return res.status(200).json({ skipped: true, reason: 'is_reply' });
      if (comment.author?.username === accountUsername) return res.status(200).json({ skipped: true, reason: 'self' });
      if (SPAM.some(k => text.toLowerCase().includes(k))) return res.status(200).json({ skipped: true, reason: 'spam' });

      const persona = ACCOUNT_PERSONA[accountId] || 'millimilli';
      console.log(`[DEBUG] comment.received → platform=${platform}, commentId=${commentId}, accountId=${accountId}, persona=${persona}, isReply=${comment.isReply}, author=${comment.author?.username}`);

      // Generate reply with Claude
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          system: getPrompt(persona, platform, text),
          messages: [{ role: 'user', content: `댓글: "${text}"` }],
        }),
      });
      const claudeData = await claudeRes.json();
      const reply = claudeData.content?.[0]?.text?.trim();

      if (!reply || reply === 'SKIP') return res.status(200).json({ skipped: true, reason: 'filtered' });

      // Reply via Zernio unified API (works for all platforms)
      // Webhook provides platform comment ID, not Zernio _id → use flat endpoint
      let replyStatus = 'unsupported';

      try {
        const zRes = await fetch('https://zernio.com/api/v1/inbox/comments/reply', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ commentId, message: reply, accountId }),
        });
        const zData = await zRes.json();
        replyStatus = zRes.ok ? 'sent' : `zernio_error:${zData.error || zRes.status}`;
        console.log(`[${platform}] Zernio reply: ${replyStatus}`, JSON.stringify(zData));
      } catch (e) {
        replyStatus = `exception:${e.message}`;
        console.error(`[${platform}] Zernio reply exception:`, e.message);
        // Fallback for Instagram: try IG Graph API
        if (platform === 'instagram') {
          const igToken = await getInstagramToken();
          if (igToken) {
            try {
              const igRes = await fetch(`https://graph.instagram.com/v21.0/${commentId}/replies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: reply, access_token: igToken }),
              });
              replyStatus = igRes.ok ? 'sent_ig_fallback' : `ig_fallback_error:${igRes.status}`;
            } catch (e2) { replyStatus = `ig_fallback_exception:${e2.message}`; }
          }
        }
      }

      console.log(`[${platform}] ${persona} 댓글 응대: "${reply.substring(0, 40)}" → ${replyStatus}`);

      // KV stats + activity log
      if (replyStatus.startsWith('sent')) {
        const today = new Date().toISOString().slice(0, 10);
        const platLabel = platform === 'instagram' ? '인스타' : platform === 'youtube' ? '유튜브' : '틱톡';
        await Promise.all([
          redis.incr('stat:comment:total'),
          redis.incr(`stat:comment:${platform}:${today}`),
          redis.lpush('activity:log', JSON.stringify({
            agent: 'AI 커뮤니티', action: `${platLabel} 댓글 자동 답글`,
            detail: `@${comment.author?.username}의 댓글에 답글`, timestamp: Date.now(),
          })),
        ]);
        await redis.ltrim('activity:log', 0, 49);
      }

      await redis.lpush('webhook-logs', JSON.stringify({
        type: 'comment', commentId, author: comment.author?.username, text: text.substring(0, 50),
        reply, replyStatus, persona, platform, timestamp: new Date().toISOString(),
      }));

      return res.status(200).json({ success: replyStatus.startsWith('sent'), reply, replyStatus });
    }

    // ─── DM Reply via Zernio Inbox API ───
    if (event === 'message.received' && message) {
      const text = message.text || message.message || '';
      const messageId = message.id || req.body.id;
      const accountId = account?.id || '';
      const platform = account?.platform || message.platform || 'instagram';
      const conversationId = message.conversationId || req.body.conversationId || message.participantId;

      // Skip duplicates
      const dmDupeKey = `dm:replied:${messageId}`;
      const dmAlready = await redis.get(dmDupeKey);
      if (dmAlready) return res.status(200).json({ skipped: true, reason: 'duplicate' });
      await redis.set(dmDupeKey, true, { ex: 86400 });

      const persona = ACCOUNT_PERSONA[accountId] || 'millimilli';

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          system: getPrompt(persona, platform, text),
          messages: [{ role: 'user', content: `DM: "${text}"` }],
        }),
      });
      const claudeData = await claudeRes.json();
      const reply = claudeData.content?.[0]?.text?.trim();

      if (!reply || reply === 'SKIP') return res.status(200).json({ skipped: true });

      // Send via Zernio Inbox Conversations API
      let replyStatus = 'no_conversation';
      if (conversationId && accountId) {
        try {
          const dmRes = await fetch(
            `https://zernio.com/api/v1/inbox/conversations/${conversationId}/messages`,
            {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: reply, accountId }),
            }
          );
          const dmData = await dmRes.json();
          replyStatus = dmRes.ok ? 'sent' : `error:${dmData.error || dmRes.status}`;
          console.log(`[Zernio DM] ${conversationId}: ${replyStatus}`);
        } catch (e) {
          replyStatus = `exception:${e.message}`;
        }
      } else {
        // Fallback: try with participantId as conversationId
        const fallbackId = message.author?.id || message.from?.id;
        if (fallbackId) {
          try {
            const dmRes = await fetch(
              `https://zernio.com/api/v1/inbox/conversations/${fallbackId}/messages`,
              {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: reply, accountId }),
              }
            );
            replyStatus = dmRes.ok ? 'sent_fallback' : `fallback_error:${dmRes.status}`;
          } catch (e) {
            replyStatus = `fallback_exception:${e.message}`;
          }
        }
      }

      // KV stats + activity log
      if (replyStatus.startsWith('sent')) {
        const today = new Date().toISOString().slice(0, 10);
        await Promise.all([
          redis.incr('stat:dm:total'),
          redis.incr(`stat:dm:${today}`),
          redis.lpush('activity:log', JSON.stringify({
            agent: 'AI 커뮤니티', action: 'DM 자동 응대',
            detail: `${platform} DM 응대`, timestamp: Date.now(),
          })),
        ]);
        await redis.ltrim('activity:log', 0, 49);
      }

      await redis.lpush('webhook-logs', JSON.stringify({
        type: 'dm', messageId, text: text.substring(0, 50), reply, persona,
        replyStatus, conversationId, timestamp: new Date().toISOString(),
      }));

      return res.status(200).json({ success: replyStatus.startsWith('sent'), reply, replyStatus });
    }

    return res.status(200).json({ received: true, event });
  } catch (error) {
    console.error('[Webhook Error]', error.message);
    return res.status(200).json({ error: error.message });
  }
}

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
  '69d08d8bbf4d9161df54637a': 'millimilli',  // @choi_jacob YT
  '69d08abdbf4d9161df545c4b': 'yuminhye',   // @peerstory TT
  '69d08acebf4d9161df545c66': 'yuminhye',   // @유민혜 YT
};

const SPAM = ['팔로우', '맞팔', 'follow', 'http://', 'https://', '홍보', 'dm주세요', '선팔'];

const PROMPTS = {
  millimilli: `당신은 밀리밀리 브랜드 SNS 담당자입니다. 500달톤 초저분자 단백질 화장품 전문가. 이모지 1-2개, 2문장 이내. 제품/성분 문의 → "카카오채널 @밀리밀리에서 자세히 안내드릴게요 🫶" 구매/이벤트 → "프로필 링크에서 확인해주세요 ✨" 가격 직접 언급 금지. 악성/스팸이면 SKIP만 반환.`,
  yuminhye: `당신은 유민혜 인플루언서입니다. 친근하고 따뜻한 크리에이터 말투. 이모지 자연스럽게. 2문장 이내. 제품 관련은 "@millimilli.official 에서 확인해주세요!" 악성/스팸이면 SKIP만 반환.`,
};

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
      const dupeKey = `replied:${commentId}`;
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

      // Generate reply with Claude
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          system: PROMPTS[persona],
          messages: [{ role: 'user', content: `댓글: "${text}"` }],
        }),
      });
      const claudeData = await claudeRes.json();
      const reply = claudeData.content?.[0]?.text?.trim();

      if (!reply || reply === 'SKIP') return res.status(200).json({ skipped: true, reason: 'filtered' });

      // Reply via Instagram Graph API (Zernio doesn't have reply API)
      let replyStatus = 'no_token';
      const igToken = await getInstagramToken();
      if (igToken && platform === 'instagram') {
        try {
          const igRes = await fetch(
            `https://graph.instagram.com/v21.0/${commentId}/replies`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: reply, access_token: igToken }),
            }
          );
          const igData = await igRes.json();
          replyStatus = igRes.ok ? 'sent' : `ig_error:${igData.error?.message || igRes.status}`;
          console.log(`[IG Reply] ${commentId}: ${replyStatus}`);
        } catch (e) {
          replyStatus = `ig_exception:${e.message}`;
        }
      } else {
        replyStatus = platform !== 'instagram' ? `${platform}_not_supported` : 'no_ig_token';
      }

      await redis.lpush('webhook-logs', JSON.stringify({
        type: 'comment', commentId, author: comment.author?.username, text: text.substring(0, 50),
        reply, replyStatus, persona, platform, timestamp: new Date().toISOString(),
      }));

      return res.status(200).json({ success: replyStatus === 'sent', reply, replyStatus });
    }

    // ─── DM Reply ───
    if (event === 'message.received' && message) {
      const text = message.text || '';
      const messageId = message.id;
      const accountId = account?.id || '';
      const persona = ACCOUNT_PERSONA[accountId] || 'millimilli';

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          system: PROMPTS[persona],
          messages: [{ role: 'user', content: `DM: "${text}"` }],
        }),
      });
      const claudeData = await claudeRes.json();
      const reply = claudeData.content?.[0]?.text?.trim();

      if (!reply || reply === 'SKIP') return res.status(200).json({ skipped: true });

      // DM reply would need IG Messaging API (requires approval)
      await redis.lpush('webhook-logs', JSON.stringify({
        type: 'dm', messageId, text: text.substring(0, 50), reply, persona,
        replyStatus: 'pending_manual', timestamp: new Date().toISOString(),
      }));

      return res.status(200).json({ success: true, reply, note: 'DM reply generated, manual send needed' });
    }

    return res.status(200).json({ received: true, event });
  } catch (error) {
    console.error('[Webhook Error]', error.message);
    return res.status(200).json({ error: error.message });
  }
}

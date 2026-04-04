import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { event, comment, message } = req.body;

  try {
    // 댓글 응대
    if (event === 'comment.received' && comment) {
      const commentText = comment.text || '';
      const commentId = comment.id;
      const profileId = comment.profileId;

      const spamKeywords = ['팔로우', '맞팔', 'follow', 'spam', '홍보'];
      if (spamKeywords.some(k => commentText.toLowerCase().includes(k.toLowerCase()))) {
        return res.status(200).json({ skipped: true, reason: 'spam' });
      }

      const isMillimilli = profileId === '69d08cc1986d57bb8f733102';
      const systemPrompt = isMillimilli
        ? `당신은 밀리밀리 브랜드 SNS 담당자입니다. 500달톤 초저분자 단백질 화장품 전문가로서 따뜻하고 친근하게 응대합니다. 이모지 1-2개, 2문장 이내. 제품/성분 문의 → 카카오채널 @밀리밀리 안내. 구매/이벤트 → 프로필 링크 안내. 가격 직접 언급 금지. 악성/광고 댓글이면 SKIP만 반환.`
        : `당신은 유민혜 인플루언서입니다. 친근하고 따뜻한 크리에이터 말투로 짧게 응대합니다. 이모지 자연스럽게. 악성/스팸이면 SKIP만 반환.`;

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          system: systemPrompt,
          messages: [{ role: 'user', content: `댓글: "${commentText}"` }],
        }),
      });

      const claudeData = await claudeRes.json();
      const reply = claudeData.content?.[0]?.text?.trim();

      if (!reply || reply === 'SKIP' || reply === 'null') {
        return res.status(200).json({ skipped: true, reason: 'filtered' });
      }

      await fetch(`https://zernio.com/api/v1/inbox/comments/${commentId}/reply`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: reply }),
      });

      await redis.lpush('webhook-logs', JSON.stringify({
        type: 'comment_reply', commentId, reply, timestamp: new Date().toISOString(),
      }));

      return res.status(200).json({ success: true, reply });
    }

    // DM 응대
    if (event === 'message.received' && message) {
      const messageText = message.text || '';
      const messageId = message.id;
      const profileId = message.profileId;

      const isMillimilli = profileId === '69d08cc1986d57bb8f733102';
      const systemPrompt = isMillimilli
        ? `밀리밀리 브랜드 DM 상담원. 따뜻하고 전문적으로. 제품 문의 → 카카오채널 @밀리밀리 안내. 구매 → 프로필 링크 안내. 3문장 이내. 가격 직접 언급 금지.`
        : `유민혜 인플루언서. 친근하게. 협찬문의는 이메일 안내. 2문장 이내.`;

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          system: systemPrompt,
          messages: [{ role: 'user', content: `DM: "${messageText}"` }],
        }),
      });

      const claudeData = await claudeRes.json();
      const reply = claudeData.content?.[0]?.text?.trim();

      if (!reply || reply === 'SKIP') {
        return res.status(200).json({ skipped: true });
      }

      await fetch(`https://zernio.com/api/v1/inbox/messages/${messageId}/reply`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: reply }),
      });

      await redis.lpush('webhook-logs', JSON.stringify({
        type: 'dm_reply', messageId, reply, timestamp: new Date().toISOString(),
      }));

      return res.status(200).json({ success: true, reply });
    }

    return res.status(200).json({ received: true, event });
  } catch (error) {
    console.error('[Zernio Webhook]', error.message);
    return res.status(200).json({ error: error.message });
  }
}

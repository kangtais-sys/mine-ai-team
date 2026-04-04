import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const SPAM = ['팔로우', '맞팔', 'follow', 'http://', 'https://', '홍보', 'dm주세요', '선팔', '광고'];

const MILLI_PROMPT = `당신은 밀리밀리(MILLIMILLI) 500달톤 K뷰티 브랜드 SNS 담당자입니다.
이모지 1-2개, 2문장 이내. 가격 직접 언급 금지.
제품/성분 문의 → "카카오채널 @밀리밀리에서 자세히 안내드릴게요 🫶"
구매/이벤트 → "프로필 링크에서 확인해주세요 ✨"
칭찬 → 진심 어린 감사.
악성/스팸 → SKIP만 반환.
일본어 댓글 → 일본어 / 영어 → 영어로 답변.`;

async function getToken() {
  // KV에 갱신된 토큰이 있으면 우선 사용
  const kvToken = await redis.get('instagram_access_token').catch(() => null);
  return kvToken || process.env.INSTAGRAM_ACCESS_TOKEN;
}

export default async function handler(req, res) {
  // GET: Meta webhook verification
  if (req.method === 'GET') {
    const qs = (req.url || '').includes('?') ? (req.url.split('?')[1]) : '';
    const params = Object.fromEntries(new URLSearchParams(qs));
    const mode = params['hub.mode'];
    const token = params['hub.verify_token'];
    const challenge = params['hub.challenge'];
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
    console.log('[Meta] Webhook event:', JSON.stringify(body, null, 2));

    // Immediately return 200 (Meta requires fast response)
    res.status(200).json({ received: true });

    if (body.object !== 'instagram') return;

    const igToken = await getToken();
    if (!igToken) { console.error('[Meta] No Instagram token'); return; }

    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        if (change.field === 'comments' && change.value) {
          const { id: commentId, text, from } = change.value;
          if (!commentId || !text) continue;

          // Skip spam
          if (SPAM.some(k => text.toLowerCase().includes(k))) {
            console.log(`[Meta] Skipped spam: "${text.substring(0, 30)}"`);
            continue;
          }

          // Skip own comments
          if (from?.username === 'millimilli.official') continue;

          try {
            // Generate reply with Claude
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
                system: MILLI_PROMPT,
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

            if (replyRes.ok) {
              console.log(`[Meta] Reply sent: "${reply.substring(0, 40)}" → ${replyData.id}`);
            } else {
              console.error(`[Meta] Reply failed:`, replyData.error?.message);
            }

            // Log to KV
            await redis.lpush('ig-comment-logs', JSON.stringify({
              commentId, author: from?.username, text: text.substring(0, 50),
              reply, success: replyRes.ok, timestamp: new Date().toISOString(),
            })).catch(() => {});

          } catch (err) {
            console.error(`[Meta] Comment processing error:`, err.message);
          }
        }
      }
    }
    return;
  }

  return res.status(405).end('Method not allowed');
}

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const SPAM = ['팔로우', '맞팔', 'follow', 'http://', 'https://', '홍보', 'dm주세요', '선팔', '광고'];

const OY_SALE_KEYWORDS = ['올영세일', '올리브영세일', '올영 세일', '올리브영 할인'];

function getMilliPrompt(commentText) {
  const isOYSale = OY_SALE_KEYWORDS.some(k => (commentText || '').includes(k));
  const purchaseGuide = isOYSale
    ? '현재 올영세일 기간! 올리브영에서 구매 적극 추천.'
    : '구매 추천: 1) 자사몰 https://millimilli.official (혜택 최고) 2) 스마트스토어 3) 올리브영. 자사몰 먼저 추천.';

  return `당신은 밀리밀리(MILLIMILLI) 500달톤 K뷰티 브랜드 SNS 담당자입니다.
이모지 1-2개, 2문장 이내. 가격 직접 언급 금지. 악성/스팸이면 SKIP만 반환.
일본어 댓글 → 일본어 / 영어 → 영어로 답변.
제품/성분 문의 → 간단 답변 + "카카오채널 @밀리밀리에서 자세히 안내드릴게요 🫶"
칭찬 → 진심 어린 감사.
${purchaseGuide}
${isOYSale ? '올영세일 언급 시 → "지금 올영세일 기간이면 올리브영에서 득템하세요! 🍀"' : '구매 문의 시 → "프로필 링크에서 자사몰 바로 가실 수 있어요! 혜택이 쏠쏠해서 자사몰 추천드려요 🛍️"'}
스마트스토어 물어보면 → "네이버 스마트스토어에서 밀리밀리 검색하시면 됩니다 😊"`;
}

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
                system: getMilliPrompt(text),
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

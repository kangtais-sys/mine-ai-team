import Anthropic from '@anthropic-ai/sdk';

const ZERNIO = 'https://zernio.com/api/v1';
const anthropic = new Anthropic();

const REPLY_PROMPT = `당신은 MILLIMILLI(밀리밀리) 500달톤 K뷰티 브랜드의 SNS 담당자입니다.

규칙:
- 이모지 1~2개, 2문장 이내
- 따뜻하고 자연스러운 톤 ("~요" 체)
- 상품문의 → 자연스럽게 답변 + "자세한 상담은 카카오채널 @밀리밀리에서 도와드릴게요!"
- 구매/이벤트 → "프로필 링크에서 확인해주세요 😊"
- 칭찬 → 감사 + 짧은 공감
- 악성/스팸/무의미 → "SKIP" 한 단어만 출력
- 일본어 댓글 → 일본어로 답변
- 영어 댓글 → 영어로 답변

제품 지식:
- 500달톤 프로틴 세럼 (₩29,000) - 저분자 콜라겐, 전 피부타입
- 프로틴 크림 (₩35,000) - 고보습, 건성/민감성
- 프로틴 토너 (₩22,000) - 정돈+수분, 모든 피부
- 프로틴 앰플 (₩38,000) - 집중 케어, 안티에이징`;

async function zernioFetch(path, opts = {}) {
  const res = await fetch(`${ZERNIO}${path}`, {
    ...opts,
    headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  return res.json();
}

async function generateReply(comment) {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system: REPLY_PROMPT,
    messages: [{ role: 'user', content: `댓글: "${comment}"` }],
  });
  return res.content[0]?.text?.trim() || '';
}

export default async function handler(req, res) {
  const apiKey = process.env.ZERNIO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ZERNIO_API_KEY not set' });

  // GET: fetch unanswered comments + messages
  if (req.method === 'GET') {
    try {
      const [comments, messages] = await Promise.all([
        zernioFetch('/inbox/comments?status=unanswered&limit=20'),
        zernioFetch('/inbox/messages?status=unanswered&limit=20'),
      ]);
      return res.status(200).json({ comments: comments.comments || comments, messages: messages.messages || messages });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // POST: auto-reply to all unanswered
  if (req.method === 'POST') {
    try {
      const [commentsData, messagesData] = await Promise.all([
        zernioFetch('/inbox/comments?status=unanswered&limit=30'),
        zernioFetch('/inbox/messages?status=unanswered&limit=15'),
      ]);

      const comments = commentsData.comments || commentsData || [];
      const messages = messagesData.messages || messagesData || [];
      const results = { replied: 0, skipped: 0, dmReplied: 0, errors: 0 };

      // Reply to comments
      for (const c of (Array.isArray(comments) ? comments : [])) {
        try {
          const reply = await generateReply(c.text || c.content || '');
          if (reply === 'SKIP' || !reply) { results.skipped++; continue; }
          await zernioFetch(`/inbox/comments/${c._id || c.id}/reply`, {
            method: 'POST',
            body: JSON.stringify({ text: reply }),
          });
          results.replied++;
        } catch { results.errors++; }
      }

      // Reply to DMs
      for (const m of (Array.isArray(messages) ? messages : [])) {
        try {
          const reply = await generateReply(m.text || m.content || '');
          if (reply === 'SKIP' || !reply) { results.skipped++; continue; }
          await zernioFetch(`/inbox/messages/${m._id || m.id}/reply`, {
            method: 'POST',
            body: JSON.stringify({ text: reply }),
          });
          results.dmReplied++;
        } catch { results.errors++; }
      }

      return res.status(200).json({ success: true, ...results, timestamp: new Date().toISOString() });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();
const ZERNIO = 'https://zernio.com/api/v1';
const zFetch = (path, opts = {}) => fetch(`${ZERNIO}${path}`, { ...opts, headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json', ...opts.headers } }).then(r => r.json());

const PROMPTS = {
  millimilli: `당신은 밀리밀리(MILLIMILLI) 500달톤 K뷰티 브랜드 SNS 담당자입니다.
규칙:
- 이모지 1-2개, 2문장 이내, 가격 직접 언급 금지
- 제품/성분 문의 → 아는 범위 답변 + "더 자세한 건 카카오채널 @밀리밀리 로 주세요 🫶"
- 구매/이벤트 → "프로필 링크에서 확인해 주세요 ✨"
- 칭찬/호감 → 진심 담은 감사
- 악성/스팸/무의미 → "SKIP" 한 단어만
- 일본어 → 일본어 / 영어 → 영어로
제품: 프로틴 세럼, 프로틴 크림, 프로틴 토너, 프로틴 앰플`,

  yuminhye: `당신은 유민혜 크리에이터의 SNS 응대 담당입니다.
규칙:
- 친근하고 따뜻한 크리에이터 말투 ("~요" 체)
- 이모지 1-2개, 2문장 이내
- 제품 관련 → "@millimilli.official 에서 확인해주세요!"
- 콘텐츠 관련 → 감사 + 간단 답변
- 악성/스팸 → "SKIP"`,
};

async function generateReply(text, persona) {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system: PROMPTS[persona] || PROMPTS.millimilli,
    messages: [{ role: 'user', content: `댓글: "${text}"` }],
  });
  return res.content[0]?.text?.trim() || '';
}

function getPersona(accountUsername) {
  if (accountUsername === 'millimilli.official') return 'millimilli';
  if (accountUsername === 'peerstory' || accountUsername === '유민혜-z2r') return 'yuminhye';
  return 'millimilli';
}

export default async function handler(req, res) {
  if (!process.env.ZERNIO_API_KEY) return res.status(500).json({ error: 'ZERNIO_API_KEY not set' });

  // GET: fetch unanswered
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

  // POST: auto-reply all
  if (req.method === 'POST') {
    try {
      const [commentsData, messagesData] = await Promise.all([
        zFetch('/inbox/comments?status=unanswered&limit=30'),
        zFetch('/inbox/messages?status=unanswered&limit=15'),
      ]);

      const comments = Array.isArray(commentsData.comments || commentsData) ? (commentsData.comments || commentsData) : [];
      const messages = Array.isArray(messagesData.messages || messagesData) ? (messagesData.messages || messagesData) : [];
      const results = { replied: 0, skipped: 0, dmReplied: 0, dmSkipped: 0, errors: 0 };

      for (const c of comments) {
        try {
          const persona = getPersona(c.accountUsername || c.account?.username || '');
          const reply = await generateReply(c.text || c.content || '', persona);
          if (reply === 'SKIP' || !reply) { results.skipped++; continue; }
          await zFetch(`/inbox/comments/${c._id || c.id}/reply`, { method: 'POST', body: JSON.stringify({ text: reply }) });
          results.replied++;
        } catch { results.errors++; }
      }

      for (const m of messages) {
        try {
          const persona = getPersona(m.accountUsername || m.account?.username || '');
          const reply = await generateReply(m.text || m.content || '', persona);
          if (reply === 'SKIP' || !reply) { results.dmSkipped++; continue; }
          await zFetch(`/inbox/messages/${m._id || m.id}/reply`, { method: 'POST', body: JSON.stringify({ text: reply }) });
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

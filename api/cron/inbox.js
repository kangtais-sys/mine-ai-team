import { Redis } from '@upstash/redis';
import Anthropic from '@anthropic-ai/sdk';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const anthropic = new Anthropic();

export const config = { maxDuration: 120 };

const ZERNIO = 'https://zernio.com/api/v1';
const zFetch = async (path, opts = {}) => {
  const r = await fetch(`${ZERNIO}${path}`, {
    ...opts,
    headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    console.warn(`[Inbox Cron] Zernio ${path} returned non-JSON (${r.status} ${ct})`);
    return {};
  }
  return r.json();
};

const PROMPTS = {
  millimilli: `당신은 밀리밀리(MILLIMILLI) 500달톤 K뷰티 브랜드 SNS 담당자입니다.
규칙:
- 이모지 1-2개, 2문장 이내, 가격 직접 언급 금지
- 제품/성분 문의 → 아는 범위 답변 + "더 자세한 건 카카오채널 @밀리밀리 로 주세요"
- 구매/이벤트 → "프로필 링크에서 확인해 주세요"
- 악성/스팸/무의미 → "SKIP" 한 단어만
- 일본어 → 일본어 / 영어 → 영어로`,
  yuminhye: `당신은 유민혜 크리에이터의 SNS 응대 담당입니다.
규칙:
- 친근하고 따뜻한 크리에이터 말투
- 이모지 1-2개, 2문장 이내
- 제품 관련 → "@millimilli.official 에서 확인해주세요!"
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
  if (accountUsername === 'peerstory' || accountUsername === '15초유민혜') return 'yuminhye';
  return 'millimilli';
}

// KST 09:00/13:00/18:00/22:00 → 댓글+DM 자동 응대
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.ZERNIO_API_KEY) {
    return res.status(200).json({ error: 'ZERNIO_API_KEY not set', replied: 0, skipped: 0 });
  }

  try {
    // Zernio /inbox/comments returns { data: [...] }
    // Zernio /inbox/messages endpoint doesn't exist (returns HTML 404) — skip
    const commentsData = await zFetch('/inbox/comments?status=unanswered&limit=30');
    const comments = commentsData.data || commentsData.comments || (Array.isArray(commentsData) ? commentsData : []);
    const messages = []; // DM is handled by webhooks, not polling
    const results = { replied: 0, skipped: 0, dmReplied: 0, dmSkipped: 0, errors: 0 };

    for (const c of comments) {
      try {
        const persona = getPersona(c.accountUsername || c.account?.username || '');
        const reply = await generateReply(c.text || c.content || '', persona);
        if (reply === 'SKIP' || !reply) { results.skipped++; continue; }
        await zFetch(`/inbox/comments/${c._id || c.id}/reply`, { method: 'POST', body: JSON.stringify({ text: reply }) });
        results.replied++;
      } catch (e) { console.error('[Inbox Cron] comment error:', e.message); results.errors++; }
    }

    for (const m of messages) {
      try {
        const persona = getPersona(m.accountUsername || m.account?.username || '');
        const reply = await generateReply(m.text || m.content || '', persona);
        if (reply === 'SKIP' || !reply) { results.dmSkipped++; continue; }
        await zFetch(`/inbox/messages/${m._id || m.id}/reply`, { method: 'POST', body: JSON.stringify({ text: reply }) });
        results.dmReplied++;
      } catch (e) { console.error('[Inbox Cron] dm error:', e.message); results.errors++; }
    }

    // Save to KV
    const today = new Date().toISOString().slice(0, 10);
    const logKey = `inbox-log:${today}`;
    const existing = await redis.get(logKey) || [];
    await redis.set(logKey, [...(Array.isArray(existing) ? existing : []), { time: new Date().toISOString(), ...results }]);

    console.log(`[Inbox Cron] replied=${results.replied}, skipped=${results.skipped}, dm=${results.dmReplied}, errors=${results.errors}`);
    return res.status(200).json(results);
  } catch (error) {
    console.error('[Inbox Cron]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

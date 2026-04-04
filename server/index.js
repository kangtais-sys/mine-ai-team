import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { agents } from './agents.js';

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic();

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { agentId, messages } = req.body;
    const agent = agents.find(a => a.id === agentId);

    if (!agent) {
      return res.status(400).json({ error: 'Agent not found' });
    }

    const formattedMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: agent.systemPrompt,
      messages: formattedMessages,
    });

    const content = response.content[0]?.text || '응답을 생성할 수 없습니다.';
    res.json({ content });
  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Orchestrator endpoint - Chief AI delegates to sub-agents
app.post('/api/orchestrate', async (req, res) => {
  try {
    const { instruction } = req.body;
    const chiefAgent = agents.find(a => a.id === 'chief');

    const analysisResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: `${chiefAgent.systemPrompt}\n\n추가 지시: 사용자의 요청을 분석하여 어떤 에이전트에게 위임해야 하는지 JSON으로 응답하세요.
응답 형식: { "delegations": [{ "agentId": "creator", "task": "인스타 릴스 기획" }], "summary": "전체 요약" }
가능한 에이전트 ID: creator, community, cs, marketer, admin, product, global`,
      messages: [{ role: 'user', content: instruction }]
    });

    res.json({ content: analysisResponse.content[0]?.text });
  } catch (error) {
    console.error('Orchestrate error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Briefing endpoint
app.get('/api/briefing', async (req, res) => {
  try {
    const chiefAgent = agents.find(a => a.id === 'chief');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: chiefAgent.systemPrompt,
      messages: [{
        role: 'user',
        content: '오늘의 전체 브리핑을 생성해줘. 각 팀별 주요 현황과 오늘 할 일을 정리해줘.'
      }]
    });

    res.json({ content: response.content[0]?.text });
  } catch (error) {
    console.error('Briefing error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Meta Instagram Webhook 인증
app.get('/api/webhooks/instagram', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  console.log('[Meta Webhook] Verification:', { mode, challenge });
  if (mode === 'subscribe' && token === (process.env.META_WEBHOOK_VERIFY_TOKEN || 'millimilli2024secret')) {
    console.log('✅ Meta webhook verified!');
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).end(String(challenge));
  }
  return res.status(403).end('Forbidden');
});

// Meta Instagram Webhook 이벤트 수신
app.post('/api/webhooks/instagram', (req, res) => {
  console.log('[Meta Webhook] Event:', JSON.stringify(req.body, null, 2));
  res.status(200).json({ received: true });
});

// Zernio webhook - 댓글/DM 실시간 자동 응대
app.post('/api/webhooks/zernio', async (req, res) => {
  console.log('[Webhook] Received:', JSON.stringify(req.body, null, 2));
  res.status(200).json({ received: true });

  const { event, comment, message, account } = req.body;

  try {
    if (event === 'comment.received' && comment) {
      const commentText = comment.text || '';
      const commentId = comment.id;
      const profileId = comment.profileId;

      const spamKeywords = ['팔로우', '맞팔', 'follow', 'http', '홍보', 'dm주세요'];
      if (spamKeywords.some(k => commentText.toLowerCase().includes(k))) return;

      const isMillimilli = profileId === '69d08cc1986d57bb8f733102';
      const systemPrompt = isMillimilli
        ? '당신은 밀리밀리 브랜드 SNS 담당자입니다. 500달톤 초저분자 단백질 화장품 전문가로서 따뜻하고 친근하게 응대합니다. 이모지 1-2개, 2문장 이내. 제품/성분 문의 → 카카오채널 @밀리밀리 안내. 구매/이벤트 → 프로필 링크 안내. 가격 직접 언급 금지. 악성/광고/스팸이면 SKIP만 반환.'
        : '당신은 유민혜 인플루언서입니다. 친근하고 따뜻하게. 짧게. 이모지 자연스럽게. 악성이면 SKIP만 반환.';

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: 'user', content: `댓글: "${commentText}"` }],
      });

      const reply = response.content[0]?.text?.trim();
      if (!reply || reply === 'SKIP' || reply === 'null') return;

      await fetch(`https://zernio.com/api/v1/inbox/comments/${commentId}/reply`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reply }),
      });
      console.log(`✅ 댓글 자동 응대: "${reply}"`);
    }

    if (event === 'message.received' && message) {
      const messageText = message.text || '';
      const messageId = message.id;
      const profileId = message.profileId;

      const isMillimilli = profileId === '69d08cc1986d57bb8f733102';
      const systemPrompt = isMillimilli
        ? '밀리밀리 DM 상담원. 따뜻하고 전문적으로. 3문장 이내. 제품 문의 → 카카오채널 @밀리밀리. 구매 → 프로필 링크. 가격 미언급.'
        : '유민혜 인플루언서. 친근하게. 3문장 이내. 협찬문의는 이메일 안내.';

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: `DM: "${messageText}"` }],
      });

      const reply = response.content[0]?.text?.trim();
      if (!reply || reply === 'SKIP') return;

      await fetch(`https://zernio.com/api/v1/inbox/messages/${messageId}/reply`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reply }),
      });
      console.log(`✅ DM 자동 응대: "${reply}"`);
    }
  } catch (error) {
    console.error('Webhook 처리 오류:', error.message);
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`MINE AI Team server running on port ${PORT}`);
});

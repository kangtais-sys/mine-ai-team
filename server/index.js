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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`MINE AI Team server running on port ${PORT}`);
});

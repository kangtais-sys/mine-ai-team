import Anthropic from '@anthropic-ai/sdk';
import { agents } from './_agents.js';

const anthropic = new Anthropic();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { instruction } = req.body;
    const chiefAgent = agents.find(a => a.id === 'chief');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: `${chiefAgent.systemPrompt}\n\n추가 지시: 사용자의 요청을 분석하여 어떤 에이전트에게 위임해야 하는지 JSON으로 응답하세요.
응답 형식: { "delegations": [{ "agentId": "creator", "task": "인스타 릴스 기획" }], "summary": "전체 요약" }
가능한 에이전트 ID: creator, community, cs, marketer, admin, product, global`,
      messages: [{ role: 'user', content: instruction }]
    });

    res.status(200).json({ content: response.content[0]?.text });
  } catch (error) {
    console.error('Orchestrate error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

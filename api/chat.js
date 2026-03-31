import Anthropic from '@anthropic-ai/sdk';
import { agents } from './_agents.js';

const anthropic = new Anthropic();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    res.status(200).json({ content });
  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

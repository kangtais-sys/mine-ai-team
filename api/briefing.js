import Anthropic from '@anthropic-ai/sdk';
import { agents } from './_agents.js';

const anthropic = new Anthropic();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    res.status(200).json({ content: response.content[0]?.text });
  } catch (error) {
    console.error('Briefing error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

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

    // 크리에이터 채팅에서 "생성해" 감지 → Bannerbear + Zernio 트리거
    const lastMsg = messages?.[messages.length - 1]?.content || '';
    if (agentId === 'creator' && /생성해|생성하자|만들어|발행해/.test(lastMsg)) {
      try {
        const baseUrl = `https://${req.headers.host || 'mine-ai-team.vercel.app'}`;
        const genRes = await fetch(`${baseUrl}/api/sisuru-select`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'generate' }),
        });
        const genData = await genRes.json();
        if (genData.success) {
          return res.status(200).json({
            content: `✅ 카드뉴스 생성 완료!\n\n📷 이미지: ${genData.images}장 생성\n📋 Zernio: ${genData.zernio?.status || '처리 중'}\n⏰ 예약: 3시간 후 발행\n\n${genData.zernio?.error ? '⚠️ ' + genData.zernio.error : 'Zernio 대시보드에서 확인하세요!'}`,
          });
        }
        return res.status(200).json({ content: `❌ 생성 실패: ${genData.error || '알 수 없는 오류'}` });
      } catch (e) {
        return res.status(200).json({ content: `❌ 생성 오류: ${e.message}` });
      }
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

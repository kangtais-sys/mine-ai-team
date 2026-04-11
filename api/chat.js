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

    // 크리에이터 채팅에서 "생성해" 감지 → 수정사항 반영 후 생성
    const lastMsg = messages?.[messages.length - 1]?.content || '';
    if (agentId === 'creator' && /생성해|생성하자|만들어|발행해/.test(lastMsg)) {
      try {
        const baseUrl = `https://${req.headers.host || 'mine-ai-team.vercel.app'}`;

        // 마지막 초안 표시 이후의 사용자 메시지만 추출 (이전 주제 메시지 무시)
        let lastDraftIdx = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant' && /카드뉴스 초안|━━━ \d장 ━━━/.test(messages[i].content || '')) {
            lastDraftIdx = i; break;
          }
        }
        const editMessages = messages.slice(lastDraftIdx + 1).filter(m => m.role === 'user' && !/^(생성해|생성하자|만들어|발행해)$/.test(m.content.trim()));
        const chatHistory = editMessages.map(m => m.content).join('\n');
        const hasEdits = editMessages.length > 0;

        if (hasEdits) {
          // KV에서 기존 draft 가져와서 수정사항 반영
          const { Redis } = await import('@upstash/redis');
          const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
          const draft = await redis.get('sisuru:draft');
          const currentPlan = draft ? (typeof draft === 'string' ? JSON.parse(draft) : draft) : null;

          if (currentPlan) {
            const updateRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
              body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 3000,
                messages: [{ role: 'user', content: `아래 카드뉴스 기획을 사용자의 수정 요청에 맞게 업데이트해줘.

현재 기획:
${JSON.stringify(currentPlan, null, 2)}

사용자 수정 요청:
${chatHistory}

수정된 부분만 반영하고 나머지는 유지. 동일한 JSON 구조로 응답 (slides, instagram_caption, tiktok_caption).` }],
              }),
            });
            const updateData = await updateRes.json();
            const text = updateData.content?.[0]?.text || '';
            const match = text.match(/\{[\s\S]*\}/);
            if (match) {
              const updatedPlan = JSON.parse(match[0]);
              await redis.set('sisuru:draft', JSON.stringify(updatedPlan), { ex: 86400 });
              console.log('[Chat] Draft updated with user edits');
            }
          }
        }

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

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import useChatStore from '../store/chatStore';
import { getAgent } from '../lib/agents';

export default function ChatView() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const { activeAgent, conversations, isLoading, sendMessage } = useChatStore();
  const agent = getAgent(activeAgent);
  const messages = conversations[activeAgent] || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    sendMessage(activeAgent, trimmed);
  };

  const Icon = agent.icon;

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="h-[64px] border-b border-border flex items-center px-6 shrink-0 bg-bg-primary">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-bg-card border border-border flex items-center justify-center">
            <Icon size={18} />
          </div>
          <div>
            <h2 className="text-[16px] font-bold">{agent.name}</h2>
            <p className="text-[12px] text-text-secondary">{agent.description}</p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-bg-card border border-border flex items-center justify-center mb-4">
              <Icon size={28} strokeWidth={1.5} />
            </div>
            <h3 className="text-[20px] font-bold mb-2">{agent.name}</h3>
            <p className="text-text-secondary text-[14px] max-w-md">
              {agent.description}에 대해 무엇이든 물어보세요.
            </p>
            <div className="flex flex-wrap gap-2 mt-6 max-w-lg justify-center">
              {getQuickActions(activeAgent).map((action, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(action);
                  }}
                  className="px-4 py-2 rounded-lg border border-border text-[13px] text-text-secondary hover:border-white hover:text-white transition-all"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-white text-black'
                : 'bg-bg-card border border-border'
            }`}>
              <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="mb-4 flex justify-start">
            <div className="bg-bg-card border border-border rounded-2xl px-4 py-3">
              <Loader2 size={18} className="animate-spin text-text-secondary" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-6 pb-6 pt-2 shrink-0">
        <div className="flex items-center gap-3 bg-bg-card border border-border rounded-xl px-4 py-3 focus-within:border-white transition-colors">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={`${agent.name}에게 메시지 보내기...`}
            className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-text-muted"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center disabled:opacity-30 transition-opacity hover:opacity-80"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-center text-[11px] text-text-muted mt-2">
          Claude API (claude-sonnet-4-20250514) 기반
        </p>
      </div>
    </div>
  );
}

function getQuickActions(agentId) {
  const actions = {
    chief: ['오늘 전체 브리핑해줘', '이번 주 주요 일정 정리', '긴급 이슈 있어?'],
    creator: ['인스타 릴스 기획해줘', '이번 주 콘텐츠 캘린더', 'SEO 블로그 글 써줘'],
    community: ['오늘 DM 요약해줘', '댓글 분석 리포트', '악성댓글 현황'],
    cs: ['오늘 상담 현황', '불만 고객 리스트', 'FAQ 업데이트해줘'],
    marketer: ['이번 달 성과 분석', '트렌드 리포트', '광고 ROI 분석'],
    admin: ['이번 달 매출 현황', '정부지원사업 공고', '재고 현황 체크'],
    product: ['신제품 트렌드 분석', '경쟁사 신제품 모니터링', '상품 기획서 작성'],
    global: ['수출 현황 보고', '환율 변동 리포트', '바이어 컨택 메일 작성'],
  };
  return actions[agentId] || [];
}

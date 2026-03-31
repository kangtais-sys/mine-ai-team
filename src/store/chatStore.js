import { create } from 'zustand';

const useChatStore = create((set, get) => ({
  conversations: {},
  activeAgent: 'chief',
  isLoading: false,

  setActiveAgent: (agentId) => set({ activeAgent: agentId }),

  addMessage: (agentId, message) => set((state) => ({
    conversations: {
      ...state.conversations,
      [agentId]: [...(state.conversations[agentId] || []), message]
    }
  })),

  getMessages: (agentId) => get().conversations[agentId] || [],

  sendMessage: async (agentId, content) => {
    const userMessage = { role: 'user', content, timestamp: Date.now() };

    set((state) => ({
      isLoading: true,
      conversations: {
        ...state.conversations,
        [agentId]: [...(state.conversations[agentId] || []), userMessage]
      }
    }));

    try {
      const messages = get().conversations[agentId] || [];
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, messages })
      });

      if (!res.ok) throw new Error('API request failed');

      const data = await res.json();
      const assistantMessage = {
        role: 'assistant',
        content: data.content,
        timestamp: Date.now()
      };

      set((state) => ({
        isLoading: false,
        conversations: {
          ...state.conversations,
          [agentId]: [...(state.conversations[agentId] || []), assistantMessage]
        }
      }));
    } catch (error) {
      const errorMessage = {
        role: 'assistant',
        content: '죄송합니다. 일시적인 오류가 발생했습니다. 다시 시도해주세요.',
        timestamp: Date.now(),
        error: true
      };

      set((state) => ({
        isLoading: false,
        conversations: {
          ...state.conversations,
          [agentId]: [...(state.conversations[agentId] || []), errorMessage]
        }
      }));
    }
  }
}));

export default useChatStore;

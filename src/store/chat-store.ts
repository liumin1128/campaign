import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Message, Language, QuotedMessage } from "@/components/chat/types";
import {
  getLocalizedAgents,
  getWelcomeMessage,
  getNewSessionTitle,
} from "@/components/chat/i18n";

export const MAX_SESSIONS = 20;

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  selectedAgentId: string;
  createdAt: number;
  updatedAt: number;
}

interface ChatStoreState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  language: Language;
  enableThinking: boolean;
  draftInputs: Record<string, string>;
  quotedMessages: QuotedMessage[];
  setLanguage: (lang: Language) => void;
  setEnableThinking: (enabled: boolean) => void;
  createSession: (agentId?: string) => string;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateSessionMessages: (id: string, messages: Message[]) => void;
  updateSessionAgent: (id: string, agentId: string) => void;
  renameSession: (id: string, title: string) => void;
  setDraftInput: (sessionId: string, draft: string) => void;
  toggleQuotedMessage: (msg: QuotedMessage) => void;
  clearQuotedMessages: () => void;
}

function generateTitle(messages: Message[], language: Language): string {
  const firstUserMsg = messages.find((m) => m.role === "user");
  if (firstUserMsg?.content) {
    const clean = firstUserMsg.content.replace(/\n/g, " ").trim();
    return clean.length > 30 ? clean.slice(0, 30) + "…" : clean;
  }
  return getNewSessionTitle(language);
}

function createNewSession(
  agentId?: string,
  language: Language = "zh",
): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: getNewSessionTitle(language),
    messages: [getWelcomeMessage(language)],
    selectedAgentId: agentId ?? getLocalizedAgents(language)[0].id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const useChatStore = create<ChatStoreState>()(
  persist(
    (set) => ({
      sessions: [],
      activeSessionId: null,
      language: "zh",
      enableThinking: false,
      draftInputs: {},
      quotedMessages: [],

      setLanguage: (lang) => set({ language: lang }),
      setEnableThinking: (enabled) => set({ enableThinking: enabled }),

      createSession: (agentId) => {
        let lang = "zh" as Language;
        set((state) => {
          lang = state.language;
          return state;
        });
        const session = createNewSession(
          typeof agentId === "string" ? agentId : undefined,
          lang,
        );
        set((state) => {
          const sessions = [session, ...state.sessions].slice(0, MAX_SESSIONS);
          return { sessions, activeSessionId: session.id };
        });
        return session.id;
      },

      switchSession: (id) => {
        set({ activeSessionId: id });
      },

      deleteSession: (id) => {
        set((state) => {
          let sessions = state.sessions.filter((s) => s.id !== id);
          // 清理该会话的草稿
          const restDrafts = { ...state.draftInputs };
          delete restDrafts[id];
          // 删除最后一个时自动创建新会话
          if (sessions.length === 0) {
            const newSession = createNewSession(undefined, state.language);
            sessions = [newSession];
            return {
              sessions,
              activeSessionId: newSession.id,
              draftInputs: restDrafts,
            };
          }
          const activeSessionId =
            state.activeSessionId === id
              ? sessions[0].id
              : state.activeSessionId;
          return { sessions, activeSessionId, draftInputs: restDrafts };
        });
      },

      updateSessionMessages: (id, messages) => {
        set((state) => {
          const sessions = state.sessions.map((s) => {
            if (s.id !== id) return s;
            const title =
              s.title === getNewSessionTitle(state.language)
                ? generateTitle(messages, state.language)
                : s.title;
            return { ...s, messages, title, updatedAt: Date.now() };
          });
          return { sessions };
        });
      },

      updateSessionAgent: (id, agentId) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id
              ? { ...s, selectedAgentId: agentId, updatedAt: Date.now() }
              : s,
          ),
        }));
      },

      renameSession: (id, title) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title, updatedAt: Date.now() } : s,
          ),
        }));
      },

      setDraftInput: (sessionId, draft) => {
        set((state) => ({
          draftInputs: { ...state.draftInputs, [sessionId]: draft },
        }));
      },

      toggleQuotedMessage: (msg) => {
        set((state) => {
          const exists = state.quotedMessages.some((q) => q.id === msg.id);
          return {
            quotedMessages: exists
              ? state.quotedMessages.filter((q) => q.id !== msg.id)
              : [...state.quotedMessages, msg],
          };
        });
      },

      clearQuotedMessages: () => {
        set({ quotedMessages: [] });
      },
    }),
    {
      name: "chat-store",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        language: state.language,
        enableThinking: state.enableThinking,
        draftInputs: state.draftInputs,
        quotedMessages: state.quotedMessages,
      }),
    },
  ),
);

// 持久化 hydration 完成后，确保始终有一个活跃会话
if (typeof window !== "undefined" && useChatStore.persist) {
  useChatStore.persist.onFinishHydration(() => {
    const state = useChatStore.getState();
    const hasActiveSession = state.sessions.some(
      (s) => s.id === state.activeSessionId,
    );
    if (!hasActiveSession) {
      // 无活跃会话时自动创建（即使有遗留会话但 activeSessionId 失效也重建）
      state.createSession();
    }
  });
}

/** 获取当前活跃会话 */
export function useActiveSession(): {
  session: ChatSession | undefined;
  sessions: ChatSession[];
  activeSessionId: string | null;
  language: Language;
  enableThinking: boolean;
  draftInputs: Record<string, string>;
  quotedMessages: QuotedMessage[];
  setLanguage: (lang: Language) => void;
  setEnableThinking: (enabled: boolean) => void;
  createSession: (agentId?: string) => string;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateSessionMessages: (id: string, messages: Message[]) => void;
  updateSessionAgent: (id: string, agentId: string) => void;
  renameSession: (id: string, title: string) => void;
  setDraftInput: (sessionId: string, draft: string) => void;
  toggleQuotedMessage: (msg: QuotedMessage) => void;
  clearQuotedMessages: () => void;
} {
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const language = useChatStore((s) => s.language);
  const enableThinking = useChatStore((s) => s.enableThinking);
  const draftInputs = useChatStore((s) => s.draftInputs);
  const quotedMessages = useChatStore((s) => s.quotedMessages);
  const setLanguage = useChatStore((s) => s.setLanguage);
  const setEnableThinking = useChatStore((s) => s.setEnableThinking);
  const createSession = useChatStore((s) => s.createSession);
  const switchSession = useChatStore((s) => s.switchSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const updateSessionMessages = useChatStore((s) => s.updateSessionMessages);
  const updateSessionAgent = useChatStore((s) => s.updateSessionAgent);
  const renameSession = useChatStore((s) => s.renameSession);
  const setDraftInput = useChatStore((s) => s.setDraftInput);
  const toggleQuotedMessage = useChatStore((s) => s.toggleQuotedMessage);
  const clearQuotedMessages = useChatStore((s) => s.clearQuotedMessages);

  const session = sessions.find((s) => s.id === activeSessionId);

  return {
    session,
    sessions,
    activeSessionId,
    language,
    enableThinking,
    draftInputs,
    quotedMessages,
    setLanguage,
    setEnableThinking,
    createSession,
    switchSession,
    deleteSession,
    updateSessionMessages,
    updateSessionAgent,
    renameSession,
    setDraftInput,
    toggleQuotedMessage,
    clearQuotedMessages,
  };
}

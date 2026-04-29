import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Message } from "@/components/chat/types";
import { AGENTS, WELCOME_MESSAGE } from "@/components/chat/constants";

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
  createSession: (agentId?: string) => string;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateSessionMessages: (id: string, messages: Message[]) => void;
  updateSessionAgent: (id: string, agentId: string) => void;
  renameSession: (id: string, title: string) => void;
}

function generateTitle(messages: Message[]): string {
  const firstUserMsg = messages.find((m) => m.role === "user");
  if (firstUserMsg?.content) {
    const clean = firstUserMsg.content.replace(/\n/g, " ").trim();
    return clean.length > 30 ? clean.slice(0, 30) + "…" : clean;
  }
  return "新对话";
}

function createNewSession(agentId?: string): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: "新对话",
    messages: [WELCOME_MESSAGE],
    selectedAgentId: agentId ?? AGENTS[0].id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const useChatStore = create<ChatStoreState>()(
  persist(
    (set) => ({
      sessions: [],
      activeSessionId: null,

      createSession: (agentId) => {
        const session = createNewSession(
          typeof agentId === "string" ? agentId : undefined,
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
          // 删除最后一个时自动创建新会话
          if (sessions.length === 0) {
            const newSession = createNewSession();
            sessions = [newSession];
            return { sessions, activeSessionId: newSession.id };
          }
          const activeSessionId =
            state.activeSessionId === id
              ? sessions[0].id
              : state.activeSessionId;
          return { sessions, activeSessionId };
        });
      },

      updateSessionMessages: (id, messages) => {
        set((state) => {
          const sessions = state.sessions.map((s) => {
            if (s.id !== id) return s;
            const title =
              s.title === "新对话" ? generateTitle(messages) : s.title;
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
    }),
    {
      name: "chat-store",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
    },
  ),
);

// 持久化 hydration 完成后，若无会话则自动创建初始会话
if (typeof window !== "undefined" && useChatStore.persist) {
  useChatStore.persist.onFinishHydration(() => {
    const { sessions, activeSessionId, createSession } =
      useChatStore.getState();
    if (sessions.length === 0 && !activeSessionId) {
      createSession();
    }
  });
}

/** 获取当前活跃会话 */
export function useActiveSession(): {
  session: ChatSession | undefined;
  sessions: ChatSession[];
  activeSessionId: string | null;
  createSession: (agentId?: string) => string;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateSessionMessages: (id: string, messages: Message[]) => void;
  updateSessionAgent: (id: string, agentId: string) => void;
  renameSession: (id: string, title: string) => void;
} {
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const createSession = useChatStore((s) => s.createSession);
  const switchSession = useChatStore((s) => s.switchSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const updateSessionMessages = useChatStore((s) => s.updateSessionMessages);
  const updateSessionAgent = useChatStore((s) => s.updateSessionAgent);
  const renameSession = useChatStore((s) => s.renameSession);

  const session = sessions.find((s) => s.id === activeSessionId);

  return {
    session,
    sessions,
    activeSessionId,
    createSession,
    switchSession,
    deleteSession,
    updateSessionMessages,
    updateSessionAgent,
    renameSession,
  };
}

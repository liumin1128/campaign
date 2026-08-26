import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ConversationMemory } from "@/lib/chat-memory/types";
import { pruneMemories } from "@/lib/chat-memory/retention";

interface ChatMemoryState {
  enabled: boolean;
  memories: ConversationMemory[];
  setEnabled: (enabled: boolean) => void;
  upsertMemory: (memory: ConversationMemory) => void;
  removeMemory: (ownerKey: string, memoryId: string) => void;
  removeSessionMemory: (ownerKey: string, sessionId: string) => void;
  clearMemories: (ownerKey: string) => void;
  touchMemories: (ownerKey: string, memoryIds: string[]) => void;
}

export const useChatMemoryStore = create<ChatMemoryState>()(
  persist(
    (set) => ({
      enabled: true,
      memories: [],
      setEnabled: (enabled) => set({ enabled }),
      upsertMemory: (memory) =>
        set((state) => ({
          memories: pruneMemories([
            ...state.memories.filter(
              (item) =>
                !(
                  item.ownerKey === memory.ownerKey &&
                  item.sessionId === memory.sessionId
                ),
            ),
            memory,
          ]),
        })),
      removeMemory: (ownerKey, memoryId) =>
        set((state) => ({
          memories: state.memories.filter(
            (memory) =>
              memory.ownerKey !== ownerKey || memory.id !== memoryId,
          ),
        })),
      removeSessionMemory: (ownerKey, sessionId) =>
        set((state) => ({
          memories: state.memories.filter(
            (memory) =>
              memory.ownerKey !== ownerKey || memory.sessionId !== sessionId,
          ),
        })),
      clearMemories: (ownerKey) =>
        set((state) => ({
          memories: state.memories.filter(
            (memory) => memory.ownerKey !== ownerKey,
          ),
        })),
      touchMemories: (ownerKey, memoryIds) => {
        if (memoryIds.length === 0) return;
        const selected = new Set(memoryIds);
        const now = Date.now();
        set((state) => ({
          memories: state.memories.map((memory) =>
            memory.ownerKey === ownerKey && selected.has(memory.id)
              ? { ...memory, lastUsedAt: now }
              : memory,
          ),
        }));
      },
    }),
    {
      name: "chat-memory-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        enabled: state.enabled,
        memories: state.memories,
      }),
    },
  ),
);

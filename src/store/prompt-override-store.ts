import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface PromptOverrideState {
  /** 用户自定义的全局规则，空字符串表示使用系统默认 */
  globalRules: string;
  /** 用户自定义的 Agent 系统提示词（不含全局规则），key 为 agentId */
  agentPrompts: Record<string, string>;
  setGlobalRules: (value: string) => void;
  setAgentPrompt: (agentId: string, value: string) => void;
  clearGlobalRules: () => void;
  clearAgentPrompt: (agentId: string) => void;
  clearAll: () => void;
}

export const usePromptOverrideStore = create<PromptOverrideState>()(
  persist(
    (set) => ({
      globalRules: "",
      agentPrompts: {},

      setGlobalRules: (value) => set({ globalRules: value }),

      setAgentPrompt: (agentId, value) =>
        set((state) => ({
          agentPrompts: { ...state.agentPrompts, [agentId]: value },
        })),

      clearGlobalRules: () => set({ globalRules: "" }),

      clearAgentPrompt: (agentId) =>
        set((state) => {
          const { [agentId]: _removed, ...rest } = state.agentPrompts;
          return { agentPrompts: rest };
        }),

      clearAll: () => set({ globalRules: "", agentPrompts: {} }),
    }),
    {
      name: "prompt-override-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

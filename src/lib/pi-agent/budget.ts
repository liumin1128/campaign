import type { PiAgentLimits } from "./limits";

export interface PiAgentBudgetState {
  modelTurns: number;
  toolCalls: number;
  webSearches: number;
}

export type ToolBudgetDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

export function createPiAgentBudget(limits: PiAgentLimits) {
  const state: PiAgentBudgetState = {
    modelTurns: 0,
    toolCalls: 0,
    webSearches: 0,
  };

  return {
    startModelTurn() {
      state.modelTurns += 1;
      return state.modelTurns;
    },

    tryUseTool(toolName: string): ToolBudgetDecision {
      const finalTurnBoundary = Math.max(1, limits.maxModelTurns - 1);
      if (state.modelTurns >= finalTurnBoundary) {
        return {
          allowed: false,
          reason:
            "The model-turn budget is nearly exhausted. Do not call more tools; answer now using the evidence already collected.",
        };
      }

      if (state.toolCalls >= limits.maxToolCalls) {
        return {
          allowed: false,
          reason:
            "The tool-call budget is exhausted. Do not call more tools; answer now using the available evidence.",
        };
      }

      if (
        toolName === "web_search" &&
        state.webSearches >= limits.maxWebSearches
      ) {
        return {
          allowed: false,
          reason:
            "The Web Search budget is exhausted. Do not search again; answer using the sources already collected.",
        };
      }

      state.toolCalls += 1;
      if (toolName === "web_search") {
        state.webSearches += 1;
      }
      return { allowed: true };
    },

    shouldStopAfterTurn() {
      return state.modelTurns >= limits.maxModelTurns;
    },

    snapshot(): PiAgentBudgetState {
      return { ...state };
    },
  };
}

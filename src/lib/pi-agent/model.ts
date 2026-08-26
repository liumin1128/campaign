import type { Model } from "@earendil-works/pi-ai";

export const PI_AGENT_MODEL_ID = "deepseek-v4-flash-vision-exp";

export const PI_AGENT_MODEL = {
  id: PI_AGENT_MODEL_ID,
  name: "DeepSeek V4 Flash Vision Exp",
  api: "openai-completions",
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  reasoning: true,
  thinkingLevelMap: {
    minimal: null,
    low: "low",
    medium: null,
    high: "high",
    max: "max",
  },
  input: ["text", "image"],
  cost: {
    input: 0.14,
    output: 0.28,
    cacheRead: 0.0028,
    cacheWrite: 0,
  },
  contextWindow: 1_000_000,
  maxTokens: 384_000,
  compat: {
    supportsStore: false,
    supportsDeveloperRole: false,
    maxTokensField: "max_tokens",
    requiresReasoningContentOnAssistantMessages: true,
    thinkingFormat: "deepseek",
  },
} satisfies Model<"openai-completions">;

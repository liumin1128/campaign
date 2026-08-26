export const MAX_MEMORY_SUMMARY_CHARS = 800;
export const MAX_MEMORY_FIELD_ITEMS = 8;
export const MAX_MEMORY_FIELD_CHARS = 160;
export const MAX_MEMORY_SOURCE_MESSAGES = 16;
export const MAX_MEMORY_SOURCE_IDS = 64;
export const MAX_MEMORY_PROMPT_CHARS = 2_000;
export const MAX_RETRIEVED_MEMORIES = 3;
export const MAX_RECENT_CHAT_MESSAGES = 12;
export const MAX_MEMORIES_PER_OWNER = 100;
export const MEMORY_RETENTION_MS = 180 * 24 * 60 * 60 * 1_000;

export interface ConversationMemoryContent {
  summary: string;
  goals: string[];
  preferences: string[];
  constraints: string[];
  decisions: string[];
  openItems: string[];
  tags: string[];
  confidence: number;
}

export interface ConversationMemory extends ConversationMemoryContent {
  id: string;
  ownerKey: string;
  sessionId: string;
  sessionTitle: string;
  agentId: string;
  sourceMessageIds: string[];
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
}

export interface MemorySourceMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface SummarizeMemoryRequest {
  previousMemory?: ConversationMemoryContent;
  messages: MemorySourceMessage[];
  agentId: string;
  language: "zh" | "en";
}

export type SummarizeMemoryResponse =
  | { ok: true; memory: ConversationMemoryContent }
  | { ok: false; error: string };

export interface MemorySelection {
  currentMemory?: ConversationMemory;
  relatedMemories: ConversationMemory[];
  globalPreferences: string[];
  memoryIds: string[];
  prompt: string;
}

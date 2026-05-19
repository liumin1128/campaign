import type { CsvAnalysisState } from "@/lib/client-analysis/csv-types";

export interface Message {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  reasoning?: string;
  attachments?: FileAttachment[];
}

export interface AgentOption {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  /** 是否启用互联网搜索能力（tool calling） */
  enableSearch?: boolean;
}

export interface FileAttachment {
  id?: string;
  name: string;
  content: string;
  type: "csv" | "text" | "csv-analysis";
  size?: number;
  analysis?: CsvAnalysisState;
}

/** 被引用的消息 */
export interface QuotedMessage {
  id: string;
  content: string;
  role: "system" | "user" | "assistant";
  sessionId: string;
  sessionTitle: string;
}

/** 聊天回复语言 */
export type Language = "zh" | "en";

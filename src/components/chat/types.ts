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
}

export interface FileAttachment {
  name: string;
  content: string;
  type: "csv" | "text";
}

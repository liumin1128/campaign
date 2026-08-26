import type { JsonValue } from "@earendil-works/pi-ai";
import type { Message } from "@/components/chat/types";
import type {
  CsvDataQueryResult,
  CsvProfile,
  CsvProfileSummary,
} from "@/lib/client-analysis/csv-types";
import type { PiAgentBudgetState } from "./budget";
import type { GenericFileContext } from "@/lib/file-agent/types";

export interface PiCsvContext {
  id: string;
  name: string;
  size?: number;
  profile: CsvProfile;
  profileSummary: CsvProfileSummary;
  queryResults?: CsvDataQueryResult[];
  stageSummaries?: string[];
  summary?: string;
  content?: string;
}

export interface PiAgentUpdate {
  content: string;
  reasoning: string;
  budget: PiAgentBudgetState;
}

export interface RunPiAgentOptions {
  sessionId: string;
  systemPrompt: string;
  history: Message[];
  prompt: string;
  csvContexts: PiCsvContext[];
  fileContexts: GenericFileContext[];
  signal: AbortSignal;
  onUpdate: (update: PiAgentUpdate) => void;
}

export interface RunPiAgentResult extends PiAgentUpdate {
  scriptResults: JsonValue[];
}

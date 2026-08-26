import {
  MAX_MEMORY_FIELD_CHARS,
  MAX_MEMORY_FIELD_ITEMS,
  MAX_MEMORY_SUMMARY_CHARS,
  type ConversationMemoryContent,
  type MemorySourceMessage,
} from "./types";

const EMPTY_MEMORY: ConversationMemoryContent = {
  summary: "",
  goals: [],
  preferences: [],
  constraints: [],
  decisions: [],
  openItems: [],
  tags: [],
  confidence: 0,
};

export function normalizeMemoryContent(
  value: unknown,
): ConversationMemoryContent | null {
  if (!isRecord(value)) return null;

  const memory: ConversationMemoryContent = {
    summary: sanitizeMemoryText(value.summary, MAX_MEMORY_SUMMARY_CHARS),
    goals: normalizeStringArray(value.goals),
    preferences: normalizeStringArray(value.preferences),
    constraints: normalizeStringArray(value.constraints),
    decisions: normalizeStringArray(value.decisions),
    openItems: normalizeStringArray(value.openItems),
    tags: normalizeStringArray(value.tags, 12, 60),
    confidence: normalizeConfidence(value.confidence),
  };

  if (!hasMemoryContent(memory)) return null;
  if (!memory.summary) {
    memory.summary = buildSummaryFallback(memory);
  }
  return memory;
}

export function sanitizeMemorySourceMessage(
  message: MemorySourceMessage,
): MemorySourceMessage | null {
  const withoutQuotes =
    message.role === "user"
      ? message.content
          .split("\n")
          .filter((line) => !line.trimStart().startsWith(">"))
          .join("\n")
      : message.content;
  const content = sanitizeMemoryText(withoutQuotes, 20_000);
  return content ? { ...message, content } : null;
}

export function sanitizeMemoryText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";

  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|secret)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[REDACTED]",
    )
    .replace(/https:\/\/[^\s]*webhook[^\s]*/gi, "[REDACTED_WEBHOOK]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

export function extractJsonObject(content: string): unknown {
  const trimmed = content.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;

  try {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

export function emptyMemoryContent(): ConversationMemoryContent {
  return { ...EMPTY_MEMORY };
}

function normalizeStringArray(
  value: unknown,
  maxItems = MAX_MEMORY_FIELD_ITEMS,
  maxChars = MAX_MEMORY_FIELD_CHARS,
) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value.flatMap((item) => {
    const normalized = sanitizeMemoryText(item, maxChars);
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key) || seen.size >= maxItems) return [];
    seen.add(key);
    return [normalized];
  });
}

function normalizeConfidence(value: unknown) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 0.5;
  return Math.max(0, Math.min(confidence, 1));
}

function hasMemoryContent(memory: ConversationMemoryContent) {
  return (
    !!memory.summary ||
    memory.goals.length > 0 ||
    memory.preferences.length > 0 ||
    memory.constraints.length > 0 ||
    memory.decisions.length > 0 ||
    memory.openItems.length > 0
  );
}

function buildSummaryFallback(memory: ConversationMemoryContent) {
  return [
    ...memory.goals,
    ...memory.preferences,
    ...memory.constraints,
    ...memory.decisions,
    ...memory.openItems,
  ]
    .slice(0, 4)
    .join("；")
    .slice(0, MAX_MEMORY_SUMMARY_CHARS);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

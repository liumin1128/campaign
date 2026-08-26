import type { FileAgentLimits } from "./types";

export const DEFAULT_FILE_AGENT_LIMITS: FileAgentLimits = {
  maxFileBytes: 1024 * 1024 * 1024,
  maxToolResultBytes: 50 * 1024,
  maxMatches: 100,
  maxLineChars: 500,
  readChunkBytes: 32 * 1024,
  maxStructuredParseBytes: 100 * 1024 * 1024,
};

export function normalizeFileAgentLimits(value: unknown): FileAgentLimits {
  if (!isRecord(value)) return DEFAULT_FILE_AGENT_LIMITS;

  return {
    maxFileBytes: positive(value.maxFileBytes, DEFAULT_FILE_AGENT_LIMITS.maxFileBytes),
    maxToolResultBytes: positive(
      value.maxToolResultBytes,
      DEFAULT_FILE_AGENT_LIMITS.maxToolResultBytes,
    ),
    maxMatches: positive(value.maxMatches, DEFAULT_FILE_AGENT_LIMITS.maxMatches),
    maxLineChars: positive(value.maxLineChars, DEFAULT_FILE_AGENT_LIMITS.maxLineChars),
    readChunkBytes: positive(value.readChunkBytes, DEFAULT_FILE_AGENT_LIMITS.readChunkBytes),
    maxStructuredParseBytes: positive(
      value.maxStructuredParseBytes,
      DEFAULT_FILE_AGENT_LIMITS.maxStructuredParseBytes,
    ),
  };
}

function positive(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

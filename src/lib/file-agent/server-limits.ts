import { DEFAULT_FILE_AGENT_LIMITS } from "./limits";
import type { FileAgentLimits } from "./types";

export function getServerFileAgentLimits(): FileAgentLimits {
  return {
    maxFileBytes: read("FILE_AGENT_MAX_FILE_BYTES", DEFAULT_FILE_AGENT_LIMITS.maxFileBytes),
    maxToolResultBytes: read(
      "FILE_AGENT_MAX_TOOL_RESULT_BYTES",
      DEFAULT_FILE_AGENT_LIMITS.maxToolResultBytes,
    ),
    maxMatches: read("FILE_AGENT_MAX_MATCHES", DEFAULT_FILE_AGENT_LIMITS.maxMatches),
    maxLineChars: read("FILE_AGENT_MAX_LINE_CHARS", DEFAULT_FILE_AGENT_LIMITS.maxLineChars),
    readChunkBytes: read("FILE_AGENT_READ_CHUNK_BYTES", DEFAULT_FILE_AGENT_LIMITS.readChunkBytes),
    maxStructuredParseBytes: read(
      "FILE_AGENT_MAX_STRUCTURED_PARSE_BYTES",
      DEFAULT_FILE_AGENT_LIMITS.maxStructuredParseBytes,
    ),
  };
}

function read(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

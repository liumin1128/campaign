export interface PiAgentLimits {
  maxModelTurns: number;
  maxToolCalls: number;
  maxWebSearches: number;
}

export const DEFAULT_PI_AGENT_LIMITS: PiAgentLimits = {
  maxModelTurns: 12,
  maxToolCalls: 24,
  maxWebSearches: 5,
};

export function normalizePiAgentLimits(value: unknown): PiAgentLimits {
  if (!isRecord(value)) {
    return DEFAULT_PI_AGENT_LIMITS;
  }

  return {
    maxModelTurns: normalizeLimit(
      value.maxModelTurns,
      DEFAULT_PI_AGENT_LIMITS.maxModelTurns,
    ),
    maxToolCalls: normalizeLimit(
      value.maxToolCalls,
      DEFAULT_PI_AGENT_LIMITS.maxToolCalls,
    ),
    maxWebSearches: normalizeLimit(
      value.maxWebSearches,
      DEFAULT_PI_AGENT_LIMITS.maxWebSearches,
    ),
  };
}

function normalizeLimit(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

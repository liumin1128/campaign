import {
  DEFAULT_PI_AGENT_LIMITS,
  type PiAgentLimits,
} from "./limits";

const MAX_CONFIGURED_LIMIT = 1_000;

export function getServerPiAgentLimits(): PiAgentLimits {
  return {
    maxModelTurns: readPositiveInteger(
      "PI_AGENT_MAX_MODEL_TURNS",
      DEFAULT_PI_AGENT_LIMITS.maxModelTurns,
    ),
    maxToolCalls: readPositiveInteger(
      "PI_AGENT_MAX_TOOL_CALLS",
      DEFAULT_PI_AGENT_LIMITS.maxToolCalls,
    ),
    maxWebSearches: readPositiveInteger(
      "PI_AGENT_MAX_WEB_SEARCHES",
      DEFAULT_PI_AGENT_LIMITS.maxWebSearches,
    ),
  };
}

function readPositiveInteger(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0
    ? Math.min(value, MAX_CONFIGURED_LIMIT)
    : fallback;
}

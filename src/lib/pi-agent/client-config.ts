"use client";

import {
  DEFAULT_PI_AGENT_LIMITS,
  normalizePiAgentLimits,
  type PiAgentLimits,
} from "./limits";

export async function fetchPiAgentLimits(
  signal?: AbortSignal,
): Promise<PiAgentLimits> {
  try {
    const response = await fetch("/api/pi-agent/config", {
      cache: "no-store",
      signal,
    });
    if (!response.ok) {
      return DEFAULT_PI_AGENT_LIMITS;
    }
    const data = (await response.json()) as { limits?: unknown };
    return normalizePiAgentLimits(data.limits);
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw error;
    }
    return DEFAULT_PI_AGENT_LIMITS;
  }
}

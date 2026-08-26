"use client";

import { DEFAULT_FILE_AGENT_LIMITS, normalizeFileAgentLimits } from "./limits";
import type { FileAgentLimits } from "./types";

export async function fetchFileAgentLimits(signal?: AbortSignal): Promise<FileAgentLimits> {
  try {
    const response = await fetch("/api/pi-agent/config", { cache: "no-store", signal });
    if (!response.ok) return DEFAULT_FILE_AGENT_LIMITS;
    const data = (await response.json()) as { fileLimits?: unknown };
    return normalizeFileAgentLimits(data.fileLimits);
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    return DEFAULT_FILE_AGENT_LIMITS;
  }
}

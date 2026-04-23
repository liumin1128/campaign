"use client";

import { useEffect, useState } from "react";
import * as microsoftTeams from "@microsoft/teams-js";

/**
 * Teams SDK 初始化 Hook
 */
export function useTeams() {
  const [inTeams, setInTeams] = useState(false);
  const [context, setContext] = useState<microsoftTeams.app.Context | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        await microsoftTeams.app.initialize();
        const ctx = await microsoftTeams.app.getContext();
        setContext(ctx);
        setInTeams(true);
      } catch {
        setInTeams(false);
        setError("Not running inside Teams");
      }
    };
    init();
  }, []);

  return { inTeams, context, error };
}

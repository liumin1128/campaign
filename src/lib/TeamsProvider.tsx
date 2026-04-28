"use client";

import { useEffect } from "react";
import { useTeams } from "./useTeams";
import type { ReactNode } from "react";
import { useTeamsUserStore } from "@/store/teams-user-store";

export function TeamsProvider({ children }: { children: ReactNode }) {
  const { context, inTeams, error } = useTeams();
  const syncFromTeams = useTeamsUserStore((state) => state.syncFromTeams);
  const themeName = context?.app?.theme ?? "default";

  useEffect(() => {
    syncFromTeams({ context, inTeams, error });
  }, [context, error, inTeams, syncFromTeams]);

  return (
    <div data-teams-theme={themeName} className="min-h-full">
      {children}
    </div>
  );
}

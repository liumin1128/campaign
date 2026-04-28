"use client";

import { useEffect } from "react";
import { useThemeMode } from "flowbite-react";
import { useTeams } from "./useTeams";
import type { ReactNode } from "react";
import { useTeamsUserStore } from "@/store/teams-user-store";

function getFlowbiteMode(themeName: string) {
  return themeName === "dark" || themeName === "contrast" ? "dark" : "light";
}

export function TeamsProvider({ children }: { children: ReactNode }) {
  const { context, inTeams, error, themeName } = useTeams();
  const { setMode } = useThemeMode();
  const syncFromTeams = useTeamsUserStore((state) => state.syncFromTeams);

  useEffect(() => {
    syncFromTeams({ context, inTeams, error });
  }, [context, error, inTeams, syncFromTeams]);

  useEffect(() => {
    setMode(getFlowbiteMode(themeName));
  }, [setMode, themeName]);

  return (
    <div data-teams-theme={themeName} className="min-h-full">
      {children}
    </div>
  );
}

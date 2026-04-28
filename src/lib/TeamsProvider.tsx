"use client";

import { useTeams } from "./useTeams";
import type { ReactNode } from "react";

export function TeamsProvider({ children }: { children: ReactNode }) {
  const { context } = useTeams();
  const themeName = context?.app?.theme ?? "default";

  return (
    <div data-teams-theme={themeName} className="min-h-full">
      {children}
    </div>
  );
}

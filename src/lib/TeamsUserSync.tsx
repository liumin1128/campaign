"use client";

import { useEffect } from "react";
import { useTeams } from "./useTeams";
import { useTeamsUserStore } from "@/store/teams-user-store";

export function TeamsUserSync() {
  const { context, inTeams, error } = useTeams();
  const syncFromTeams = useTeamsUserStore((state) => state.syncFromTeams);

  useEffect(() => {
    syncFromTeams({ context, inTeams, error });
  }, [context, error, inTeams, syncFromTeams]);

  return null;
}
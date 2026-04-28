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

/** Teams context 中可提取的用户/群组信息 */
export interface TeamsUserInfo {
  userId: string;
  userPrincipalName: string;
  displayName: string;
  tenantId: string;
  teamId: string;
  teamName: string;
  channelId: string;
  channelName: string;
  chatId: string;
  groupId: string;
  locale: string;
  theme: string;
  sessionId: string;
  appHost: string;
}

/** 从 context 提取详细信息 */
export function extractUserInfo(
  context: microsoftTeams.app.Context | null,
): TeamsUserInfo {
  return {
    userId: context?.user?.id ?? "",
    userPrincipalName: context?.user?.userPrincipalName ?? "",
    displayName: context?.user?.displayName ?? "",
    tenantId: context?.user?.tenant?.id ?? "",
    teamId: context?.team?.internalId ?? "",
    teamName: context?.team?.displayName ?? "",
    channelId: context?.channel?.id ?? "",
    channelName: context?.channel?.displayName ?? "",
    chatId: context?.chat?.id ?? "",
    groupId: context?.team?.groupId ?? "",
    locale: context?.app?.locale ?? "",
    theme: context?.app?.theme ?? "",
    sessionId: context?.app?.sessionId ?? "",
    appHost: context?.app?.host?.name ?? "",
  };
}

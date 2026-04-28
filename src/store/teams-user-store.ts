import { create } from "zustand";
import type * as microsoftTeams from "@microsoft/teams-js";
import { extractUserInfo, type TeamsUserInfo } from "@/lib/useTeams";

type TeamsContext = microsoftTeams.app.Context | null;

interface TeamsUserState {
  context: TeamsContext;
  info: TeamsUserInfo;
  inTeams: boolean;
  error: string | null;
  syncFromTeams: (payload: {
    context: TeamsContext;
    inTeams: boolean;
    error: string | null;
  }) => void;
}

const emptyInfo: TeamsUserInfo = {
  userId: "",
  userPrincipalName: "",
  displayName: "",
  tenantId: "",
  teamId: "",
  teamName: "",
  channelId: "",
  channelName: "",
  chatId: "",
  groupId: "",
  locale: "",
  theme: "",
  sessionId: "",
  appHost: "",
};

export const useTeamsUserStore = create<TeamsUserState>()((set) => ({
  context: null,
  info: emptyInfo,
  inTeams: false,
  error: null,
  syncFromTeams: ({ context, inTeams, error }) =>
    set({
      context,
      info: context ? extractUserInfo(context) : emptyInfo,
      inTeams,
      error,
    }),
}));

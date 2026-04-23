"use client";

import {
  FluentProvider,
  webLightTheme,
  teamsDarkTheme,
  teamsLightTheme,
  teamsHighContrastTheme,
} from "@fluentui/react-components";
import { useTeams } from "./useTeams";
import type { ReactNode } from "react";

const themeMap: Record<string, typeof webLightTheme> = {
  default: teamsLightTheme,
  dark: teamsDarkTheme,
  contrast: teamsHighContrastTheme,
};

export function TeamsProvider({ children }: { children: ReactNode }) {
  const { context } = useTeams();
  const themeName = context?.app?.theme ?? "default";
  const theme = themeMap[themeName] ?? teamsLightTheme;

  return <FluentProvider theme={theme}>{children}</FluentProvider>;
}

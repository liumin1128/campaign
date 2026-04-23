"use client";

import { TeamsProvider } from "@/lib/TeamsProvider";
import type { ReactNode } from "react";

export default function TabLayout({ children }: { children: ReactNode }) {
  return <TeamsProvider>{children}</TeamsProvider>;
}

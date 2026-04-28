"use client";

import { useState } from "react";
import {
  CalendarIcon,
  ChartPieIcon,
  DocumentDuplicateIcon,
  FolderIcon,
  HomeIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { classNames } from "@/utils/common";
import { useTeamsUserStore } from "@/store/teams-user-store";

const navigation = [
  { name: "Dashboard", href: "#", icon: HomeIcon, current: true },
  { name: "Team", href: "#", icon: UsersIcon, current: false },
  { name: "Projects", href: "#", icon: FolderIcon, current: false },
  { name: "Calendar", href: "#", icon: CalendarIcon, current: false },
  { name: "Documents", href: "#", icon: DocumentDuplicateIcon, current: false },
  { name: "Reports", href: "#", icon: ChartPieIcon, current: false },
];
const teams = [
  { id: 1, name: "Heroicons", href: "#", initial: "H", current: false },
  { id: 2, name: "Tailwind Labs", href: "#", initial: "T", current: false },
  { id: 3, name: "Workcation", href: "#", initial: "W", current: false },
];

function getUserInitials(displayName: string) {
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "TU";
}

function formatTeamsData(payload: unknown) {
  return JSON.stringify(payload, null, 2);
}

export function Navbar() {
  const [profileOpen, setProfileOpen] = useState(false);
  const context = useTeamsUserStore((state) => state.context);
  const info = useTeamsUserStore((state) => state.info);
  const inTeams = useTeamsUserStore((state) => state.inTeams);
  const error = useTeamsUserStore((state) => state.error);

  const displayName = info.displayName || (inTeams ? "Teams 用户" : "开发者");
  const secondaryLine =
    info.teamName || info.userPrincipalName || "Browser mode";
  const initials = getUserInitials(displayName);
  const teamsData = formatTeamsData({
    inTeams,
    error,
    info,
    context,
  });

  return (
    <>
      <nav className="flex flex-1 flex-col">
        <ul role="list" className="flex flex-1 flex-col gap-y-7">
          <li>
            <ul role="list" className="flex flex-1 flex-col gap-y-7">
              <li>
                <ul role="list" className="-mx-2 space-y-1">
                  {navigation.map((item) => (
                    <li key={item.name}>
                      <a
                        href={item.href}
                        className={classNames(
                          item.current
                            ? "bg-gray-50 text-indigo-600"
                            : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600",
                          "group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold",
                        )}
                      >
                        <item.icon
                          aria-hidden="true"
                          className={classNames(
                            item.current
                              ? "text-indigo-600"
                              : "text-gray-400 group-hover:text-indigo-600",
                            "size-6 shrink-0",
                          )}
                        />
                        {item.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
              <li>
                <div className="text-xs/6 font-semibold text-gray-400">
                  Your teams
                </div>
                <ul role="list" className="-mx-2 mt-2 space-y-1">
                  {teams.map((team) => (
                    <li key={team.name}>
                      <a
                        href={team.href}
                        className={classNames(
                          team.current
                            ? "bg-gray-50 text-indigo-600"
                            : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600",
                          "group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold",
                        )}
                      >
                        <span
                          className={classNames(
                            team.current
                              ? "border-indigo-600 text-indigo-600"
                              : "border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600",
                            "flex size-6 shrink-0 items-center justify-center rounded-lg border bg-white text-[0.625rem] font-medium",
                          )}
                        >
                          {team.initial}
                        </span>
                        <span className="truncate">{team.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </li>
          <li className="-mx-6 mt-auto">
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="flex w-full items-center gap-x-4 px-6 py-3 text-left text-sm/6 hover:bg-gray-50"
            >
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white"
              >
                {initials}
              </span>
              <span className="sr-only">Your profile</span>
              <span className="min-w-0 flex-1" aria-hidden="true">
                <span className="block truncate font-semibold text-gray-900">
                  {displayName}
                </span>
                <span className="block truncate text-xs text-gray-500">
                  {secondaryLine}
                </span>
              </span>
            </button>
          </li>
        </ul>
      </nav>

      {profileOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
          <button
            type="button"
            aria-label="关闭用户上下文弹窗"
            onClick={() => setProfileOpen(false)}
            className="absolute inset-0 bg-slate-900/45"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="teams-context-title"
            className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-900/10"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2
                  id="teams-context-title"
                  className="text-base font-semibold text-slate-900"
                >
                  Teams 用户上下文
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  当前展示 Teams SDK 返回的原始 context 与提取后的字段。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                关闭
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-6 py-5">
              <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-6 text-slate-700">
                {teamsData}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default Navbar;

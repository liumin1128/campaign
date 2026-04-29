"use client";

import { useThemeMode } from "flowbite-react";
import { useState } from "react";
import { Cog, Home, MessageDots } from "flowbite-react-icons/outline";
import { classNames } from "@/utils/common";
import { useTeamsUserStore } from "@/store/teams-user-store";

const navigation = [
  { name: "Campaigns", href: "/tab", icon: Home, current: true },
  { name: "Chat", href: "/tab/chat", icon: MessageDots, current: false },
  // { name: "Team", href: "#", icon: Users, current: false },
  // { name: "Projects", href: "#", icon: Folder, current: false },
  // { name: "Calendar", href: "#", icon: CalendarMonth, current: false },
  // { name: "Documents", href: "#", icon: FileCopy, current: false },
  // { name: "Reports", href: "#", icon: ChartPie, current: false },
  { name: "Settings", href: "/tab/settings", icon: Cog, current: false },
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

function ThemeModeSwitch() {
  const { computedMode, toggleMode } = useThemeMode();

  const isDark = computedMode === "dark";
  const iconClass =
    "size-5 transition duration-200 text-amber-500 dark:text-amber-400";

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
      title={isDark ? "切换到浅色模式" : "切换到深色模式"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-sm shadow-sm transition hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
    >
      {isDark ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={iconClass}
        >
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={iconClass}
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
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
                            ? "bg-gray-50 text-indigo-600 dark:bg-slate-800 dark:text-indigo-300"
                            : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-indigo-300",
                          "group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold",
                        )}
                      >
                        <item.icon
                          aria-hidden="true"
                          className={classNames(
                            item.current
                              ? "text-indigo-600 dark:text-indigo-300"
                              : "text-gray-400 group-hover:text-indigo-600 dark:text-slate-500 dark:group-hover:text-indigo-300",
                            "size-6 shrink-0",
                          )}
                        />
                        {item.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
              {/* <li>
                <div className="text-xs/6 font-semibold text-gray-400 dark:text-slate-500">
                  Your teams
                </div>
                <ul role="list" className="-mx-2 mt-2 space-y-1">
                  {teams.map((team) => (
                    <li key={team.name}>
                      <a
                        href={team.href}
                        className={classNames(
                          team.current
                            ? "bg-gray-50 text-indigo-600 dark:bg-slate-800 dark:text-indigo-300"
                            : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-indigo-300",
                          "group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold",
                        )}
                      >
                        <span
                          className={classNames(
                            team.current
                              ? "border-indigo-600 text-indigo-600 dark:border-indigo-300 dark:text-indigo-300"
                              : "border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500 dark:group-hover:border-indigo-300 dark:group-hover:text-indigo-300",
                            "flex size-6 shrink-0 items-center justify-center rounded-lg border bg-white text-[0.625rem] font-medium dark:bg-slate-900",
                          )}
                        >
                          {team.initial}
                        </span>
                        <span className="truncate">{team.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </li> */}
            </ul>
          </li>
          <li className="-mx-6 mt-auto">
            <div className="flex items-center gap-x-3 px-4 py-3">
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                className="flex min-w-0 flex-1 items-center gap-x-3 text-left text-sm/6 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white"
                >
                  {initials}
                </span>
                <span className="sr-only">Your profile</span>
                <span className="min-w-0 flex-1" aria-hidden="true">
                  <span className="block truncate font-semibold text-gray-900 dark:text-slate-100">
                    {displayName}
                  </span>
                  <span className="block truncate text-xs text-gray-500 dark:text-slate-400">
                    {secondaryLine}
                  </span>
                </span>
              </button>
              <ThemeModeSwitch />
            </div>
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
            className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-900/10 dark:bg-slate-900 dark:ring-white/10"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <div>
                <h2
                  id="teams-context-title"
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  Teams 用户上下文
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  当前展示 Teams SDK 返回的原始 context 与提取后的字段。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                关闭
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-6 py-5 dark:bg-slate-950">
              <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-6 text-slate-700 dark:text-slate-300">
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

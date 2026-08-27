"use client";

import { TeamsUserSync } from "@/lib/TeamsUserSync";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Bars, Close } from "flowbite-react-icons/outline";
import NavBar from "@/components/navbar";
import { usePathname } from "next/navigation";

export default function TabLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);

  useEffect(() => {
    if (!sidebarOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [sidebarOpen]);

  return (
    <>
      <TeamsUserSync />
      <div className="min-h-dvh">
        {sidebarOpen ? (
          <div
            className="relative z-50 lg:hidden"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              aria-label="关闭侧边栏"
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-gray-900/80"
            />

            <div className="fixed inset-0 flex">
              <div className="relative mr-16 flex w-full max-w-xs flex-1">
                <div className="absolute top-0 left-full flex w-16 justify-center pt-5">
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    className="-m-2.5 p-2.5"
                  >
                    <span className="sr-only">Close sidebar</span>
                    <Close aria-hidden="true" className="size-6 text-white" />
                  </button>
                </div>

                <div className="relative flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-2 dark:bg-slate-950">
                  <div className="relative flex h-16 shrink-0 items-center">
                    {/* <img
                        alt="Your Company"
                        src="/plus-assets/img/logos/mark.svg?color=indigo&shade=600"
                        className="h-8 w-auto"
                      /> */}
                  </div>

                  <NavBar onNavigate={() => setSidebarOpen(false)} />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Static sidebar for desktop */}
        <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
          {/* Sidebar component, swap this element with another sidebar if you like */}
          <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex h-16 shrink-0 items-center">
              {/* <img
                  alt="Your Company"
                  src="/plus-assets/img/logos/mark.svg?color=indigo&shade=600"
                  className="h-8 w-auto"
                /> */}
            </div>

            <NavBar />
          </div>
        </div>

        <div className="sticky top-0 z-40 flex h-14 items-center gap-x-4 bg-white px-4 shadow-xs sm:px-6 lg:hidden dark:bg-slate-950">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
            className="flex size-9 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <span className="sr-only">Open sidebar</span>
            <Bars aria-hidden="true" className="size-6" />
          </button>
          <div className="flex-1 text-sm/6 font-semibold text-gray-900 dark:text-slate-100">
            {pageTitle}
          </div>
        </div>

        <main className="min-w-0 lg:pl-72">{children}</main>
      </div>
    </>
  );
}

function getPageTitle(pathname: string) {
  if (pathname.startsWith("/tab/chat")) return "Chat";
  if (pathname.startsWith("/tab/settings")) return "Settings";
  if (pathname.startsWith("/tab/config")) return "Configuration";
  return "Campaigns";
}

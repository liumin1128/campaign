"use client";

import { TeamsProvider } from "@/lib/TeamsProvider";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Bars, Close } from "flowbite-react-icons/outline";
import NavBar from "@/components/navbar";

export default function TabLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    <TeamsProvider>
      <div>
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

                <div className="relative flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-2">
                  <div className="relative flex h-16 shrink-0 items-center">
                    {/* <img
                        alt="Your Company"
                        src="/plus-assets/img/logos/mark.svg?color=indigo&shade=600"
                        className="h-8 w-auto"
                      /> */}
                  </div>

                  <NavBar />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Static sidebar for desktop */}
        <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
          {/* Sidebar component, swap this element with another sidebar if you like */}
          <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6">
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

        <div className="sticky top-0 z-40 flex items-center gap-x-6 bg-white px-4 py-4 shadow-xs sm:px-6 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="-m-2.5 p-2.5 text-gray-700 hover:text-gray-900 lg:hidden"
          >
            <span className="sr-only">Open sidebar</span>
            <Bars aria-hidden="true" className="size-6" />
          </button>
          <div className="flex-1 text-sm/6 font-semibold text-gray-900">
            Dashboard
          </div>
          <a href="#">
            <span className="sr-only">Your profile</span>
            {/* <img
                alt=""
                src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
                className="size-8 rounded-full bg-gray-50 outline -outline-offset-1 outline-black/5"
              /> */}
          </a>
        </div>

        <main className="py-10 lg:pl-72">
          <div className="px-4 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </TeamsProvider>
  );
}

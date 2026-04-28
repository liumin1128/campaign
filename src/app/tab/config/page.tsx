"use client";

import { useEffect } from "react";
import * as microsoftTeams from "@microsoft/teams-js";

export default function TabConfigPage() {
  useEffect(() => {
    const init = async () => {
      try {
        await microsoftTeams.app.initialize();
        microsoftTeams.pages.config.registerOnSaveHandler((saveEvent) => {
          microsoftTeams.pages.config.setConfig({
            entityId: "teamDemo",
            contentUrl: `${window.location.origin}/tab`,
            suggestedDisplayName: "团队协作 Demo",
          });
          saveEvent.notifySuccess();
        });
        microsoftTeams.pages.config.setValidityState(true);
      } catch {
        // 不在 Teams 环境中，忽略
      }
    };
    init();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-12">
      <div className="w-full rounded-4xl border border-slate-200/80 bg-white/90 p-8 shadow-[0_30px_100px_rgba(15,23,42,0.08)] backdrop-blur sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-500">
          Teams Tab Setup
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
          配置团队协作 Tab
        </h1>
        <p className="mt-4 text-base leading-8 text-slate-600">
          点击 Teams 顶部的保存后，这个 Tab 会被添加到频道或群聊中，并展示 campaign workbench、任务管理和消息发送能力。
        </p>

        <div className="mt-8 grid gap-4 rounded-[28px] bg-slate-950 p-5 text-sm text-slate-200 sm:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-slate-400">Entity ID</p>
            <p className="mt-2 font-medium text-white">teamDemo</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-slate-400">Content URL</p>
            <p className="mt-2 break-all font-medium text-white">/tab</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            microsoftTeams.pages.config.setValidityState(true);
          }}
          className="mt-8 inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          确认配置
        </button>
      </div>
    </main>
  );
}

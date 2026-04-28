"use client";

import { useState } from "react";
import { validateTeamsWebhookUrl } from "@/lib/teams-webhook";

const WEBHOOK_STORAGE_KEY = "teams_webhook_url";

export default function TabSettingsPage() {
  const [webhookUrl, setWebhookUrl] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return window.localStorage.getItem(WEBHOOK_STORAGE_KEY) ?? "";
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleSave() {
    const trimmedWebhookUrl = webhookUrl.trim();

    if (!trimmedWebhookUrl) {
      window.localStorage.removeItem(WEBHOOK_STORAGE_KEY);
      setStatusMessage(
        "已清除本地保存的 Teams webhook URL。任务完成后将只使用服务端环境变量。\n",
      );
      setErrorMessage(null);
      return;
    }

    try {
      validateTeamsWebhookUrl(trimmedWebhookUrl);
      window.localStorage.setItem(WEBHOOK_STORAGE_KEY, trimmedWebhookUrl);
      setWebhookUrl(trimmedWebhookUrl);
      setStatusMessage(
        "Teams webhook URL 已保存。后续任务完成时会自动带上这个地址发送通知。",
      );
      setErrorMessage(null);
    } catch (error) {
      setStatusMessage(null);
      setErrorMessage(
        error instanceof Error ? error.message : "Webhook URL 校验失败",
      );
    }
  }

  function handleClear() {
    window.localStorage.removeItem(WEBHOOK_STORAGE_KEY);
    setWebhookUrl("");
    setStatusMessage(
      "已清除本地保存的 Teams webhook URL。任务完成后将只使用服务端环境变量。\n",
    );
    setErrorMessage(null);
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <section className="rounded-4xl border border-slate-200/80 bg-white/90 p-8 shadow-[0_30px_100px_rgba(15,23,42,0.08)] backdrop-blur sm:p-10 dark:border-slate-800 dark:bg-slate-950/85">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-500">
          Settings
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
          Teams Webhook 设置
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600 dark:text-slate-400">
          配置后，任务从 todo 变成 done 时会自动向 Teams Incoming Webhook
          发送消息，内容包含当前用户和任务名称。
        </p>

        <div className="mt-8 rounded-[28px] border border-slate-200/80 bg-slate-50/90 p-5 dark:border-slate-800 dark:bg-slate-900/70">
          <label
            htmlFor="teams-webhook-url"
            className="block text-sm font-semibold text-slate-900 dark:text-slate-100"
          >
            Incoming Webhook URL
          </label>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            支持 Microsoft Teams Incoming Webhook、Power Automate 和 Logic App
            地址。
          </p>

          <textarea
            id="teams-webhook-url"
            rows={5}
            value={webhookUrl}
            onChange={(event) => setWebhookUrl(event.target.value)}
            placeholder="https://..."
            className="mt-4 block w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/10"
          />

          {statusMessage ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
              {statusMessage}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              保存 Webhook
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
            >
              清除本地设置
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

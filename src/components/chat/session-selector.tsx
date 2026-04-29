"use client";

import { Plus, TrashBin } from "flowbite-react-icons/outline";
import type { ChatSession } from "@/store/chat-store";
import type { Message, Language } from "./types";
import { t } from "./i18n";

interface SessionSelectorProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  language: Language;
  onNew: () => void;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

function getPreview(messages: Message[]): string {
  if (messages.length === 0) return "";
  const last = messages[messages.length - 1];
  if (last.content) {
    return last.content.length > 40
      ? last.content.slice(0, 40) + "…"
      : last.content;
  }
  return "";
}

function countUserMessages(messages: Message[]): number {
  return messages.filter((m) => m.role === "user").length;
}

export function SessionSelector({
  sessions,
  activeSessionId,
  language,
  onNew,
  onSwitch,
  onDelete,
}: SessionSelectorProps) {
  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r border-gray-200 bg-gray-50/50 dark:border-slate-700 dark:bg-slate-900/30">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-slate-700">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
          {t(language, "session_title")}
        </span>
        <button
          type="button"
          onClick={() => onNew()}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
        >
          <Plus className="size-3.5" />
          {t(language, "session_new")}
        </button>
      </div>

      {/* 会话列表（可滚动） */}
      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {sessions.length === 0 && (
          <p className="py-8 text-center text-xs text-gray-400 dark:text-slate-500">
            {t(language, "session_empty")}
          </p>
        )}

        {sessions.map((s) => {
          const isActive = s.id === activeSessionId;
          const userCount = countUserMessages(s.messages);
          const preview = getPreview(s.messages);

          return (
            <div
              key={s.id}
              className={`group relative cursor-pointer rounded-lg border px-3 py-2.5 transition ${
                isActive
                  ? "border-indigo-300 bg-indigo-50 shadow-sm dark:border-indigo-600 dark:bg-indigo-900/20"
                  : "border-transparent hover:border-gray-200 hover:bg-white hover:shadow-sm dark:hover:border-slate-600 dark:hover:bg-slate-800/80"
              }`}
              onClick={() => onSwitch(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSwitch(s.id);
                }
              }}
              tabIndex={0}
              role="button"
            >
              {/* 标题行 */}
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`truncate text-sm ${
                    isActive
                      ? "font-medium text-indigo-900 dark:text-indigo-200"
                      : "font-medium text-gray-800 dark:text-slate-200"
                  }`}
                >
                  {s.title}
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(s.id);
                  }}
                  className="invisible shrink-0 rounded p-0.5 text-gray-400 opacity-0 transition hover:bg-gray-200 hover:text-red-500 group-hover:visible group-hover:opacity-100 dark:hover:bg-slate-600 dark:hover:text-red-400"
                >
                  <TrashBin className="size-3.5" />
                </button>
              </div>

              {/* 预览 */}
              <p className="mt-0.5 truncate text-xs leading-relaxed text-gray-400 dark:text-slate-500">
                {s.messages.length > 0
                  ? s.messages[s.messages.length - 1].content
                    ? preview
                    : t(language, "session_waiting")
                  : t(language, "session_empty_preview")}
              </p>

              {/* 消息数 */}
              {userCount > 0 && (
                <span className="mt-1 inline-block rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-slate-700 dark:text-slate-400">
                  {t(language, "session_count", { n: userCount })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

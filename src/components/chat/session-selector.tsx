"use client";

import { useState } from "react";
import {
  Check,
  Close,
  Edit,
  Plus,
  TrashBin,
} from "flowbite-react-icons/outline";
import { MAX_SESSIONS, type ChatSession } from "@/store/chat-store";
import type { Message, Language } from "./types";
import { t } from "./i18n";

interface SessionSelectorProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  loadingSessionIds: string[];
  language: Language;
  onNew: () => void;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onClose?: () => void;
}

function getPreview(messages: Message[]): string {
  const last = messages.at(-1);
  if (!last?.content) return "";
  return last.content.length > 40
    ? `${last.content.slice(0, 40)}…`
    : last.content;
}

function countUserMessages(messages: Message[]): number {
  return messages.filter((message) => message.role === "user").length;
}

export function SessionSelector({
  sessions,
  activeSessionId,
  loadingSessionIds,
  language,
  onNew,
  onSwitch,
  onDelete,
  onRename,
  onClose,
}: SessionSelectorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const atLimit = sessions.length >= MAX_SESSIONS;
  const loadingIds = new Set(loadingSessionIds);

  function startRename(session: ChatSession) {
    setPendingDeleteId(null);
    setEditingId(session.id);
    setDraftTitle(session.title);
  }

  function cancelRename() {
    setEditingId(null);
    setDraftTitle("");
  }

  function saveRename(sessionId: string) {
    const normalizedTitle = draftTitle.trim();
    if (normalizedTitle) onRename(sessionId, normalizedTitle);
    cancelRename();
  }

  return (
    <aside
      aria-label={t(language, "session_title")}
      className="flex h-full min-h-0 w-full flex-col border-r border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 px-4 dark:border-slate-700">
        <span className="text-xs font-semibold uppercase text-gray-500 dark:text-slate-400">
          {t(language, "session_title")}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onNew}
            disabled={atLimit}
            aria-label={
              atLimit
                ? t(language, "session_limit", { n: MAX_SESSIONS })
                : t(language, "session_new_title")
            }
            title={
              atLimit
                ? t(language, "session_limit", { n: MAX_SESSIONS })
                : t(language, "session_new_title")
            }
            className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
          >
            <Plus aria-hidden="true" className="size-4" />
            {t(language, "session_new")}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t(language, "session_close")}
              className="flex size-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 md:hidden dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Close aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <p className="py-8 text-center text-xs text-gray-400 dark:text-slate-500">
            {t(language, "session_empty")}
          </p>
        ) : (
          <ul className="space-y-1">
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const isLoading = loadingIds.has(session.id);
              const isEditing = editingId === session.id;
              const isConfirmingDelete = pendingDeleteId === session.id;
              const userCount = countUserMessages(session.messages);
              const preview = getPreview(session.messages);

              return (
                <li
                  key={session.id}
                  className={`group relative overflow-hidden rounded-md border transition ${
                    isActive
                      ? "border-indigo-300 bg-indigo-50 shadow-sm dark:border-indigo-600 dark:bg-indigo-900/20"
                      : "border-transparent hover:border-gray-200 hover:bg-white dark:hover:border-slate-600 dark:hover:bg-slate-800"
                  }`}
                >
                  {isEditing ? (
                    <form
                      className="flex items-center gap-1.5 p-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveRename(session.id);
                      }}
                    >
                      <label className="min-w-0 flex-1">
                        <span className="sr-only">
                          {t(language, "session_rename_input")}
                        </span>
                        <input
                          autoFocus
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") cancelRename();
                          }}
                          className="h-8 w-full rounded-md border border-indigo-300 bg-white px-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-indigo-200 dark:border-indigo-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-indigo-900"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={!draftTitle.trim()}
                        aria-label={t(language, "dev_mode_save")}
                        className="flex size-8 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-40 dark:hover:bg-emerald-950/30"
                      >
                        <Check aria-hidden="true" className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelRename}
                        aria-label={t(language, "dev_mode_cancel")}
                        className="flex size-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-400 dark:hover:bg-slate-700"
                      >
                        <Close aria-hidden="true" className="size-4" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onSwitch(session.id)}
                        className="block w-full px-3 py-2.5 pr-20 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                        aria-current={isActive ? "true" : undefined}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`truncate text-sm font-medium ${
                              isActive
                                ? "text-indigo-900 dark:text-indigo-200"
                                : "text-gray-800 dark:text-slate-200"
                            }`}
                          >
                            {session.title}
                          </span>
                          {isLoading && (
                            <span
                              className="size-1.5 shrink-0 animate-pulse rounded-full bg-indigo-500 motion-reduce:animate-none"
                              title={t(language, "session_loading")}
                            >
                              <span className="sr-only">
                                {t(language, "session_loading")}
                              </span>
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs leading-relaxed text-gray-500 dark:text-slate-400">
                          {isLoading && !preview
                            ? t(language, "session_waiting")
                            : preview || t(language, "session_empty_preview")}
                        </span>
                        {userCount > 0 && (
                          <span className="mt-1 inline-block rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-slate-700 dark:text-slate-300">
                            {t(language, "session_count", { n: userCount })}
                          </span>
                        )}
                      </button>

                      <div className="absolute right-2 top-2 flex gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={() => startRename(session)}
                          aria-label={t(language, "session_rename")}
                          title={t(language, "session_rename")}
                          className="flex size-7 items-center justify-center rounded-md bg-white/80 text-gray-500 hover:bg-gray-100 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-indigo-300"
                        >
                          <Edit aria-hidden="true" className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setPendingDeleteId(session.id);
                          }}
                          aria-label={t(language, "session_delete")}
                          title={t(language, "session_delete")}
                          className="flex size-7 items-center justify-center rounded-md bg-white/80 text-gray-500 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                        >
                          <TrashBin aria-hidden="true" className="size-3.5" />
                        </button>
                      </div>

                      {isConfirmingDelete && (
                        <div className="flex items-center gap-2 border-t border-red-100 bg-red-50 px-3 py-2 dark:border-red-900/50 dark:bg-red-950/30">
                          <span className="min-w-0 flex-1 text-xs text-red-700 dark:text-red-300">
                            {t(language, "session_delete_confirm")}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(null)}
                            className="h-7 rounded-md px-2 text-xs text-gray-600 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            {t(language, "session_delete_cancel")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingDeleteId(null);
                              onDelete(session.id);
                            }}
                            className="h-7 rounded-md bg-red-600 px-2 text-xs font-medium text-white hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
                          >
                            {t(language, "session_delete")}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

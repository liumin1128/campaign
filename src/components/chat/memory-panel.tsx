"use client";

import { BookOpen, TrashBin } from "flowbite-react-icons/outline";
import type { ConversationMemory } from "@/lib/chat-memory/types";
import type { Language } from "./types";
import { t } from "./i18n";

interface MemoryPanelProps {
  enabled: boolean;
  memories: ConversationMemory[];
  usedMemoryIds: string[];
  language: Language;
  onEnabledChange: (enabled: boolean) => void;
  onDelete: (memoryId: string) => void;
  onClear: () => void;
}

export function MemoryPanel({
  enabled,
  memories,
  usedMemoryIds,
  language,
  onEnabledChange,
  onDelete,
  onClear,
}: MemoryPanelProps) {
  const usedIds = new Set(usedMemoryIds);

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpen className="size-4 shrink-0 text-indigo-500" />
          <span className="truncate text-xs font-medium text-gray-700 dark:text-slate-300">
            {enabled
              ? t(language, "memory_enabled")
              : t(language, "memory_disabled")}
          </span>
        </div>
        <label className="relative inline-flex shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
            className="peer sr-only"
          />
          <span className="h-5 w-9 rounded-full bg-gray-200 transition peer-checked:bg-indigo-500 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-300 dark:bg-slate-700" />
          <span className="absolute left-0.5 size-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-gray-500 dark:text-slate-400">
          {t(language, "memory_count", { n: memories.length })}
        </span>
        {memories.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t(language, "memory_clear_confirm"))) {
                onClear();
              }
            }}
            className="text-[11px] font-medium text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
          >
            {t(language, "memory_clear")}
          </button>
        )}
      </div>

      {memories.length === 0 ? (
        <div className="py-8 text-center text-xs text-gray-400 dark:text-slate-500">
          {t(language, "memory_empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {memories.map((memory) => (
            <article
              key={memory.id}
              className="rounded-lg border border-gray-200 p-3 dark:border-slate-700"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate text-xs font-medium text-gray-800 dark:text-slate-200">
                      {memory.sessionTitle || t(language, "session_new_title")}
                    </h3>
                    {usedIds.has(memory.id) && (
                      <span className="shrink-0 rounded bg-indigo-50 px-1 py-0.5 text-[9px] font-medium text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
                        {t(language, "memory_used")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10px] text-gray-400 dark:text-slate-500">
                    {formatMemoryDate(memory.updatedAt, language)} · {memory.agentId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(memory.id)}
                  title={t(language, "memory_delete")}
                  className="shrink-0 rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                >
                  <TrashBin className="size-3.5" />
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-gray-600 dark:text-slate-400">
                {memory.summary}
              </p>
              {memory.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {memory.tags.slice(0, 8).map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-500 dark:bg-slate-800 dark:text-slate-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function formatMemoryDate(timestamp: number, language: Language) {
  if (!Number.isFinite(timestamp)) return "";
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

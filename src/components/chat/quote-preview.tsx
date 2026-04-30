"use client";

import type { QuotedMessage, Language } from "./types";
import { t } from "./i18n";
import { Close } from "flowbite-react-icons/outline";

interface QuotePreviewProps {
  quotedMessages: QuotedMessage[];
  language: Language;
  onRemove: (id: string) => void;
}

/** 截取前 120 个字符作为缩略 */
function truncate(text: string, max = 120): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

export function QuotePreview({
  quotedMessages,
  language,
  onRemove,
}: QuotePreviewProps) {
  if (quotedMessages.length === 0) return null;

  return (
    <div className="mb-2 space-y-1.5">
      {quotedMessages.map((qm) => {
        const roleLabel =
          qm.role === "user"
            ? t(language, "quote_you")
            : t(language, "quote_assistant");

        return (
          <div
            key={qm.id}
            className="flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2 dark:border-indigo-800/50 dark:bg-indigo-950/20"
          >
            {/* 左侧引用竖线 */}
            <div className="mt-0.5 w-0.5 shrink-0 self-stretch rounded-full bg-indigo-400 dark:bg-indigo-500" />

            <div className="min-w-0 flex-1">
              {/* 来源信息 */}
              <div className="mb-0.5 flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400">
                <span className="font-medium">{roleLabel}</span>
                <span className="opacity-50">·</span>
                <span className="truncate opacity-70">{qm.sessionTitle}</span>
              </div>

              {/* 缩略内容 — hover 时显示全部 */}
              <p
                className="cursor-help truncate text-xs leading-relaxed text-indigo-800 dark:text-indigo-200"
                title={qm.content}
              >
                {truncate(qm.content)}
              </p>
            </div>

            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={() => onRemove(qm.id)}
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded text-indigo-400 transition hover:bg-indigo-200 hover:text-indigo-700 dark:hover:bg-indigo-800 dark:hover:text-indigo-200"
              title={t(language, "quote_remove")}
            >
              <Close className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

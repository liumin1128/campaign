"use client";

import { Database, FileCsv, FileImport } from "flowbite-react-icons/outline";
import { isMarkdownContent } from "@/utils/markdown";
import MarkdownDisplay from "@/components/markdown-display";
import { ReasoningBlock } from "./reasoning-block";
import { CopyButton } from "./copy-button";
import { QuoteButton } from "./quote-button";
import type { Message, Language, QuotedMessage } from "./types";
import { t } from "./i18n";
import { formatBytes } from "@/lib/client-analysis/csv-analysis-prompts";

function LoadingDots() {
  return (
    <span className="inline-flex gap-1">
      <span className="animate-bounce motion-reduce:animate-none">.</span>
      <span className="animate-bounce [animation-delay:0.2s] motion-reduce:animate-none">
        .
      </span>
      <span className="animate-bounce [animation-delay:0.4s] motion-reduce:animate-none">
        .
      </span>
    </span>
  );
}

interface MessageBubbleProps {
  message: Message;
  isLatest: boolean;
  isLoading: boolean;
  language: Language;
  sessionId: string;
  sessionTitle: string;
  quotedMessages: QuotedMessage[];
  onToggleQuote: (msg: QuotedMessage) => void;
}

export function MessageBubble({
  message,
  isLatest,
  isLoading,
  language,
  sessionId,
  sessionTitle,
  quotedMessages,
  onToggleQuote,
}: MessageBubbleProps) {
  const content = message.content || "";
  const showActions = content.length > 0 && !(isLoading && isLatest);

  return (
    <div
      className={`flex group ${message.role === "user" ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`space-y-1 ${
          message.role === "assistant"
            ? "order-first max-w-full sm:max-w-[92%]"
            : "max-w-[88%] sm:max-w-[80%]"
        }`}
      >
        {message.role === "assistant" && message.reasoning && (
          <ReasoningBlock text={message.reasoning} language={language} />
        )}

        <div className="relative">
          {message.role === "assistant" &&
          message.content &&
          isMarkdownContent(message.content) ? (
            <div className="rounded-xl border border-gray-200/80 bg-white px-4 py-3 text-gray-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              <MarkdownDisplay content={message.content} />
            </div>
          ) : (
            <div
              className={`px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                message.role === "user"
                  ? "rounded-2xl bg-indigo-600 text-white"
                  : "rounded-xl border border-gray-200/80 bg-white text-gray-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              }`}
            >
              {message.content ||
                (isLoading && isLatest ? <LoadingDots /> : null)}
            </div>
          )}
        </div>

        {showActions && (
          <div className="flex gap-0.5">
            <QuoteButton
              message={message}
              sessionId={sessionId}
              sessionTitle={sessionTitle}
              quotedMessages={quotedMessages}
              language={language}
              onToggleQuote={onToggleQuote}
            />
            <CopyButton content={content} language={language} />
          </div>
        )}

        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {message.attachments.map((att, idx) => (
              <div
                key={att.id ?? `${att.name}-${idx}`}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                  message.role === "user"
                    ? "border-indigo-300/50 bg-indigo-500/20 text-indigo-100"
                    : "border-gray-200 bg-gray-50 text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {att.type === "csv-analysis" ? (
                  <Database className="size-4 shrink-0" />
                ) : att.type === "file" ? (
                  <FileImport className="size-4 shrink-0" />
                ) : (
                  <FileCsv className="size-4 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">
                  {att.name}
                  {att.size ? ` · ${formatBytes(att.size)}` : ""}
                </span>
                <span className="shrink-0 opacity-60">
                  {t(
                    language,
                    att.type === "csv-analysis"
                      ? "file_type_csv_analysis"
                      : att.type === "file"
                        ? "file_type_file"
                      : att.type === "csv"
                        ? "file_type_csv"
                        : "file_type_text",
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

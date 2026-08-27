"use client";

import { useLayoutEffect } from "react";
import {
  Brain,
  Close,
  Database,
  FileImport,
  PaperPlane,
  Stop,
} from "flowbite-react-icons/outline";
import { FileCsv } from "flowbite-react-icons/outline";
import type { FileAttachment, Language, QuotedMessage } from "./types";
import { t } from "./i18n";
import { QuotePreview } from "./quote-preview";
import { formatBytes } from "@/lib/client-analysis/csv-analysis-prompts";

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  isPreparingAttachments: boolean;
  language: Language;
  enableThinking: boolean;
  fileAttachments: FileAttachment[];
  quotedMessages: QuotedMessage[];
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  largeCsvInputRef: React.RefObject<HTMLInputElement | null>;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLargeCsvSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
  onLanguageChange: (lang: Language) => void;
  onThinkingChange: (enabled: boolean) => void;
  onRemoveQuote: (id: string) => void;
}

export function ChatInput({
  input,
  isLoading,
  isPreparingAttachments,
  language,
  enableThinking,
  fileAttachments,
  quotedMessages,
  inputRef,
  fileInputRef,
  largeCsvInputRef,
  onInputChange,
  onSend,
  onStop,
  onKeyDown,
  onFileSelect,
  onLargeCsvSelect,
  onRemoveFile,
  onLanguageChange,
  onThinkingChange,
  onRemoveQuote,
}: ChatInputProps) {
  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 80), 160);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 160 ? "auto" : "hidden";
  }, [input, inputRef]);

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-2 sm:px-4">
      {/* 引用预览 */}
      <QuotePreview
        quotedMessages={quotedMessages}
        language={language}
        onRemove={onRemoveQuote}
      />

      {fileAttachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {fileAttachments.map((att, idx) => (
            <div
              key={att.id ?? `${att.name}-${idx}`}
              className={`flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1 ${
                att.type === "csv-analysis"
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                  : "border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30"
              }`}
            >
              {att.type === "csv-analysis" ? (
                <Database className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : att.type === "file" ? (
                <FileImport className="size-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
              ) : (
                <FileCsv className="size-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
              )}
              <span
                className={`max-w-55 truncate text-xs ${
                  att.type === "csv-analysis"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-indigo-700 dark:text-indigo-300"
                }`}
              >
                {att.name}
                {att.size ? ` · ${formatBytes(att.size)}` : ""}
                {att.type === "file" && att.descriptor
                  ? ` · ${att.descriptor.kind}`
                  : ""}
                {att.type === "csv-analysis"
                  ? ` · ${getAnalysisLabel(language, att)}${getAnalysisProgressText(att)}`
                  : ""}
              </span>
              <button
                type="button"
                onClick={() => onRemoveFile(idx)}
                disabled={isLoading}
                aria-label={`${t(language, "file_remove")}: ${att.name}`}
                title={t(language, "file_remove")}
                className={`flex size-6 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 ${
                  att.type === "csv-analysis"
                    ? "text-emerald-500 hover:bg-emerald-200 hover:text-emerald-700 dark:hover:bg-emerald-800 dark:hover:text-emerald-200"
                    : "text-indigo-400 hover:bg-indigo-200 hover:text-indigo-700 dark:hover:bg-indigo-800 dark:hover:text-indigo-200"
                }`}
              >
                <Close aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        aria-busy={isLoading || isPreparingAttachments}
        className={`relative rounded-xl border bg-white transition-colors ${
          isLoading
            ? "border-gray-200 dark:border-slate-700"
            : "border-gray-300 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-100 dark:border-slate-600 dark:focus-within:border-indigo-500 dark:focus-within:ring-indigo-900/40"
        } dark:bg-slate-800`}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          aria-label={t(language, "chat_input_placeholder")}
          placeholder={
            isLoading
              ? t(language, "chat_input_loading_placeholder")
              : t(language, "chat_input_placeholder")
          }
          className="min-h-20 w-full resize-none bg-transparent px-3 pb-11 pt-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-slate-100 dark:placeholder-slate-500"
        />

        <div className="absolute bottom-1 left-1 right-1 flex h-9 items-center justify-between">
          <div className="flex items-center gap-0.5">
            {/* 语言切换 */}
            <button
              type="button"
              onClick={() => onLanguageChange(language === "zh" ? "en" : "zh")}
              disabled={isLoading}
              aria-label={t(
                language,
                language === "zh" ? "lang_switch_to_en" : "lang_switch_to_zh",
              )}
              className="flex size-8 items-center justify-center rounded-md text-[10px] font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              title={t(
                language,
                language === "zh" ? "lang_switch_to_en" : "lang_switch_to_zh",
              )}
            >
              {language === "zh" ? "EN" : "中"}
            </button>
            <button
              type="button"
              onClick={() => onThinkingChange(!enableThinking)}
              disabled={isLoading}
              aria-pressed={enableThinking}
              aria-label={t(
                language,
                enableThinking ? "thinking_on_title" : "thinking_off_title",
              )}
              className={`flex size-8 items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40 ${
                enableThinking
                  ? "bg-indigo-100 text-indigo-600 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
                  : "text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
              }`}
              title={t(
                language,
                enableThinking ? "thinking_on_title" : "thinking_off_title",
              )}
            >
              <Brain className="size-3.5" />
            </button>
          </div>

          {/* 右侧操作按钮 */}
          <div className="flex items-center gap-0.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={onFileSelect}
              className="sr-only"
              tabIndex={-1}
            />
            <input
              ref={largeCsvInputRef}
              type="file"
              multiple
              accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onLargeCsvSelect}
              className="sr-only"
              tabIndex={-1}
            />

            {isPreparingAttachments && (
              <span
                role="status"
                className="mr-1 hidden text-[11px] text-gray-500 sm:inline dark:text-slate-400"
              >
                {t(language, "files_preparing")}
              </span>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isPreparingAttachments}
              aria-label={t(language, "upload_file_title")}
              title={t(language, "upload_file_title")}
              className="flex size-8 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              <FileImport aria-hidden="true" className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => largeCsvInputRef.current?.click()}
              disabled={isLoading || isPreparingAttachments}
              aria-label={t(language, "upload_large_csv_title")}
              title={t(language, "upload_large_csv_title")}
              className="flex size-8 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              <Database aria-hidden="true" className="size-4" />
            </button>

            {isLoading ? (
              <button
                type="button"
                onClick={onStop}
                aria-label={t(language, "stop_title")}
                className="flex size-8 items-center justify-center rounded-md bg-red-500 text-white transition hover:bg-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
                title={t(language, "stop_title")}
              >
                <Stop aria-hidden="true" className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={
                  isPreparingAttachments ||
                  (!input.trim() && fileAttachments.length === 0)
                }
                aria-label={t(language, "send_title")}
                title={t(language, "send_title")}
                className="flex size-8 items-center justify-center rounded-md bg-indigo-600 text-white transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-indigo-600"
              >
                <PaperPlane aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getAnalysisLabel(language: Language, attachment: FileAttachment) {
  const status = attachment.analysis?.status ?? "profiling";

  switch (status) {
    case "profiling":
      return t(language, "csv_analysis_profiling");
    case "profiled":
      return t(language, "csv_analysis_profiled");
    case "planning":
      return t(language, "csv_analysis_planning");
    case "executing":
      return t(language, "csv_analysis_executing");
    case "summarizing":
      return t(language, "csv_analysis_summarizing");
    case "completed":
      return t(language, "csv_analysis_completed");
    case "failed":
    default:
      return t(language, "csv_analysis_failed");
  }
}

function getAnalysisProgressText(attachment: FileAttachment) {
  const progress = attachment.analysis?.progress;
  if (typeof progress !== "number") {
    return "";
  }

  const percent = Math.round(Math.max(0, Math.min(progress, 1)) * 100);
  if (percent <= 0 || percent >= 100) {
    return "";
  }

  return ` ${percent}%`;
}

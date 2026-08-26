"use client";

import {
  Brain,
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
  const fileInputId = "chat-file-attachments-input";
  const largeCsvInputId = "chat-large-csv-analysis-input";

  return (
    <div className="px-4 py-2">
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
              key={idx}
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
                className={`flex size-4 shrink-0 items-center justify-center rounded-full ${
                  att.type === "csv-analysis"
                    ? "text-emerald-500 hover:bg-emerald-200 hover:text-emerald-700 dark:hover:bg-emerald-800 dark:hover:text-emerald-200"
                    : "text-indigo-400 hover:bg-indigo-200 hover:text-indigo-700 dark:hover:bg-indigo-800 dark:hover:text-indigo-200"
                }`}
              >
                <svg
                  className="size-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div
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
          disabled={isLoading}
          rows={1}
          placeholder={
            isLoading
              ? t(language, "chat_input_loading_placeholder")
              : t(language, "chat_input_placeholder")
          }
          className="h-auto max-h-20 min-h-9 w-full resize-none bg-transparent px-3 pb-8 pt-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-50 dark:text-slate-100 dark:placeholder-slate-500"
        />

        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-1.5 py-1">
          <div className="flex items-center gap-0.5">
            {/* 语言切换 */}
            <button
              type="button"
              onClick={() => onLanguageChange(language === "zh" ? "en" : "zh")}
              disabled={isLoading}
              className="flex size-6 items-center justify-center rounded-md text-[10px] font-semibold text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 dark:hover:bg-slate-700 dark:hover:text-slate-300"
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
              className={`flex size-6 items-center justify-center rounded-md transition disabled:opacity-40 ${
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
              id={fileInputId}
              ref={fileInputRef}
              type="file"
              multiple
              onChange={onFileSelect}
              className="sr-only"
              tabIndex={-1}
            />
            <input
              id={largeCsvInputId}
              ref={largeCsvInputRef}
              type="file"
              multiple
              accept=".csv,text/csv"
              onChange={onLargeCsvSelect}
              className="sr-only"
              tabIndex={-1}
            />

            {isLoading ? (
              <button
                type="button"
                onClick={onStop}
                className="flex size-6 items-center justify-center rounded-md bg-red-500 text-white transition hover:bg-red-400"
                title={t(language, "stop_title")}
              >
                <Stop className="size-3.5" />
              </button>
            ) : (
              <>
                <label
                  htmlFor={fileInputId}
                  aria-disabled={isLoading}
                  className="flex size-6 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                  title={t(language, "upload_file_title")}
                >
                  <FileImport className="size-3.5" />
                </label>
                <label
                  htmlFor={largeCsvInputId}
                  aria-disabled={isLoading}
                  className="flex size-6 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                  title={t(language, "upload_large_csv_title")}
                >
                  <Database className="size-3.5" />
                </label>
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!input.trim() && fileAttachments.length === 0}
                  className="flex size-6 items-center justify-center rounded-md bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600"
                >
                  <PaperPlane className="size-3.5" />
                </button>
              </>
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

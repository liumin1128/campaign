"use client";

import { FileImport, PaperPlane, Stop } from "flowbite-react-icons/outline";
import { FileCsv } from "flowbite-react-icons/outline";
import type { FileAttachment } from "./types";

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  fileAttachments: FileAttachment[];
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
}

export function ChatInput({
  input,
  isLoading,
  fileAttachments,
  inputRef,
  fileInputRef,
  onInputChange,
  onSend,
  onStop,
  onKeyDown,
  onFileSelect,
  onRemoveFile,
}: ChatInputProps) {
  return (
    <div className="border-t border-gray-200 pt-4 dark:border-slate-700">
      {fileAttachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {fileAttachments.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 dark:border-indigo-800 dark:bg-indigo-950/30"
            >
              <FileCsv className="size-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span className="max-w-[200px] truncate text-sm text-indigo-700 dark:text-indigo-300">
                {att.name}
              </span>
              <button
                type="button"
                onClick={() => onRemoveFile(idx)}
                className="flex size-5 shrink-0 items-center justify-center rounded-full text-indigo-400 hover:bg-indigo-200 hover:text-indigo-700 dark:hover:bg-indigo-800 dark:hover:text-indigo-200"
              >
                <svg
                  className="size-3.5"
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
        className={`relative rounded-2xl border bg-white transition-colors ${
          isLoading
            ? "border-gray-200 dark:border-slate-700"
            : "border-gray-300 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 dark:border-slate-600 dark:focus-within:border-indigo-500 dark:focus-within:ring-indigo-900/40"
        } dark:bg-slate-800`}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isLoading}
          placeholder={
            isLoading ? "AI 正在回复..." : "输入消息，Shift+Enter 换行..."
          }
          className="h-[140px] w-full resize-none bg-transparent px-4 pb-12 pt-4 text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-50 dark:text-slate-100 dark:placeholder-slate-500"
        />

        <div className="absolute bottom-0 right-0 flex items-center gap-1 p-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv,.txt,.md,.json,text/*"
            onChange={onFileSelect}
            className="hidden"
          />

          {isLoading ? (
            <button
              type="button"
              onClick={onStop}
              className="flex size-8 items-center justify-center rounded-lg bg-red-500 text-white transition hover:bg-red-400"
              title="停止生成"
            >
              <Stop className="size-4" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="flex size-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                title="上传文件（支持 CSV）"
              >
                <FileImport className="size-4.5" />
              </button>
              <button
                type="button"
                onClick={onSend}
                disabled={!input.trim() && fileAttachments.length === 0}
                className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600"
              >
                <PaperPlane className="size-4.5" />
              </button>
            </>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-gray-400 dark:text-slate-500">
        {isLoading
          ? "正在生成回复，点击停止按钮中断"
          : "回车发送 · 支持 CSV 文件上传解析"}
      </p>
    </div>
  );
}

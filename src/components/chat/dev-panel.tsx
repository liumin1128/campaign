"use client";

import { useState, useMemo } from "react";
import type { Language, Message } from "./types";
import { t } from "./i18n";

// ---------- Types ----------

export interface DevPanelData {
  /** 当前 Agent 的完整系统提示词（含全局规则 + 语言指令） */
  systemPrompt: string;
  /** 全局规则（单独展示） */
  globalRules: string;
  /** 语言指令片段 */
  langInstruction: string;
  /** 发送给 API 的消息列表 */
  apiMessages: Array<{ role: string; content: string }>;
  /** 当前会话的所有消息（用于提取 reasoning） */
  messages: Message[];
}

type Tab = "system" | "messages" | "reasoning";

// ---------- Component ----------

interface DevPanelProps {
  isOpen: boolean;
  onClose: () => void;
  data: DevPanelData;
  language: Language;
}

export function DevPanel({ isOpen, onClose, data, language }: DevPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("system");

  // 提取所有 assistant 消息的 reasoning
  const reasoningItems = useMemo(() => {
    return data.messages
      .filter(
        (m): m is Message & { reasoning: string } =>
          m.role === "assistant" && !!m.reasoning,
      )
      .map((m) => ({
        id: m.id,
        content: m.reasoning,
        contentPreview: m.content.slice(0, 120),
      }));
  }, [data.messages]);

  if (!isOpen) return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "system", label: t(language, "dev_mode_tab_system") },
    { id: "messages", label: t(language, "dev_mode_tab_messages") },
    { id: "reasoning", label: t(language, "dev_mode_tab_reasoning") },
  ];

  return (
    <div className="flex w-96 shrink-0 flex-col border-l border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-slate-200">
          {t(language, "dev_mode_title")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          aria-label="Close"
        >
          <svg
            className="size-4"
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

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-slate-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition ${
              activeTab === tab.id
                ? "border-b-2 border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "system" && (
          <SystemTab data={data} language={language} />
        )}
        {activeTab === "messages" && (
          <MessagesTab data={data} language={language} />
        )}
        {activeTab === "reasoning" && (
          <ReasoningTab reasoningItems={reasoningItems} language={language} />
        )}
      </div>
    </div>
  );
}

// ========== Tabs ==========

function SystemTab({
  data,
  language,
}: {
  data: DevPanelData;
  language: Language;
}) {
  return (
    <div className="space-y-4 p-4">
      {/* 全局规则 */}
      <Section title={t(language, "dev_mode_global_rules_label")}>
        <CodeBlock content={data.globalRules} />
      </Section>

      {/* 语言指令 */}
      <Section title={t(language, "dev_mode_lang_instruction")}>
        <CodeBlock content={data.langInstruction} />
      </Section>

      {/* Agent 系统提示词（完整） */}
      <Section title={t(language, "dev_mode_system_prompt_label")}>
        <CodeBlock content={data.systemPrompt} />
      </Section>
    </div>
  );
}

function MessagesTab({
  data,
  language,
}: {
  data: DevPanelData;
  language: Language;
}) {
  if (!data.apiMessages.length) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-gray-400">
        {t(language, "dev_mode_empty")}
      </div>
    );
  }

  return (
    <div className="p-4">
      <p className="mb-3 text-xs text-gray-500 dark:text-slate-400">
        {t(language, "dev_mode_api_messages_desc")}
      </p>
      <div className="space-y-3">
        {data.apiMessages.map((msg, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-gray-200 dark:border-slate-700"
          >
            <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800">
              <span
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                  msg.role === "system"
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                    : msg.role === "user"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                }`}
              >
                {msg.role}
              </span>
              <span className="text-[10px] text-gray-400">#{idx}</span>
            </div>
            <div className="px-3 py-2">
              <CodeBlock content={msg.content || "(null)"} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReasoningTab({
  reasoningItems,
  language,
}: {
  reasoningItems: Array<{
    id: string;
    content: string;
    contentPreview: string;
  }>;
  language: Language;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!reasoningItems.length) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-gray-400">
        {t(language, "dev_mode_no_reasoning")}
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="space-y-3">
        {reasoningItems.map((item) => {
          const isExpanded = expandedId === item.id;
          return (
            <div
              key={item.id}
              className="rounded-lg border border-amber-200 dark:border-amber-800"
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                className="flex w-full items-center justify-between border-b border-amber-100 bg-amber-50 px-3 py-2 text-left dark:border-amber-800 dark:bg-amber-950"
              >
                <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  {t(language, "reasoning_title")}
                </span>
                <svg
                  className={`size-3 text-amber-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {isExpanded && (
                <div className="max-h-80 overflow-y-auto px-3 py-2">
                  <CodeBlock content={item.content} />
                </div>
              )}
              {!isExpanded && (
                <div className="truncate px-3 py-1.5 text-[11px] text-gray-400 dark:text-slate-500">
                  {item.contentPreview || t(language, "dev_mode_empty")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ========== Shared UI ==========

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium text-gray-600 dark:text-slate-400">
        {title}
      </h3>
      {children}
    </div>
  );
}

function CodeBlock({ content }: { content: string }) {
  return (
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 font-mono text-[11px] leading-relaxed text-gray-700 dark:bg-slate-800 dark:text-slate-300">
      {content || <span className="italic text-gray-400">(empty)</span>}
    </pre>
  );
}

"use client";

import { useState, useMemo } from "react";
import type { Language, Message } from "./types";
import { t } from "./i18n";
import { usePromptOverrideStore } from "@/store/prompt-override-store";
import type { ConversationMemory } from "@/lib/chat-memory/types";
import { MemoryPanel } from "./memory-panel";

// ---------- Types ----------

export interface DevPanelData {
  /** 发送给 API 的完整 system message 内容（含全局规则 + 语言指令） */
  systemPrompt: string;
  /** 全局规则（单独展示） */
  globalRules: string;
  /** 语言指令片段 */
  langInstruction: string;
  /** Agent 专属提示词（不含全局规则，便于编辑） */
  agentPrompt: string;
  /** 发送给 API 的消息列表 */
  apiMessages: Array<{ role: string; content: string }>;
  /** 当前会话的所有消息（用于提取 reasoning） */
  messages: Message[];
  /** 当前 Agent 标识信息 */
  agentId: string;
  agentName: string;
}

type Tab = "system" | "messages" | "reasoning" | "memory";

type EditingField = "globalRules" | "agentPrompt" | null;

// ---------- Component ----------

interface DevPanelProps {
  isOpen: boolean;
  onClose: () => void;
  data: DevPanelData;
  language: Language;
  isGlobalRulesOverridden?: boolean;
  isAgentPromptOverridden?: boolean;
  memory: {
    enabled: boolean;
    items: ConversationMemory[];
    usedMemoryIds: string[];
    onEnabledChange: (enabled: boolean) => void;
    onDelete: (memoryId: string) => void;
    onClear: () => void;
  };
}

export function DevPanel({
  isOpen,
  onClose,
  data,
  language,
  isGlobalRulesOverridden = false,
  isAgentPromptOverridden = false,
  memory,
}: DevPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("system");
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [editValue, setEditValue] = useState("");

  // 覆盖 store 操作方法
  const setGlobalRules = usePromptOverrideStore((s) => s.setGlobalRules);
  const setAgentPrompt = usePromptOverrideStore((s) => s.setAgentPrompt);
  const clearGlobalRules = usePromptOverrideStore((s) => s.clearGlobalRules);
  const clearAgentPrompt = usePromptOverrideStore((s) => s.clearAgentPrompt);

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
    { id: "memory", label: t(language, "dev_mode_tab_memory") },
  ];

  /** 开始编辑某个字段 */
  function startEdit(field: EditingField) {
    if (!field) return;
    setEditValue(field === "globalRules" ? data.globalRules : data.agentPrompt);
    setEditingField(field);
  }

  /** 取消编辑 */
  function cancelEdit() {
    setEditingField(null);
    setEditValue("");
  }

  /** 保存编辑 */
  function saveEdit() {
    if (editingField === "globalRules") {
      setGlobalRules(editValue);
    } else if (editingField === "agentPrompt") {
      setAgentPrompt(data.agentId, editValue);
    }
    setEditingField(null);
    setEditValue("");
  }

  /** 重置为默认 */
  function handleReset(field: "globalRules" | "agentPrompt") {
    if (field === "globalRules") {
      clearGlobalRules();
    } else {
      clearAgentPrompt(data.agentId);
    }
  }

  return (
    <div className="flex w-96 shrink-0 flex-col border-l border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-slate-700">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-slate-200">
            {t(language, "dev_mode_title")}
          </h2>
          <p className="truncate text-[11px] text-gray-500 dark:text-slate-400">
            {data.agentName}
            <span className="ml-1 opacity-50">({data.agentId})</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
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
          <SystemTab
            data={data}
            language={language}
            editingField={editingField}
            editValue={editValue}
            isGlobalRulesOverridden={isGlobalRulesOverridden}
            isAgentPromptOverridden={isAgentPromptOverridden}
            onStartEdit={startEdit}
            onCancelEdit={cancelEdit}
            onSaveEdit={saveEdit}
            onReset={handleReset}
            onEditValueChange={setEditValue}
          />
        )}
        {activeTab === "messages" && (
          <MessagesTab data={data} language={language} />
        )}
        {activeTab === "reasoning" && (
          <ReasoningTab reasoningItems={reasoningItems} language={language} />
        )}
        {activeTab === "memory" && (
          <MemoryPanel
            enabled={memory.enabled}
            memories={memory.items}
            usedMemoryIds={memory.usedMemoryIds}
            language={language}
            onEnabledChange={memory.onEnabledChange}
            onDelete={memory.onDelete}
            onClear={memory.onClear}
          />
        )}
      </div>
    </div>
  );
}

// ========== Tabs ==========

function SystemTab({
  data,
  language,
  editingField,
  editValue,
  isGlobalRulesOverridden,
  isAgentPromptOverridden,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onReset,
  onEditValueChange,
}: {
  data: DevPanelData;
  language: Language;
  editingField: EditingField;
  editValue: string;
  isGlobalRulesOverridden: boolean;
  isAgentPromptOverridden: boolean;
  onStartEdit: (field: EditingField) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onReset: (field: "globalRules" | "agentPrompt") => void;
  onEditValueChange: (value: string) => void;
}) {
  return (
    <div className="space-y-4 p-4">
      {/* 全局规则 */}
      <Section title={t(language, "dev_mode_global_rules_label")}>
        <EditableField
          content={data.globalRules}
          isEditing={editingField === "globalRules"}
          editValue={editValue}
          isOverridden={isGlobalRulesOverridden}
          language={language}
          onEdit={() => onStartEdit("globalRules")}
          onCancel={onCancelEdit}
          onSave={onSaveEdit}
          onReset={() => onReset("globalRules")}
          onEditValueChange={onEditValueChange}
        />
      </Section>

      {/* 语言指令 */}
      <Section title={t(language, "dev_mode_lang_instruction")}>
        <CodeBlock content={data.langInstruction} />
      </Section>

      {/* Agent 专属提示词（不含全局规则），仅在有额外提示词时显示 */}
      {data.agentPrompt.trim() && (
        <Section
          title={`${t(language, "dev_mode_system_prompt_label")} — ${data.agentName}`}
        >
          <EditableField
            content={data.agentPrompt}
            isEditing={editingField === "agentPrompt"}
            editValue={editValue}
            isOverridden={isAgentPromptOverridden}
            language={language}
            onEdit={() => onStartEdit("agentPrompt")}
            onCancel={onCancelEdit}
            onSave={onSaveEdit}
            onReset={() => onReset("agentPrompt")}
            onEditValueChange={onEditValueChange}
          />
        </Section>
      )}
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

// ========== Editable Field ==========

function EditableField({
  content,
  isEditing,
  editValue,
  isOverridden,
  language,
  onEdit,
  onCancel,
  onSave,
  onReset,
  onEditValueChange,
}: {
  content: string;
  isEditing: boolean;
  editValue: string;
  isOverridden: boolean;
  language: Language;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onReset: () => void;
  onEditValueChange: (value: string) => void;
}) {
  if (isEditing) {
    return (
      <div className="space-y-2">
        <textarea
          value={editValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          className="min-h-30 w-full resize-y rounded-lg border border-gray-300 bg-white p-3 font-mono text-[11px] leading-relaxed text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-indigo-500"
          spellCheck={false}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSave}
            className="rounded-md bg-indigo-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-500"
          >
            {t(language, "dev_mode_save")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            {t(language, "dev_mode_cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* 已编辑标识 */}
      {isOverridden && (
        <div className="absolute right-1 top-1 z-10">
          <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {t(language, "dev_mode_edited_badge")}
          </span>
        </div>
      )}

      <CodeBlock content={content} />

      {/* 操作按钮 */}
      <div className="mt-1.5 flex gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-300"
        >
          {t(language, "dev_mode_edit")}
        </button>
        {isOverridden && (
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-50 hover:text-red-600 dark:border-slate-600 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
          >
            {t(language, "dev_mode_reset")}
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { TextInput } from "flowbite-react";
import {
  ChartMixed,
  ChartLineUp,
  PaperPlane,
  Star,
  Shuffle,
  Stop,
} from "flowbite-react-icons/outline";

interface Message {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  reasoning?: string;
}

interface AgentOption {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
}

const AGENTS: AgentOption[] = [
  {
    id: "none",
    name: "无",
    description: "不使用专属代理，直接与通用 AI 对话",
    systemPrompt: "",
  },
  {
    id: "data_analysis",
    name: "数据分析",
    description: "销售数据分析和商业洞察提取",
    systemPrompt: "",
  },
  {
    id: "market_analysis",
    name: "市场分析",
    description: "市场竞争和定价基准分析",
    systemPrompt: "",
  },
  {
    id: "campaign_planning",
    name: "营销策划",
    description: "营销活动策划与提案生成",
    systemPrompt: "",
  },
];

const AGENT_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  none: Shuffle,
  campaign_planning: Star,
  data_analysis: ChartMixed,
  market_analysis: ChartLineUp,
};

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content: "你好！我是 AI 助手，有什么可以帮助你的吗？",
};

function ReasoningBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 300;

  return (
    <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 text-xs dark:border-amber-800 dark:bg-amber-950">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
      >
        <svg
          className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>
        <span className="font-medium">思考过程</span>
        {!expanded && isLong && (
          <span className="text-amber-500">（过长已折叠）</span>
        )}
      </button>
      {expanded && (
        <div className="max-h-60 overflow-y-auto border-t border-amber-200 px-3 py-2 text-gray-600 leading-relaxed dark:border-amber-800 dark:text-slate-300">
          {text}
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentOption>(AGENTS[0]);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }, []);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    // 追加用户消息，构建请求消息列表
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    // 如果选中了 agent 且 systemPrompt 非空，注入 system prompt
    const apiMessages = selectedAgent?.systemPrompt
      ? [
          { role: "system" as const, content: selectedAgent.systemPrompt },
          ...updatedMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ]
      : updatedMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

    // 创建占位的 AI 回复
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      reasoning: "",
    };
    setMessages((prev) => [...prev, assistantMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json();
        updateMessage(assistantId, {
          content: `❌ 请求失败: ${err.error ?? "未知错误"}`,
        });
        setIsLoading(false);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        updateMessage(assistantId, { content: "❌ 无法读取响应流" });
        setIsLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedReasoning = "";
      let accumulatedContent = "";

      // 逐块累积，定期 flush 到 state（每收到一个完整 data: 行就更新）
      function flushMessage() {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  reasoning: accumulatedReasoning,
                  content: accumulatedContent,
                }
              : m,
          ),
        );
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith("data:")) continue;

          const jsonStr = trimmedLine.slice(5).trim();

          try {
            const parsed = JSON.parse(jsonStr);

            if (parsed.type === "done") {
              // 流结束
            } else if (parsed.type === "reasoning") {
              accumulatedReasoning += parsed.content;
              flushMessage();
            } else if (parsed.type === "content") {
              accumulatedContent += parsed.content;
              flushMessage();
            } else if (parsed.type === "error") {
              accumulatedContent = `❌ ${parsed.content}`;
              flushMessage();
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        updateMessage(assistantId, {
          content:
            (getMessageById(assistantId)?.content ?? "") +
            "\n\n_（已停止生成）_",
        });
      } else {
        updateMessage(assistantId, {
          content: `❌ 网络错误: ${(err as Error).message}`,
        });
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }

  // 辅助：更新指定 id 的消息
  function updateMessage(id: string, partial: Partial<Message>) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...partial } : m)),
    );
  }

  // 辅助：获取指定 id 的消息（利用 ref 读最新值）
  function getMessageById(id: string): Message | undefined {
    return messagesRef.current?.find((m) => m.id === id);
  }

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-10rem)] max-w-3xl flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4 dark:border-slate-700">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
          AI Chat
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          与 AI 助手进行对话 · 支持流式输出
        </p>
      </div>

      {/* Agent selector */}
      <div className="border-b border-gray-100 py-3 dark:border-slate-800">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400 dark:text-slate-500">
            Agent:
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {AGENTS.map((agent) => {
            const isSelected = selectedAgent?.id === agent.id;
            const IconComponent = AGENT_ICONS[agent.id];

            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => setSelectedAgent(agent)}
                className={`group relative flex flex-col gap-2 rounded-xl border p-3 text-left transition ${
                  isSelected
                    ? "border-indigo-300 bg-indigo-50 shadow-sm dark:border-indigo-600 dark:bg-indigo-900/20"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
                }`}
              >
                {/* 选中标记 */}
                {isSelected && (
                  <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-indigo-600 text-white dark:bg-indigo-500">
                    <svg
                      className="size-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="m4.5 12.75 6 6 9-13.5"
                      />
                    </svg>
                  </span>
                )}

                {/* 图标 + 名称 */}
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                      isSelected
                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                        : "bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400"
                    }`}
                  >
                    {IconComponent && <IconComponent className="size-4.5" />}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      isSelected
                        ? "text-indigo-900 dark:text-indigo-200"
                        : "text-gray-900 dark:text-slate-100"
                    }`}
                  >
                    {agent.name}
                  </span>
                </div>

                {/* 描述 */}
                <p className="text-xs leading-relaxed text-gray-500 dark:text-slate-400 line-clamp-2">
                  {agent.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] space-y-1 ${
                msg.role === "assistant" ? "order-first" : ""
              }`}
            >
              {/* 推理过程 */}
              {msg.role === "assistant" && msg.reasoning && (
                <ReasoningBlock text={msg.reasoning} />
              )}

              {/* 消息气泡 */}
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-900 dark:bg-slate-800 dark:text-slate-100"
                }`}
              >
                {msg.content ||
                  (isLoading && msg.id === messages[messages.length - 1]?.id ? (
                    <span className="inline-flex gap-1">
                      <span className="animate-bounce">.</span>
                      <span className="animate-bounce [animation-delay:0.2s]">
                        .
                      </span>
                      <span className="animate-bounce [animation-delay:0.4s]">
                        .
                      </span>
                    </span>
                  ) : null)}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 pt-4 dark:border-slate-700">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextInput
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              placeholder={isLoading ? "AI 正在回复..." : "输入消息..."}
              className="[&>input]:rounded-2xl [&>input]:border-gray-300 [&>input]:bg-white [&>input]:py-3 [&>input]:text-sm disabled:[&>input]:opacity-50 dark:[&>input]:border-slate-600 dark:[&>input]:bg-slate-800 dark:[&>input]:text-slate-100 dark:[&>input]:placeholder-slate-400"
            />
          </div>

          {isLoading ? (
            <button
              type="button"
              onClick={handleStop}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-400"
              title="停止生成"
            >
              <Stop className="size-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600"
            >
              <PaperPlane className="size-5" />
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-gray-400 dark:text-slate-500">
          {isLoading
            ? "正在生成回复，点击停止按钮中断"
            : "AI 回复仅供参考，请核实重要信息"}
        </p>
      </div>
    </div>
  );
}

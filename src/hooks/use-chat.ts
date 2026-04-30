"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type {
  Message,
  AgentOption,
  FileAttachment,
} from "@/components/chat/types";
import { getLocalizedAgents, t } from "@/components/chat/i18n";
import { processFiles } from "@/components/chat/utils";
import { useActiveSession, useChatStore } from "@/store/chat-store";

export function useChat() {
  const {
    session,
    sessions,
    activeSessionId,
    language,
    setLanguage,
    createSession,
    switchSession,
    deleteSession,
    updateSessionMessages,
    updateSessionAgent,
    renameSession,
    setDraftInput,
  } = useActiveSession();

  const messages = session?.messages ?? [];
  const messageVersion = messages.length + (messages.at(-1)?.id ?? "");
  const agents = getLocalizedAgents(language);
  const selectedAgent =
    agents.find((a) => a.id === session?.selectedAgentId) ?? agents[0];
  const sessionId = session?.id;

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageVersion]);

  // 切换会话时加载目标会话的草稿
  useEffect(() => {
    setFileAttachments([]);
    setIsLoading(false);
    // 直接从 store 读取最新草稿，避免将 draftInputs 加入依赖链导致不必要重跑
    const draft = useChatStore.getState().draftInputs[sessionId ?? ""] ?? "";
    setInput(draft);
  }, [sessionId]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }, []);

  const handleSetSelectedAgent = useCallback(
    (agent: AgentOption) => {
      if (sessionId) {
        updateSessionAgent(sessionId, agent.id);
      }
    },
    [sessionId, updateSessionAgent],
  );

  /** 切换会话时保存当前输入草稿 */
  const handleSwitchSession = useCallback(
    (id: string) => {
      if (sessionId) {
        setDraftInput(sessionId, input);
      }
      switchSession(id);
    },
    [sessionId, input, switchSession, setDraftInput],
  );

  /** 新建会话时保存当前输入草稿 */
  const handleCreateSession = useCallback(
    (agentId?: string) => {
      if (sessionId) {
        setDraftInput(sessionId, input);
      }
      return createSession(agentId);
    },
    [sessionId, input, createSession, setDraftInput],
  );

  /** 语言回复指令 */
  const languageInstruction =
    language === "zh"
      ? "\n\n请使用中文回复，除非用户明确要求使用其他语言。"
      : "\n\nPlease respond in English, unless the user explicitly asks for another language.";

  /** 从 activeSession 的消息构建 API 请求消息体 */
  const buildApiMessages = useCallback(
    (msgs: Message[]) => {
      const mapMsg = (m: Message) => ({
        role: m.role as "user" | "assistant",
        content:
          m.role === "user" && m.attachments?.length
            ? m.content +
              (m.content ? "\n\n" : "") +
              m.attachments
                .map((a) => `[附件：${a.name}]\n\n${a.content}`)
                .join("\n\n")
            : m.content,
      });

      const systemContent = selectedAgent?.systemPrompt
        ? selectedAgent.systemPrompt + languageInstruction
        : languageInstruction;

      return [
        {
          role: "system" as const,
          content: systemContent,
        },
        ...msgs.map(mapMsg),
      ];
    },
    [selectedAgent, languageInstruction],
  );

  async function handleSend() {
    const trimmed = input.trim();
    if ((!trimmed && fileAttachments.length === 0) || isLoading || !sessionId)
      return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      attachments: fileAttachments.length > 0 ? fileAttachments : undefined,
    };

    const sid = sessionId;
    const updatedMessages = [...messages, userMsg];
    updateSessionMessages(sid, updatedMessages);
    setInput("");
    setFileAttachments([]);
    setDraftInput(sid, "");
    setIsLoading(true);

    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      reasoning: "",
    };
    const withAssistant = [...updatedMessages, assistantMsg];
    updateSessionMessages(sid, withAssistant);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: buildApiMessages(updatedMessages),
          enable_search: selectedAgent?.enableSearch ?? false,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json();
        updateSessionMessages(
          sid,
          withAssistant.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `❌ ${err.error ?? t(language, "error_stream")}`,
                }
              : m,
          ),
        );
        setIsLoading(false);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        updateSessionMessages(
          sid,
          withAssistant.map((m) =>
            m.id === assistantId
              ? { ...m, content: t(language, "error_stream") }
              : m,
          ),
        );
        setIsLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedReasoning = "";
      let accumulatedContent = "";

      function flushMessage() {
        updateSessionMessages(
          sid,
          withAssistant.map((m) =>
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
        updateSessionMessages(
          sid,
          withAssistant.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + `\n\n_${t(language, "stopped")}_` }
              : m,
          ),
        );
      } else {
        updateSessionMessages(
          sid,
          withAssistant.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `${t(language, "error_network_prefix")}${(err as Error).message}`,
                }
              : m,
          ),
        );
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments = await processFiles(files);
    if (newAttachments.length > 0) {
      setFileAttachments((prev) => [...prev, ...newAttachments]);
    }

    e.target.value = "";
  }

  function handleRemoveFile(index: number) {
    setFileAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  return {
    // 状态
    messages,
    input,
    isLoading,
    selectedAgent,
    fileAttachments,
    language,
    sessions,
    activeSessionId,
    // refs
    messagesEndRef,
    inputRef,
    fileInputRef,
    // 操作
    setInput,
    setLanguage,
    setSelectedAgent: handleSetSelectedAgent,
    handleSend,
    handleStop,
    handleKeyDown,
    handleFileSelect,
    handleRemoveFile,
    // 会话管理
    createSession: handleCreateSession,
    switchSession: handleSwitchSession,
    deleteSession,
    renameSession,
  };
}

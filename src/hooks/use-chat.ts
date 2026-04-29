"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type {
  Message,
  AgentOption,
  FileAttachment,
} from "@/components/chat/types";
import { AGENTS, WELCOME_MESSAGE } from "@/components/chat/constants";
import { processFiles } from "@/components/chat/utils";

function updateMessage(
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  id: string,
  partial: Partial<Message>,
) {
  setMessages((prev) =>
    prev.map((m) => (m.id === id ? { ...m, ...partial } : m)),
  );
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentOption>(AGENTS[0]);
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if ((!trimmed && fileAttachments.length === 0) || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      attachments: fileAttachments.length > 0 ? fileAttachments : undefined,
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setFileAttachments([]);
    setIsLoading(true);

    const apiMessages = selectedAgent?.systemPrompt
      ? [
          { role: "system" as const, content: selectedAgent.systemPrompt },
          ...updatedMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            content:
              m.role === "user" && m.attachments?.length
                ? m.content +
                  (m.content ? "\n\n" : "") +
                  m.attachments
                    .map((a) => `[附件：${a.name}]\n\n${a.content}`)
                    .join("\n\n")
                : m.content,
          })),
        ]
      : updatedMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content:
            m.role === "user" && m.attachments?.length
              ? m.content +
                (m.content ? "\n\n" : "") +
                m.attachments
                  .map((a) => `[附件：${a.name}]\n\n${a.content}`)
                  .join("\n\n")
              : m.content,
        }));

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
        updateMessage(setMessages, assistantId, {
          content: `❌ 请求失败: ${err.error ?? "未知错误"}`,
        });
        setIsLoading(false);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        updateMessage(setMessages, assistantId, {
          content: "❌ 无法读取响应流",
        });
        setIsLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedReasoning = "";
      let accumulatedContent = "";

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
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + "\n\n_（已停止生成）_" }
              : m,
          ),
        );
      } else {
        updateMessage(setMessages, assistantId, {
          content: `❌ 网络错误: ${(err as Error).message}`,
        });
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
    // refs
    messagesEndRef,
    inputRef,
    fileInputRef,
    // 操作
    setInput,
    setSelectedAgent,
    handleSend,
    handleStop,
    handleKeyDown,
    handleFileSelect,
    handleRemoveFile,
  };
}

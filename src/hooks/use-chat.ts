"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type {
  Message,
  AgentOption,
  FileAttachment,
} from "@/components/chat/types";
import { getLocalizedAgents, t } from "@/components/chat/i18n";
import { GLOBAL_EMPHASIS } from "@/components/chat/system-prompts";
import { processFiles } from "@/components/chat/utils";
import {
  buildAnalysisAttachmentContent,
  summarizeProfile,
} from "@/lib/client-analysis/csv-analysis-prompts";
import {
  compactPreviousResultsForQuery,
  compactProfileForQuery,
} from "@/lib/client-analysis/csv-query-payload";
import {
  executeQueryInWorker,
  profileCsvInWorker,
  resetAllCsvWorkers,
  resetCsvWorker,
} from "@/lib/client-analysis/csv-worker-client";
import {
  LARGE_CSV_MAX_BYTES,
  MAX_QUERY_ITERATIONS,
  type CsvAnalysisState,
  type CsvAnalysisStatus,
  type CsvDataQuery,
  type CsvDataQueryResult,
  type CsvProfile,
  type CsvProfileSummary,
} from "@/lib/client-analysis/csv-types";
import { useActiveSession, useChatStore } from "@/store/chat-store";
import { usePromptOverrideStore } from "@/store/prompt-override-store";

type ActiveCsvContext = {
  id: string;
  name: string;
  size?: number;
  profile: CsvProfile;
  profileSummary: CsvProfileSummary;
  queryResults?: CsvDataQueryResult[];
  summary?: string;
  content?: string;
};

const MAX_MODEL_QUERY_ROUNDS = Math.min(3, MAX_QUERY_ITERATIONS);

export function useChat() {
  const {
    session,
    sessions,
    activeSessionId,
    language,
    enableThinking,
    setLanguage,
    setEnableThinking,
    createSession,
    switchSession,
    deleteSession,
    updateSessionMessages,
    updateSessionAgent,
    renameSession,
    setDraftInput,
    quotedMessages,
    toggleQuotedMessage,
    clearQuotedMessages,
  } = useActiveSession();

  const sessionMessages = session?.messages;
  const messages = useMemo(() => sessionMessages ?? [], [sessionMessages]);
  const messageVersion = messages.length + (messages.at(-1)?.id ?? "");
  const agents = getLocalizedAgents(language);
  const selectedAgent =
    agents.find((a) => a.id === session?.selectedAgentId) ?? agents[0];
  const sessionId = session?.id;

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);
  const [devMode, setDevMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const largeCsvInputRef = useRef<HTMLInputElement>(null);
  const csvContextsRef = useRef<Record<string, ActiveCsvContext[]>>({});

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

  useEffect(() => {
    return () => {
      resetAllCsvWorkers();
      csvContextsRef.current = {};
    };
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

  const replaceCsvContexts = useCallback(
    (id: string, nextContexts: ActiveCsvContext[]) => {
      const nextIds = new Set(nextContexts.map((context) => context.id));
      for (const context of csvContextsRef.current[id] ?? []) {
        if (!nextIds.has(context.id)) {
          resetCsvWorker(context.id);
        }
      }
      csvContextsRef.current[id] = nextContexts;
    },
    [],
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      for (const context of csvContextsRef.current[id] ?? []) {
        resetCsvWorker(context.id);
      }
      delete csvContextsRef.current[id];
      deleteSession(id);
    },
    [deleteSession],
  );

  /** 语言回复指令 */
  const languageInstruction =
    language === "zh"
      ? "\n\n请使用中文回复，除非用户明确要求使用其他语言。"
      : "\n\nPlease respond in English, unless the user explicitly asks for another language.";

  // ---- 提示词覆盖（dev 面板编辑） ----
  const overrideGlobalRules = usePromptOverrideStore((s) => s.globalRules);
  const overrideAgentPrompts = usePromptOverrideStore((s) => s.agentPrompts);

  /** 原始 Agent 专属提示词（不含全局规则部分） */
  const originalAgentSpecific = selectedAgent?.systemPrompt?.startsWith(
    GLOBAL_EMPHASIS,
  )
    ? selectedAgent.systemPrompt.slice(GLOBAL_EMPHASIS.length)
    : "";

  /** 生效的全局规则（用户自定义优先） */
  const effectiveGlobalRules = overrideGlobalRules || GLOBAL_EMPHASIS;
  /** 生效的 Agent 专属提示词（用户自定义优先） */
  const effectiveAgentSpecific =
    overrideAgentPrompts[selectedAgent?.id ?? ""] ?? originalAgentSpecific;
  /** 完整的生效 system prompt */
  const effectiveSystemPrompt = effectiveGlobalRules + effectiveAgentSpecific;

  /** 全局规则是否被用户编辑过 */
  const isGlobalRulesOverridden = !!overrideGlobalRules;
  /** Agent 提示词是否被用户编辑过 */
  const isAgentPromptOverridden =
    (overrideAgentPrompts[selectedAgent?.id ?? ""] ?? "") !== "";

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

      const systemContent = effectiveSystemPrompt + languageInstruction;

      return [
        {
          role: "system" as const,
          content: systemContent,
        },
        ...msgs.map(mapMsg),
      ];
    },
    [effectiveSystemPrompt, languageInstruction],
  );

  // ---- 开发者模式数据 ----

  const fullSystemPrompt = effectiveSystemPrompt + languageInstruction;
  const agentPrompt = effectiveAgentSpecific;

  const apiMessages = useMemo(
    () => buildApiMessages(messages),
    [buildApiMessages, messages],
  );

  const toggleDevMode = useCallback(() => setDevMode((v) => !v), []);

  async function handleSend() {
    const trimmed = input.trim();
    if ((!trimmed && fileAttachments.length === 0) || isLoading || !sessionId)
      return;

    // 如果有引用的消息，将多条以 blockquote 格式拼入消息内容
    const quotePrefix =
      quotedMessages.length > 0
        ? quotedMessages
            .map((qm) => `> ${qm.content.replace(/\n/g, "\n> ")}`)
            .join("\n\n") + "\n\n"
        : "";

    const csvAnalysisAttachments = fileAttachments.filter(
      (attachment) => attachment.type === "csv-analysis",
    );
    if (csvAnalysisAttachments.length > 0) {
      const defaultCsvQuestion =
        language === "zh"
          ? "请基于这个 CSV 做一次概要分析并给出可执行洞察。"
          : "Please summarize this CSV and provide actionable insights.";
      await handleCsvAnalysisSend(
        quotePrefix + (trimmed || defaultCsvQuestion),
        csvAnalysisAttachments,
      );
      return;
    }

    const activeCsvContexts =
      sessionId && trimmed ? (csvContextsRef.current[sessionId] ?? []) : [];
    if (activeCsvContexts.length > 0) {
      await handleCsvContextFollowup(quotePrefix + trimmed, activeCsvContexts);
      return;
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: quotePrefix + trimmed,
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
          enable_thinking: enableThinking,
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

  async function handleLargeCsvSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";

    if (files.length === 0) return;

    const validAttachments: Array<{ file: File; attachment: FileAttachment }> =
      [];

    for (const file of files) {
      const isCSV = file.name.endsWith(".csv") || file.type === "text/csv";
      if (!isCSV) {
        alert(`不支持的文件类型：${file.name}，已跳过。`);
        continue;
      }

      if (file.size > LARGE_CSV_MAX_BYTES) {
        alert(
          `CSV 文件过大：${file.name}。当前本地分析第一版最多支持 50MB，已跳过。`,
        );
        continue;
      }

      const id = crypto.randomUUID();
      validAttachments.push({
        file,
        attachment: {
          id,
          name: file.name,
          type: "csv-analysis",
          size: file.size,
          content: `[CSV 本地分析：${file.name}]\n正在读取字段画像。原始 CSV 文件保留在浏览器本地。`,
          analysis: {
            id,
            status: "profiling",
            progress: 0,
          },
        },
      });
    }

    if (validAttachments.length === 0) return;

    setFileAttachments((prev) => [
      ...prev,
      ...validAttachments.map((item) => item.attachment),
    ]);

    await Promise.all(
      validAttachments.map(async ({ file, attachment }) => {
        const id = attachment.id!;
        try {
          const profile = await profileCsvInWorker(
            id,
            file,
            undefined,
            (progress) => {
              updateAnalysisAttachment(id, {
                status: "profiling",
                progress,
              });
            },
          );
          const profileSummary = summarizeProfile(profile);
          const content = buildAnalysisAttachmentContent({ profileSummary });

          updateAnalysisAttachment(id, {
            status: "profiled",
            progress: 1,
            profile,
            profileSummary,
            content,
          });
        } catch (error) {
          const errorMessage = formatErrorMessage(error);
          updateAnalysisAttachment(id, {
            status: "failed",
            error: errorMessage,
            content: `[CSV 本地分析：${file.name}]\n分析失败：${errorMessage}`,
          });
        }
      }),
    );
  }

  function handleRemoveFile(index: number) {
    setFileAttachments((prev) => {
      const removed = prev[index];
      if (removed?.type === "csv-analysis" && removed.id) {
        resetCsvWorker(removed.id);
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleCsvAnalysisSend(
    userContent: string,
    csvAnalysisAttachments: FileAttachment[],
  ) {
    if (!sessionId || isLoading) return;

    const notReadyAttachment = csvAnalysisAttachments.find(
      (attachment) =>
        !attachment.analysis?.profile || !attachment.analysis?.profileSummary,
    );
    if (notReadyAttachment) {
      alert("CSV 字段画像还没有准备好，请稍等片刻再发送。");
      return;
    }

    const failedAttachment = csvAnalysisAttachments.find(
      (attachment) => attachment.analysis?.status === "failed",
    );
    if (failedAttachment) {
      alert(
        failedAttachment.analysis?.error ?? "CSV 分析失败，请重新添加文件。",
      );
      return;
    }

    const sid = sessionId;
    const assistantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const initialStoredAttachments =
      csvAnalysisAttachments.map(toStoredAttachment);
    const userMsg: Message = {
      id: userId,
      role: "user",
      content: userContent,
      attachments: [
        ...fileAttachments
          .filter((attachment) => attachment.type !== "csv-analysis")
          .map(toStoredAttachment),
        ...initialStoredAttachments,
      ],
    };
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "正在生成 CSV 本地分析计划…",
      reasoning: "",
    };
    const updatedMessages = [...messages, userMsg, assistantMsg];

    updateSessionMessages(sid, updatedMessages);
    setInput("");
    setDraftInput(sid, "");
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const finalAttachments: FileAttachment[] = [];
      const finalContexts: ActiveCsvContext[] = [];
      const summaries: string[] = [];

      for (const [
        index,
        analysisAttachment,
      ] of csvAnalysisAttachments.entries()) {
        const attachmentId = analysisAttachment.id;
        const profile = analysisAttachment.analysis!.profile!;
        const profileSummary = analysisAttachment.analysis!.profileSummary!;
        const statusPrefix = buildCsvBatchStatusPrefix(
          index,
          csvAnalysisAttachments.length,
          analysisAttachment.name,
        );

        updateAnalysisAttachment(attachmentId, { status: "planning" });
        updateAssistantMessage(
          sid,
          updatedMessages,
          assistantId,
          `${statusPrefix}模型正在决定要查询哪些数据…`,
        );

        const queryAnalysis = await runFreeCsvQueryAnalysis({
          workerKey: attachmentId!,
          question: userContent,
          profile,
          profileSummary,
          domain:
            selectedAgent?.id === "campaign_planning" ? "campaign" : "general",
          enableThinking,
          signal: controller.signal,
          onStatus: (message) => {
            updateAssistantMessage(
              sid,
              updatedMessages,
              assistantId,
              `${statusPrefix}${message}`,
            );
          },
          onAttachmentPatch: (patch) => {
            updateAnalysisAttachment(attachmentId, patch);
          },
        });
        const { summary, queryResults, content } = queryAnalysis;
        const finalAttachment: FileAttachment = {
          ...toStoredAttachment(analysisAttachment),
          content,
        };

        finalAttachments.push(finalAttachment);
        if (attachmentId) {
          finalContexts.push({
            id: attachmentId,
            name: analysisAttachment.name,
            size: analysisAttachment.size,
            profile,
            profileSummary,
            queryResults,
            summary,
            content,
          });
        }
        summaries.push(
          csvAnalysisAttachments.length > 1
            ? `## ${analysisAttachment.name}\n\n${summary}`
            : summary,
        );
        updateAnalysisAttachment(attachmentId, {
          status: "completed",
          queryResults,
          summary,
          content,
        });
      }

      const summary = summaries.join("\n\n");
      const finalMessages = updatedMessages.map((message) => {
        if (message.id === userId) {
          return {
            ...message,
            attachments: message.attachments?.map(
              (attachment) =>
                finalAttachments.find(
                  (finalAttachment) => finalAttachment.id === attachment.id,
                ) ?? attachment,
            ),
          };
        }

        if (message.id === assistantId) {
          return { ...message, content: summary };
        }

        return message;
      });

      updateSessionMessages(sid, finalMessages);
      replaceCsvContexts(sid, finalContexts);
      setFileAttachments([]);
    } catch (error) {
      const aborted = (error as Error)?.name === "AbortError";
      const errorMessage = aborted
        ? t(language, "stopped")
        : error instanceof Error
          ? error.message
          : String(error);

      updateSessionMessages(
        sid,
        updatedMessages.map((message) =>
          message.id === assistantId
            ? { ...message, content: `❌ ${errorMessage}` }
            : message,
        ),
      );
      for (const attachment of csvAnalysisAttachments) {
        updateAnalysisAttachment(attachment.id, {
          status: "failed",
          error: errorMessage,
        });
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }

  async function handleCsvContextFollowup(
    userContent: string,
    csvContexts: ActiveCsvContext[],
  ) {
    if (!sessionId || isLoading) return;

    const sid = sessionId;
    const assistantId = crypto.randomUUID();
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: userContent,
    };
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content:
        csvContexts.length > 1
          ? `正在基于 ${csvContexts.length} 个已上传 CSV 继续查询…`
          : `正在基于已上传 CSV「${csvContexts[0].name}」继续查询…`,
      reasoning: "",
    };
    const updatedMessages = [...messages, userMsg, assistantMsg];

    updateSessionMessages(sid, updatedMessages);
    setInput("");
    setDraftInput(sid, "");
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const nextContexts: ActiveCsvContext[] = [];
      const summaries: string[] = [];

      for (const [index, context] of csvContexts.entries()) {
        const statusPrefix = buildCsvBatchStatusPrefix(
          index,
          csvContexts.length,
          context.name,
        );

        updateAssistantMessage(
          sid,
          updatedMessages,
          assistantId,
          `${statusPrefix}模型正在决定要继续读取哪些数据…`,
        );

        const queryAnalysis = await runFreeCsvQueryAnalysis({
          workerKey: context.id,
          question: userContent,
          profile: context.profile,
          profileSummary: context.profileSummary,
          previousResults: context.queryResults,
          domain:
            selectedAgent?.id === "campaign_planning" ? "campaign" : "general",
          enableThinking,
          signal: controller.signal,
          onStatus: (message) => {
            updateAssistantMessage(
              sid,
              updatedMessages,
              assistantId,
              `${statusPrefix}${message}`,
            );
          },
          onAttachmentPatch: () => {},
        });

        nextContexts.push({
          ...context,
          queryResults: queryAnalysis.queryResults,
          summary: queryAnalysis.summary,
          content: queryAnalysis.content,
        });
        summaries.push(
          csvContexts.length > 1
            ? `## ${context.name}\n\n${queryAnalysis.summary}`
            : queryAnalysis.summary,
        );
      }

      replaceCsvContexts(sid, nextContexts);
      updateSessionMessages(
        sid,
        updatedMessages.map((message) =>
          message.id === assistantId
            ? { ...message, content: summaries.join("\n\n") }
            : message,
        ),
      );
    } catch (error) {
      const aborted = (error as Error)?.name === "AbortError";
      const errorMessage = aborted
        ? t(language, "stopped")
        : error instanceof Error
          ? error.message
          : String(error);

      updateSessionMessages(
        sid,
        updatedMessages.map((message) =>
          message.id === assistantId
            ? { ...message, content: `❌ ${errorMessage}` }
            : message,
        ),
      );
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }

  function updateAnalysisAttachment(
    id: string | undefined,
    patch: Partial<CsvAnalysisState> & { content?: string },
  ) {
    if (!id) return;

    setFileAttachments((prev) =>
      prev.map((attachment) => {
        if (attachment.id !== id || attachment.type !== "csv-analysis") {
          return attachment;
        }

        return {
          ...attachment,
          content: patch.content ?? attachment.content,
          analysis: {
            ...(attachment.analysis ?? {
              status: "profiling" as CsvAnalysisStatus,
            }),
            ...patch,
            id,
          },
        };
      }),
    );
  }

  return {
    // 状态
    messages,
    input,
    isLoading,
    selectedAgent,
    fileAttachments,
    language,
    enableThinking,
    sessions,
    activeSessionId,
    session,
    // 开发者模式
    devMode,
    toggleDevMode,
    apiMessages,
    fullSystemPrompt,
    agentPrompt,
    globalRules: effectiveGlobalRules,
    langInstruction: languageInstruction,
    isGlobalRulesOverridden,
    isAgentPromptOverridden,
    // refs
    messagesEndRef,
    inputRef,
    fileInputRef,
    largeCsvInputRef,
    // 操作
    setInput,
    setLanguage,
    setEnableThinking,
    setSelectedAgent: handleSetSelectedAgent,
    handleSend,
    handleStop,
    handleKeyDown,
    handleFileSelect,
    handleLargeCsvSelect,
    handleRemoveFile,
    // 引用消息
    quotedMessages,
    toggleQuotedMessage,
    clearQuotedMessages,
    // 会话管理
    createSession: handleCreateSession,
    switchSession: handleSwitchSession,
    deleteSession: handleDeleteSession,
    renameSession,
  };
}

function toStoredAttachment(attachment: FileAttachment): FileAttachment {
  return {
    id: attachment.id,
    name: attachment.name,
    content: attachment.content,
    type: attachment.type,
    size: attachment.size,
  };
}

function buildCsvBatchStatusPrefix(
  index: number,
  total: number,
  name: string,
): string {
  return total > 1 ? `(${index + 1}/${total}) ${name}：` : "";
}

function updateAssistantMessage(
  sessionId: string,
  baseMessages: Message[],
  assistantId: string,
  content: string,
) {
  useChatStore.getState().updateSessionMessages(
    sessionId,
    baseMessages.map((message) =>
      message.id === assistantId ? { ...message, content } : message,
    ),
  );
}

async function runFreeCsvQueryAnalysis(args: {
  workerKey: string;
  question: string;
  profile: CsvProfile;
  profileSummary: CsvProfileSummary;
  previousResults?: CsvDataQueryResult[];
  domain: "campaign" | "general";
  enableThinking: boolean;
  signal: AbortSignal;
  onStatus: (message: string) => void;
  onAttachmentPatch: (
    patch: Partial<CsvAnalysisState> & { content?: string },
  ) => void;
}): Promise<{
  summary: string;
  queryResults: CsvDataQueryResult[];
  content: string;
}> {
  const queryResults: CsvDataQueryResult[] = [...(args.previousResults ?? [])];
  const recoveryNotes: string[] = [];
  const progressLog: string[] = [];
  const executedQueryKeys = new Set(
    queryResults.map((result) => getCsvDataQueryKey(result.query)),
  );
  const updateProgressStatus = (current: string) => {
    args.onStatus([...progressLog, current].join("\n"));
  };

  for (let iteration = 0; iteration < MAX_MODEL_QUERY_ROUNDS; iteration++) {
    const roundNumber = iteration + 1;
    args.onAttachmentPatch({
      status: "planning",
      progress: getQueryRoundProgress(iteration, 0),
      queryResults,
    });
    updateProgressStatus(
      iteration === 0
        ? `第 ${roundNumber} 轮：模型正在选择要查询的行、列或聚合口径…`
        : `第 ${roundNumber} 轮：模型正在基于已有结果继续查询…`,
    );

    const decision = await requestDataQueriesWithFallback({
      question: args.question,
      profile: args.profile,
      previousResults: queryResults,
      domain: args.domain,
      enableThinking: args.enableThinking,
      signal: args.signal,
      recoveryNotes,
    });

    if (decision.type === "final") {
      const content = buildQueryAttachmentContent({
        profileSummary: args.profileSummary,
        queryResults,
        summary: decision.finalAnswer,
      });

      return {
        summary: decision.finalAnswer,
        queryResults,
        content,
      };
    }

    if (decision.queries.length === 0) {
      break;
    }

    const rationaleText = formatRationaleForStatus(decision.rationale);
    if (rationaleText) {
      progressLog.push(`第 ${roundNumber} 轮模型意图：${rationaleText}`);
    }

    const queryCandidates = buildExecutableQueryCandidates(
      decision.queries,
      args.question,
      args.profile,
      executedQueryKeys,
    );
    if (queryCandidates.length === 0) {
      recoveryNotes.push("本轮模型请求的查询都已执行过，已进入总结阶段。");
      break;
    }

    args.onAttachmentPatch({
      status: "executing",
      progress: getQueryRoundProgress(iteration, 0.35),
      queryResults,
    });
    updateProgressStatus(
      `第 ${roundNumber} 轮：准备在浏览器本地执行 ${queryCandidates.length} 个数据查询…`,
    );

    let successfulQueries = 0;
    for (const [queryIndex, query] of queryCandidates.entries()) {
      const queryNumber = queryIndex + 1;
      args.onAttachmentPatch({
        status: "executing",
        progress: getQueryRoundProgress(
          iteration,
          0.35 + (queryIndex / queryCandidates.length) * 0.45,
        ),
        queryResults,
      });
      updateProgressStatus(
        `第 ${roundNumber} 轮：正在执行第 ${queryNumber}/${queryCandidates.length} 个本地查询（${describeCsvDataQuery(query)}）…`,
      );

      try {
        const result = await executeQueryInWorker(args.workerKey, query);
        executedQueryKeys.add(getCsvDataQueryKey(query));
        queryResults.push(result);
        successfulQueries += 1;
        args.onAttachmentPatch({
          status: "executing",
          progress: getQueryRoundProgress(
            iteration,
            0.35 + (queryNumber / queryCandidates.length) * 0.45,
          ),
          queryResults,
        });
        updateProgressStatus(
          `第 ${roundNumber} 轮：已完成第 ${queryNumber}/${queryCandidates.length} 个本地查询（${describeCsvDataQuery(query)}）。`,
        );
      } catch (error) {
        recoveryNotes.push(
          `本地查询失败，已尝试后备查询：${formatErrorMessage(error)}`,
        );
        updateProgressStatus(
          `第 ${roundNumber} 轮：第 ${queryNumber}/${queryCandidates.length} 个本地查询失败，继续尝试后备查询…`,
        );
      }
    }

    if (successfulQueries === 0) {
      recoveryNotes.push("本轮没有可执行成功的查询，已进入总结阶段。");
      break;
    }
  }

  args.onAttachmentPatch({
    status: "summarizing",
    progress: 0.92,
    queryResults,
  });
  updateProgressStatus("正在根据已查询的数据生成结论…");

  const summary = await requestDataQueriesFinalAnswer({
    question: args.question,
    profile: args.profile,
    previousResults: queryResults,
    domain: args.domain,
    enableThinking: args.enableThinking,
    signal: args.signal,
    recoveryNotes,
  });
  const content = buildQueryAttachmentContent({
    profileSummary: args.profileSummary,
    queryResults,
    summary,
  });

  return { summary, queryResults, content };
}

function getQueryRoundProgress(iteration: number, roundProgress: number) {
  const progress =
    (iteration + Math.max(0, Math.min(roundProgress, 1))) /
    MAX_MODEL_QUERY_ROUNDS;
  return Math.max(0.01, Math.min(progress, 0.9));
}

function formatRationaleForStatus(rationale: string | undefined) {
  if (!rationale?.trim()) {
    return "";
  }

  const singleLine = rationale.replace(/\s+/g, " ").trim();
  return singleLine.length > 180
    ? `${singleLine.slice(0, 177)}...`
    : singleLine;
}

function buildQueryAttachmentContent(args: {
  profileSummary: CsvProfileSummary;
  queryResults: CsvDataQueryResult[];
  summary: string;
}) {
  const lastAggregate = args.queryResults
    .map((result) => result.aggregateResult)
    .findLast(Boolean);

  const baseContent = buildAnalysisAttachmentContent({
    profileSummary: args.profileSummary,
    result: lastAggregate,
    summary: args.summary,
  });
  const querySummary = args.queryResults
    .map((result, index) => {
      const resultSize =
        result.aggregateResult?.resultRows.length ??
        result.rows?.length ??
        result.values?.length ??
        (result.stats ? 1 : 0);
      return `${index + 1}. ${result.query.type}，返回 ${resultSize} 条/项`;
    })
    .join("\n");

  return `${baseContent}\n\n模型本地查询记录：\n${querySummary || "未执行额外查询"}`;
}

type DataQueryDecision =
  | { type: "queries"; queries: CsvDataQuery[]; rationale?: string }
  | { type: "final"; finalAnswer: string };

async function requestDataQueriesWithFallback(args: {
  question: string;
  profile: CsvProfile;
  previousResults: CsvDataQueryResult[];
  domain: "campaign" | "general";
  enableThinking: boolean;
  signal: AbortSignal;
  recoveryNotes: string[];
}): Promise<DataQueryDecision> {
  try {
    const decision = await requestDataQueries(args);
    if (decision.type === "queries" && decision.queries.length === 0) {
      args.recoveryNotes.push("模型没有返回可执行查询，已切换到本地后备查询。");
      return {
        type: "queries",
        queries: [
          createLocalFallbackAggregateQuery(args.question, args.profile),
        ],
      };
    }

    return decision;
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw error;
    }

    args.recoveryNotes.push(
      `查询规划失败，已切换到本地后备查询：${formatErrorMessage(error)}`,
    );
    return {
      type: "queries",
      queries: [createLocalFallbackAggregateQuery(args.question, args.profile)],
    };
  }
}

async function requestDataQueries(args: {
  question: string;
  profile: CsvProfile;
  previousResults: CsvDataQueryResult[];
  domain: "campaign" | "general";
  enableThinking: boolean;
  signal: AbortSignal;
  forceFinal?: boolean;
}): Promise<DataQueryDecision> {
  const resp = await fetch("/api/chat/analysis/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: args.question,
      profile: compactProfileForQuery(args.profile),
      previousResults: compactPreviousResultsForQuery(args.previousResults),
      domain: args.domain,
      enable_thinking: args.enableThinking,
      force_final: args.forceFinal ?? false,
    }),
    signal: args.signal,
  });

  const data = await resp.json();
  if (!resp.ok || !data.ok) {
    throw new Error(data.error ?? "CSV 自由查询失败。");
  }

  if (data.finalAnswer) {
    return { type: "final", finalAnswer: data.finalAnswer };
  }

  return {
    type: "queries",
    queries: Array.isArray(data.queries) ? data.queries : [],
    rationale: typeof data.rationale === "string" ? data.rationale : undefined,
  };
}

async function requestDataQueriesFinalAnswer(args: {
  question: string;
  profile: CsvProfile;
  previousResults: CsvDataQueryResult[];
  domain: "campaign" | "general";
  enableThinking: boolean;
  signal: AbortSignal;
  recoveryNotes?: string[];
}): Promise<string> {
  let decision: DataQueryDecision;
  try {
    decision = await requestDataQueries({ ...args, forceFinal: true });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw error;
    }

    return buildLocalFallbackSummary({
      question: args.question,
      queryResults: args.previousResults,
      recoveryNotes: [
        ...(args.recoveryNotes ?? []),
        `总结请求失败，已使用本地结果生成简要结论：${formatErrorMessage(error)}`,
      ],
    });
  }

  if (decision.type === "final") {
    return appendRecoveryNotes(decision.finalAnswer, args.recoveryNotes ?? []);
  }

  return buildLocalFallbackSummary({
    question: args.question,
    queryResults: args.previousResults,
    recoveryNotes: [
      ...(args.recoveryNotes ?? []),
      "已达到本地查询轮次上限，模型仍请求更多查询。",
    ],
  });
}

function buildExecutableQueryCandidates(
  queries: CsvDataQuery[],
  question: string,
  profile: CsvProfile,
  executedQueryKeys?: Set<string>,
) {
  const seen = new Set<string>();
  const uniqueQueries = queries.filter((query) => {
    const key = getCsvDataQueryKey(query);
    if (seen.has(key) || executedQueryKeys?.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  if (uniqueQueries.length > 0) {
    return uniqueQueries;
  }

  const fallback = createLocalFallbackAggregateQuery(question, profile);
  const fallbackKey = getCsvDataQueryKey(fallback);
  return executedQueryKeys?.has(fallbackKey) ? [] : [fallback];
}

function getCsvDataQueryKey(query: CsvDataQuery) {
  return JSON.stringify(query);
}

function describeCsvDataQuery(query: CsvDataQuery) {
  if (query.type === "aggregate") {
    const groupText =
      query.plan.groupBy.length > 0 ? query.plan.groupBy.join(" + ") : "全表";
    const metricText = query.plan.metrics
      .map((metric) => metric.name || `${metric.agg}(${metric.field})`)
      .join(", ");
    return `聚合：按 ${groupText}，计算 ${metricText || "指标"}`;
  }

  if (query.type === "filterRows") {
    return `筛选明细：${query.filters.length} 个条件`;
  }

  if (query.type === "distinctValues") {
    return `唯一值：${query.column}`;
  }

  if (query.type === "columnStats") {
    return `字段统计：${query.column}`;
  }

  if (query.type === "columns") {
    return `读取字段：${query.columns.join(", ")}`;
  }

  return "读取行";
}

function createLocalFallbackAggregateQuery(
  question: string,
  profile: CsvProfile,
): CsvDataQuery {
  const groupBy = inferLocalFallbackGroupBy(question, profile);
  const countField = groupBy[0] ?? profile.columns[0]?.name ?? "";

  return {
    type: "aggregate",
    plan: {
      goal: "local_fallback_count_by_group",
      requiredFields: groupBy,
      filters: [],
      groupBy,
      metrics: [{ name: "row_count", field: countField, agg: "count" }],
      ranking: { sortBy: "row_count", direction: "desc", limit: 50 },
    },
  };
}

function inferLocalFallbackGroupBy(
  question: string,
  profile: CsvProfile,
): string[] {
  const lowerQuestion = question.toLowerCase();
  const origin = findProfileColumnBySemantic(profile, "origin");
  const destination = findProfileColumnBySemantic(profile, "destination");
  const route = findProfileColumnBySemantic(profile, "route");

  if (
    origin &&
    destination &&
    (lowerQuestion.includes("origin") ||
      lowerQuestion.includes("destination") ||
      lowerQuestion.includes("od") ||
      lowerQuestion.includes("o&d") ||
      question.includes("组合") ||
      question.includes("航线"))
  ) {
    return [origin.name, destination.name];
  }

  if (route) {
    return [route.name];
  }

  if (origin && destination) {
    return [origin.name, destination.name];
  }

  const dimension = profile.columns.find(
    (column) => column.type === "string" || column.type === "date",
  );
  return dimension
    ? [dimension.name]
    : profile.columns.slice(0, 1).map((column) => column.name);
}

function findProfileColumnBySemantic(
  profile: CsvProfile,
  semanticType: NonNullable<CsvProfile["columns"][number]["semanticType"]>,
) {
  return profile.columns.find((column) => column.semanticType === semanticType);
}

function buildLocalFallbackSummary(args: {
  question: string;
  queryResults: CsvDataQueryResult[];
  recoveryNotes: string[];
}) {
  const aggregate = args.queryResults
    .map((result) => result.aggregateResult)
    .findLast(Boolean);
  const topRow = aggregate?.resultRows[0];
  const groupBy = aggregate?.plan.groupBy ?? [];
  const metricName = topRow
    ? "row_count" in topRow
      ? "row_count"
      : Object.keys(topRow).find((key) => !groupBy.includes(key))
    : undefined;
  const metricValue = metricName && topRow ? topRow[metricName] : undefined;
  const topLabel =
    topRow && groupBy.length > 0
      ? groupBy
          .map((field) => `${field}=${String(topRow[field] ?? "")}`)
          .join(" / ")
      : topRow
        ? JSON.stringify(topRow)
        : "";
  const notes = args.recoveryNotes.length
    ? `\n\n恢复记录：${args.recoveryNotes.join("；")}`
    : "";

  if (!aggregate || !topRow) {
    return `本地查询没有得到可总结的聚合结果。请指定要查询的字段或缩小问题范围。${notes}`;
  }

  const metricText = metricName
    ? `，${metricName} 为 ${String(metricValue)}`
    : "";
  return `本地聚合结果显示：共有 ${aggregate.totalGroupCount} 个分组，最靠前的分组是 ${topLabel}${metricText}。结果基于 ${aggregate.matchedRowCount}/${aggregate.rowCount} 行数据。${notes}`;
}

function appendRecoveryNotes(summary: string, recoveryNotes: string[]) {
  if (recoveryNotes.length === 0) {
    return summary;
  }

  return `${summary}\n\n恢复记录：${recoveryNotes.join("；")}`;
}

function formatErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

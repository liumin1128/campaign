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

    const validAttachments: Array<{ file: File; attachment: FileAttachment }> = [];

    for (const file of files) {
      const isCSV = file.name.endsWith(".csv") || file.type === "text/csv";
      if (!isCSV) {
        alert(`不支持的文件类型：${file.name}，已跳过。`);
        continue;
      }

      if (file.size > LARGE_CSV_MAX_BYTES) {
        alert(`CSV 文件过大：${file.name}。当前本地分析第一版最多支持 50MB，已跳过。`);
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
          updateAnalysisAttachment(id, {
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
            content: `[CSV 本地分析：${file.name}]\n分析失败：${
              error instanceof Error ? error.message : String(error)
            }`,
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
      alert(failedAttachment.analysis?.error ?? "CSV 分析失败，请重新添加文件。");
      return;
    }

    const sid = sessionId;
    const assistantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const initialStoredAttachments = csvAnalysisAttachments.map(toStoredAttachment);
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
      const summaries: string[] = [];

      for (const [index, analysisAttachment] of csvAnalysisAttachments.entries()) {
        const attachmentId = analysisAttachment.id;
        const profile = analysisAttachment.analysis!.profile!;
        const profileSummary = analysisAttachment.analysis!.profileSummary!;
        const statusPrefix =
          csvAnalysisAttachments.length > 1
            ? `(${index + 1}/${csvAnalysisAttachments.length}) ${analysisAttachment.name}：`
            : "";

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
            attachments: message.attachments?.map((attachment) =>
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
      for (const attachment of csvAnalysisAttachments) {
        if (attachment.id) {
          resetCsvWorker(attachment.id);
        }
      }
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
            ...(attachment.analysis ?? { status: "profiling" as CsvAnalysisStatus }),
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
    deleteSession,
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
  domain: "campaign" | "general";
  signal: AbortSignal;
  onStatus: (message: string) => void;
  onAttachmentPatch: (patch: Partial<CsvAnalysisState> & { content?: string }) => void;
}): Promise<{
  summary: string;
  queryResults: CsvDataQueryResult[];
  content: string;
}> {
  const queryResults: CsvDataQueryResult[] = [];

  for (let iteration = 0; iteration < MAX_QUERY_ITERATIONS; iteration++) {
    args.onAttachmentPatch({ status: "planning", queryResults });
    args.onStatus(
      iteration === 0
        ? "模型正在选择要查询的行、列或聚合口径…"
        : `模型正在基于第 ${iteration} 轮结果继续查询…`,
    );

    const decision = await requestDataQueries({
      question: args.question,
      profile: args.profile,
      previousResults: queryResults,
      domain: args.domain,
      signal: args.signal,
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

    args.onAttachmentPatch({ status: "executing", queryResults });
    args.onStatus(
      `正在本地执行模型请求的 ${decision.queries.length} 个数据查询…`,
    );

    for (const query of decision.queries) {
      const result = await executeQueryInWorker(args.workerKey, query);
      queryResults.push(result);
    }
  }

  args.onAttachmentPatch({ status: "summarizing", queryResults });
  args.onStatus("正在根据已查询的数据生成结论…");

  const summary = await requestDataQueriesFinalAnswer({
    question: args.question,
    profile: args.profile,
    previousResults: queryResults,
    domain: args.domain,
    signal: args.signal,
  });
  const content = buildQueryAttachmentContent({
    profileSummary: args.profileSummary,
    queryResults,
    summary,
  });

  return { summary, queryResults, content };
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

async function requestDataQueries(args: {
  question: string;
  profile: CsvProfile;
  previousResults: CsvDataQueryResult[];
  domain: "campaign" | "general";
  signal: AbortSignal;
}): Promise<DataQueryDecision> {
  const resp = await fetch("/api/chat/analysis/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: args.question,
      profile: compactProfileForQuery(args.profile),
      previousResults: compactPreviousResultsForQuery(args.previousResults),
      domain: args.domain,
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
    rationale: data.rationale,
  };
}

async function requestDataQueriesFinalAnswer(args: {
  question: string;
  profile: CsvProfile;
  previousResults: CsvDataQueryResult[];
  domain: "campaign" | "general";
  signal: AbortSignal;
}): Promise<string> {
  const decision = await requestDataQueries(args);

  if (decision.type === "final") {
    return decision.finalAnswer;
  }

  return "已达到本地查询轮次上限，但模型仍需要更多查询。请缩小问题范围，或指定要查看的行、列、筛选条件。";
}

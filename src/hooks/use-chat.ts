"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type {
  Message,
  AgentOption,
  FileAttachment,
} from "@/components/chat/types";
import { getLocalizedAgents, t } from "@/components/chat/i18n";
import { GLOBAL_EMPHASIS } from "@/components/chat/system-prompts";
import {
  buildAnalysisAttachmentContent,
  summarizeProfile,
} from "@/lib/client-analysis/csv-analysis-prompts";
import {
  compactPreviousResultsForQuery,
  compactProfileForQuery,
  compactRelatedFilesForQuery,
  type CsvRelatedFileContext,
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
import {
  buildPiUserPrompt,
  runPiAgent,
} from "@/lib/pi-agent/run-client-agent";
import { classifyPiTask } from "@/lib/pi-agent/task-routing";
import type { PiCsvContext } from "@/lib/pi-agent/types";
import { fetchFileAgentLimits } from "@/lib/file-agent/client-config";
import {
  registerGenericFile,
  resetAllGenericFiles,
  resetGenericFile,
} from "@/lib/file-agent/file-worker-client";
import type { GenericFileContext } from "@/lib/file-agent/types";
import { useActiveSession, useChatStore } from "@/store/chat-store";
import { usePromptOverrideStore } from "@/store/prompt-override-store";

type ActiveCsvContext = PiCsvContext;

const QUERY_ROUND_PROGRESS_DENOMINATOR = MAX_QUERY_ITERATIONS;

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
  const fileContextsRef = useRef<Record<string, GenericFileContext[]>>({});

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
      resetAllGenericFiles();
      csvContextsRef.current = {};
      fileContextsRef.current = {};
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

  const replaceFileContexts = useCallback(
    (id: string, nextContexts: GenericFileContext[]) => {
      const nextIds = new Set(nextContexts.map((context) => context.id));
      for (const context of fileContextsRef.current[id] ?? []) {
        if (!nextIds.has(context.id)) resetGenericFile(context.id);
      }
      fileContextsRef.current[id] = nextContexts;
    },
    [],
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      for (const context of csvContextsRef.current[id] ?? []) {
        resetCsvWorker(context.id);
      }
      for (const context of fileContextsRef.current[id] ?? []) {
        resetGenericFile(context.id);
      }
      delete csvContextsRef.current[id];
      delete fileContextsRef.current[id];
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
    const genericFileAttachments = fileAttachments.filter(
      (attachment) => attachment.type === "file",
    );
    const defaultCsvQuestion =
      language === "zh"
        ? "请基于这个 CSV 做一次概要分析并给出可执行洞察。"
        : "Please summarize this CSV and provide actionable insights.";
    const defaultFileQuestion =
      language === "zh"
        ? "请先检查这些文件，再自行选择检索或查询方式，给出有依据的结论。"
        : "Inspect these files, choose the appropriate search or query method, and provide an evidence-based conclusion.";
    const taskRoute = classifyPiTask(trimmed);
    const activeCsvContexts =
      sessionId && trimmed ? (csvContextsRef.current[sessionId] ?? []) : [];
    const activeFileContexts =
      sessionId && trimmed ? (fileContextsRef.current[sessionId] ?? []) : [];
    const readyFileContexts = getReadyGenericFileContexts(genericFileAttachments);
    const hasHistoricalGenericFiles = messages.some((message) =>
      message.attachments?.some((attachment) => attachment.type === "file"),
    );
    if (
      taskRoute.referencesFileContext &&
      readyFileContexts.length === 0 &&
      activeFileContexts.length === 0 &&
      hasHistoricalGenericFiles
    ) {
      alert(
        language === "zh"
          ? "原始文件已不在当前浏览器会话中，请重新上传后再查询。"
          : "The original file is no longer available in this browser session. Please upload it again.",
      );
      return;
    }
    const standaloneWebSearch =
      taskRoute.requestsWebSearch &&
      !taskRoute.referencesFileContext &&
      csvAnalysisAttachments.length === 0 &&
      genericFileAttachments.length === 0;

    const shouldUseFileContexts =
      readyFileContexts.length > 0 ||
      (taskRoute.referencesFileContext && activeFileContexts.length > 0);

    if (
      enableThinking ||
      taskRoute.requestsWebSearch ||
      genericFileAttachments.length > 0 ||
      shouldUseFileContexts
    ) {
      let piCsvContexts = standaloneWebSearch ? [] : activeCsvContexts;
      const piFileContexts = standaloneWebSearch
        ? []
        : readyFileContexts.length > 0
          ? readyFileContexts
          : taskRoute.referencesFileContext
            ? activeFileContexts
            : [];
      if (csvAnalysisAttachments.length > 0) {
        const readyContexts = getReadyCsvContexts(csvAnalysisAttachments);
        if (!readyContexts.ok) {
          alert(readyContexts.error);
          return;
        }
        piCsvContexts = readyContexts.contexts;
      }

      await handlePiThinkingSend(
        quotePrefix +
          (trimmed ||
            (csvAnalysisAttachments.length > 0
              ? defaultCsvQuestion
              : genericFileAttachments.length > 0
                ? defaultFileQuestion
                : "")),
        piCsvContexts,
        piFileContexts,
        fileAttachments,
        standaloneWebSearch ? [] : messages,
      );
      return;
    }

    if (csvAnalysisAttachments.length > 0) {
      await handleCsvAnalysisSend(
        quotePrefix + (trimmed || defaultCsvQuestion),
        csvAnalysisAttachments,
      );
      return;
    }

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

  async function handlePiThinkingSend(
    userContent: string,
    csvContexts: ActiveCsvContext[],
    genericFileContexts: GenericFileContext[],
    attachments: FileAttachment[],
    history: Message[],
  ) {
    if (!sessionId || isLoading) return;

    const sid = sessionId;
    const assistantId = crypto.randomUUID();
    const storedAttachments = attachments.map(toStoredAttachment);
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: userContent,
      attachments: storedAttachments.length > 0 ? storedAttachments : undefined,
    };
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "Pi Agent 正在思考…",
      reasoning: "",
    };
    const updatedMessages = [...messages, userMsg, assistantMsg];
    let latestContent = assistantMsg.content;
    let latestReasoning = "";

    updateSessionMessages(sid, updatedMessages);
    setInput("");
    setDraftInput(sid, "");
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await runPiAgent({
        sessionId: sid,
        systemPrompt: fullSystemPrompt,
        history,
        prompt: buildPiUserPrompt(userContent, storedAttachments),
        csvContexts,
        fileContexts: genericFileContexts,
        signal: controller.signal,
        onUpdate: (update) => {
          latestContent = update.content;
          latestReasoning = update.reasoning;
          updateSessionMessages(
            sid,
            updatedMessages.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: update.content,
                    reasoning: update.reasoning,
                  }
                : message,
            ),
          );
        },
      });

      latestContent = result.content;
      latestReasoning = result.reasoning;
      updateSessionMessages(
        sid,
        updatedMessages.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: result.content,
                reasoning: result.reasoning,
              }
            : message,
        ),
      );

      if (csvContexts.length > 0) {
        replaceCsvContexts(
          sid,
          csvContexts.map((context) => ({
            ...context,
            summary: result.content,
          })),
        );
      }
      if (genericFileContexts.length > 0) {
        replaceFileContexts(sid, genericFileContexts);
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
            ? {
                ...message,
                content: aborted
                  ? `${latestContent}\n\n_${errorMessage}_`
                  : `❌ ${errorMessage}`,
                reasoning: latestReasoning,
              }
            : message,
        ),
      );
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
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const limits = await fetchFileAgentLimits();
    const results = await Promise.all(
      files.map(async (file) => {
        try {
          const descriptor = await registerGenericFile(file, limits);
          return {
            id: descriptor.id,
            name: descriptor.name,
            content: formatGenericFileAttachmentContent(descriptor),
            type: "file" as const,
            size: descriptor.size,
            descriptor,
          } satisfies FileAttachment;
        } catch (error) {
          alert(`文件注册失败：${file.name}。${formatErrorMessage(error)}`);
          return null;
        }
      }),
    );
    const attachments: FileAttachment[] = results.flatMap((attachment) =>
      attachment ? [attachment] : [],
    );
    const unsupportedNames = attachments
      .filter((attachment) => !attachment.descriptor?.capabilities.includes("read"))
      .map((attachment) => attachment.name);
    if (unsupportedNames.length > 0) {
      alert(
        language === "zh"
          ? `以下文件当前只能识别类型，请先转换为 UTF-8 文本、CSV、TSV、JSON 或 JSONL：${unsupportedNames.join("、")}`
          : `These files must be converted to UTF-8 text, CSV, TSV, JSON, or JSONL first: ${unsupportedNames.join(", ")}`,
      );
    }
    if (attachments.length > 0) {
      setFileAttachments((previous) => [...previous, ...attachments]);
    }
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
      if (removed?.type === "file" && removed.id) {
        resetGenericFile(removed.id);
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

    const missingIdAttachment = csvAnalysisAttachments.find(
      (attachment) => !attachment.id,
    );
    if (missingIdAttachment) {
      alert(
        `CSV「${missingIdAttachment.name}」缺少本地分析标识，请重新添加文件。`,
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
      const domain = getCsvAnalysisDomain(selectedAgent?.id);
      const reportStatus = createCsvBatchStatusReporter({
        sessionId: sid,
        baseMessages: updatedMessages,
        assistantId,
        fileNames: csvAnalysisAttachments.map((attachment) => attachment.name),
      });
      const baseRelatedFiles = compactRelatedFilesForQuery(
        csvAnalysisAttachments.map((attachment) => ({
          name: attachment.name,
          profile: attachment.analysis!.profile!,
        })),
      );

      const analysisResults: Array<{
        finalAttachment: FileAttachment;
        context: ActiveCsvContext;
      }> = [];
      for (const [index, analysisAttachment] of csvAnalysisAttachments.entries()) {
        const attachmentId = analysisAttachment.id;
        if (!attachmentId) {
          throw new Error(
            `CSV「${analysisAttachment.name}」缺少本地分析标识，请重新添加文件。`,
          );
        }

        const profile = analysisAttachment.analysis!.profile!;
        const profileSummary = analysisAttachment.analysis!.profileSummary!;

        updateAnalysisAttachment(attachmentId, { status: "planning" });
        reportStatus(index, "模型正在决定要查询哪些数据…");

        const queryAnalysis = await runFreeCsvQueryAnalysis({
          workerKey: attachmentId,
          question: userContent,
          profile,
          profileSummary,
          domain,
          enableThinking,
          signal: controller.signal,
          relatedFiles: baseRelatedFiles.filter(
            (file) => file.name !== analysisAttachment.name,
          ),
          onStatus: (message) => {
            reportStatus(index, message);
          },
          onAttachmentPatch: (patch) => {
            updateAnalysisAttachment(attachmentId, patch);
          },
        });
        const { summary, queryResults, stageSummaries, content } = queryAnalysis;
        const finalAttachment: FileAttachment = {
          ...toStoredAttachment(analysisAttachment),
          content,
        };
        const context: ActiveCsvContext = {
          id: attachmentId,
          name: analysisAttachment.name,
          size: analysisAttachment.size,
          profile,
          profileSummary,
          queryResults,
          stageSummaries,
          summary,
          content,
        };

        updateAnalysisAttachment(attachmentId, {
          status: "completed",
          queryResults,
          stageSummaries,
          summary,
          content,
        });
        reportStatus(index, "已完成单文件分析，等待综合总结…");

        analysisResults.push({ finalAttachment, context });
      }

      const finalAttachments = analysisResults.map(
        (result) => result.finalAttachment,
      );
      const finalContexts = analysisResults.map((result) => result.context);
      const summary =
        finalContexts.length > 1
          ? await requestCombinedCsvSummary({
              question: userContent,
              contexts: finalContexts,
              domain,
              enableThinking,
              signal: controller.signal,
            })
          : (finalContexts[0]?.summary ?? "");
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
      const domain = getCsvAnalysisDomain(selectedAgent?.id);
      const reportStatus = createCsvBatchStatusReporter({
        sessionId: sid,
        baseMessages: updatedMessages,
        assistantId,
        fileNames: csvContexts.map((context) => context.name),
      });
      const baseRelatedFiles = compactRelatedFilesForQuery(
        csvContexts.map((context) => ({
          name: context.name,
          profile: context.profile,
          stageSummaries: context.stageSummaries,
          summary: context.summary,
        })),
      );

      const nextContexts: ActiveCsvContext[] = [];
      for (const [index, context] of csvContexts.entries()) {
        reportStatus(index, "模型正在决定要继续读取哪些数据…");

        const queryAnalysis = await runFreeCsvQueryAnalysis({
          workerKey: context.id,
          question: userContent,
          profile: context.profile,
          profileSummary: context.profileSummary,
          previousResults: context.queryResults,
          previousStageSummaries: context.stageSummaries,
          relatedFiles: baseRelatedFiles.filter(
            (file) => file.name !== context.name,
          ),
          domain,
          enableThinking,
          signal: controller.signal,
          onStatus: (message) => {
            reportStatus(index, message);
          },
          onAttachmentPatch: () => {},
        });

        reportStatus(index, "已完成单文件追问分析，等待综合总结…");

        nextContexts.push({
          ...context,
          queryResults: queryAnalysis.queryResults,
          stageSummaries: queryAnalysis.stageSummaries,
          summary: queryAnalysis.summary,
          content: queryAnalysis.content,
        });
      }

      const combinedSummary =
        nextContexts.length > 1
          ? await requestCombinedCsvSummary({
              question: userContent,
              contexts: nextContexts,
              domain,
              enableThinking,
              signal: controller.signal,
            })
          : (nextContexts[0]?.summary ?? "");

      replaceCsvContexts(sid, nextContexts);
      updateSessionMessages(
        sid,
        updatedMessages.map((message) =>
          message.id === assistantId
            ? { ...message, content: combinedSummary }
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
    descriptor: attachment.descriptor,
  };
}

function getReadyGenericFileContexts(
  attachments: FileAttachment[],
): GenericFileContext[] {
  return attachments.flatMap((attachment) =>
    attachment.id && attachment.descriptor
      ? [{ id: attachment.id, descriptor: attachment.descriptor }]
      : [],
  );
}

function formatGenericFileAttachmentContent(
  descriptor: GenericFileContext["descriptor"],
) {
  const warningText = descriptor.warnings.length
    ? `\n提示：${descriptor.warnings.join("；")}`
    : "";
  return `[本地文件：${descriptor.name}]\n类型：${descriptor.kind}\n大小：${descriptor.size} 字节\n可用能力：${descriptor.capabilities.join(", ") || "inspect"}${warningText}`;
}

function getReadyCsvContexts(
  attachments: FileAttachment[],
):
  | { ok: true; contexts: ActiveCsvContext[] }
  | { ok: false; error: string } {
  const contexts: ActiveCsvContext[] = [];

  for (const attachment of attachments) {
    if (attachment.analysis?.status === "failed") {
      return {
        ok: false,
        error: attachment.analysis.error ?? "CSV 分析失败，请重新添加文件。",
      };
    }
    if (!attachment.id) {
      return {
        ok: false,
        error: `CSV「${attachment.name}」缺少本地分析标识，请重新添加文件。`,
      };
    }
    if (!attachment.analysis?.profile || !attachment.analysis.profileSummary) {
      return {
        ok: false,
        error: `CSV「${attachment.name}」字段画像还没有准备好，请稍后再发送。`,
      };
    }

    contexts.push({
      id: attachment.id,
      name: attachment.name,
      size: attachment.size,
      profile: attachment.analysis.profile,
      profileSummary: attachment.analysis.profileSummary,
      queryResults: attachment.analysis.queryResults,
      stageSummaries: attachment.analysis.stageSummaries,
      summary: attachment.analysis.summary,
      content: attachment.content,
    });
  }

  return { ok: true, contexts };
}

function buildCsvBatchStatusPrefix(
  index: number,
  total: number,
  name: string,
): string {
  return total > 1 ? `(${index + 1}/${total}) ${name}：` : "";
}

function createCsvBatchStatusReporter(args: {
  sessionId: string;
  baseMessages: Message[];
  assistantId: string;
  fileNames: string[];
}) {
  const statuses = args.fileNames.map(() => "等待开始…");

  return (index: number, status: string) => {
    statuses[index] = status;
    const content =
      args.fileNames.length > 1
        ? statuses
            .map((item, itemIndex) =>
              formatCsvBatchStatusLine(
                itemIndex,
                args.fileNames.length,
                args.fileNames[itemIndex],
                item,
              ),
            )
            .join("\n\n")
        : status;

    updateAssistantMessage(
      args.sessionId,
      args.baseMessages,
      args.assistantId,
      content,
    );
  };
}

function formatCsvBatchStatusLine(
  index: number,
  total: number,
  fileName: string,
  status: string,
) {
  const normalizedStatus = status.trim() || "等待开始…";
  return `${buildCsvBatchStatusPrefix(index, total, fileName)}${normalizedStatus}`;
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
  previousStageSummaries?: string[];
  relatedFiles?: CsvRelatedFileContext[];
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
  stageSummaries: string[];
  content: string;
}> {
  const queryResults: CsvDataQueryResult[] = [...(args.previousResults ?? [])];
  const stageSummaries: string[] = compactStageSummariesForPrompt(
    args.previousStageSummaries ?? [],
  );
  const recoveryNotes: string[] = [];
  const progressLog: string[] = [];
  const executedQueryKeys = new Set(
    queryResults.map((result) => getCsvDataQueryKey(result.query)),
  );
  const updateProgressStatus = (current: string) => {
    args.onStatus([...progressLog, current].join("\n"));
  };

  for (let iteration = 0; iteration < MAX_QUERY_ITERATIONS; iteration++) {
    const roundNumber = iteration + 1;
    args.onAttachmentPatch({
      status: "planning",
      progress: getQueryRoundProgress(iteration, 0),
      queryResults,
      stageSummaries,
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
      stageSummaries,
      relatedFiles: args.relatedFiles ?? [],
      domain: args.domain,
      enableThinking: args.enableThinking,
      signal: args.signal,
      recoveryNotes,
    });

    if (decision.type === "final") {
      const content = buildQueryAttachmentContent({
        profileSummary: args.profileSummary,
        queryResults,
        stageSummaries,
        summary: decision.finalAnswer,
      });

      return {
        summary: decision.finalAnswer,
        queryResults,
        stageSummaries,
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
      stageSummaries,
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
        stageSummaries,
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
          stageSummaries,
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

    const currentRoundResults = queryResults.slice(
      queryResults.length - successfulQueries,
    );
    const roundSummary = buildStageSummary({
      roundNumber,
      question: args.question,
      results: currentRoundResults,
    });
    if (roundSummary) {
      stageSummaries.push(roundSummary);
      const latestStageSummary = `第 ${roundNumber} 轮阶段性结论：${roundSummary}`;
      progressLog.push(latestStageSummary);
      updateProgressStatus(latestStageSummary);
      args.onAttachmentPatch({
        status: "executing",
        progress: getQueryRoundProgress(iteration, 0.9),
        queryResults,
        stageSummaries,
      });
    }
  }

  args.onAttachmentPatch({
    status: "summarizing",
    progress: 0.92,
    queryResults,
    stageSummaries,
  });
  updateProgressStatus("正在根据已查询的数据生成结论…");

  const summary = await requestDataQueriesFinalAnswer({
    question: args.question,
    profile: args.profile,
    previousResults: queryResults,
    stageSummaries,
    relatedFiles: args.relatedFiles ?? [],
    domain: args.domain,
    enableThinking: args.enableThinking,
    signal: args.signal,
    recoveryNotes,
  });
  const content = buildQueryAttachmentContent({
    profileSummary: args.profileSummary,
    queryResults,
    stageSummaries,
    summary,
  });

  return { summary, queryResults, stageSummaries, content };
}

function getQueryRoundProgress(iteration: number, roundProgress: number) {
  const progress =
    (iteration + Math.max(0, Math.min(roundProgress, 1))) /
    QUERY_ROUND_PROGRESS_DENOMINATOR;
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

function compactStageSummariesForPrompt(summaries: string[]) {
  return summaries
    .flatMap((summary) => {
      const normalized = summary.replace(/\s+/g, " ").trim();
      return normalized ? [normalized.slice(0, 800)] : [];
    })
    .slice(-12);
}

function buildStageSummary(args: {
  roundNumber: number;
  question: string;
  results: CsvDataQueryResult[];
}) {
  const summaries = args.results
    .map((result) => summarizeQueryResultForStage(result))
    .filter(Boolean);

  if (summaries.length === 0) {
    return "";
  }

  return `第 ${args.roundNumber} 轮围绕“${args.question.slice(0, 80)}”完成 ${args.results.length} 个查询；${summaries.join("；")}`;
}

function summarizeQueryResultForStage(result: CsvDataQueryResult) {
  if (result.aggregateResult) {
    return summarizeAggregateResultForStage(result);
  }

  if (result.stats) {
    const column =
      result.query.type === "columnStats" ? result.query.column : "字段";
    const nonEmpty = result.stats.nonEmptyCount ?? result.matchedRowCount;
    const rowCount = result.stats.rowCount ?? result.rowCount;
    const metricParts = [
      result.stats.min !== undefined
        ? `最小 ${formatStageValue(result.stats.min)}`
        : "",
      result.stats.max !== undefined
        ? `最大 ${formatStageValue(result.stats.max)}`
        : "",
      result.stats.avg !== undefined
        ? `均值 ${formatStageValue(result.stats.avg)}`
        : "",
    ].filter(Boolean);

    return `${column} 统计非空 ${String(nonEmpty ?? "未知")}/${String(rowCount ?? "未知")}${metricParts.length ? `，${metricParts.join("，")}` : ""}`;
  }

  if (result.values) {
    const column =
      result.query.type === "distinctValues" ? result.query.column : "字段";
    return `${column} 有 ${String(result.matchedRowCount ?? result.values.length)} 个候选值，示例 ${result.values.slice(0, 6).map(String).join("、")}`;
  }

  if (result.rows) {
    return `读取到 ${result.rows.length} 行明细样本${result.matchedRowCount !== undefined ? `，匹配 ${result.matchedRowCount}/${result.rowCount} 行` : ""}`;
  }

  return "";
}

function summarizeAggregateResultForStage(result: CsvDataQueryResult) {
  const aggregate = result.aggregateResult;
  if (!aggregate) {
    return "";
  }

  const plan =
    result.query.type === "aggregate" ? result.query.plan : aggregate.plan;
  const groupText = plan.groupBy.length > 0 ? plan.groupBy.join(" + ") : "全表";
  const metricNames = plan.metrics.map((metric) => metric.name);
  const topRows = aggregate.resultRows.slice(0, 3).map((row, index) => {
    const dimensions = plan.groupBy
      .map((field) => `${field}=${formatStageValue(row[field])}`)
      .join(" / ");
    const metrics = metricNames
      .map((metric) => `${metric}=${formatStageValue(row[metric])}`)
      .join("，");
    return `${index + 1}) ${dimensions || "全表"}${metrics ? `，${metrics}` : ""}`;
  });

  return `按 ${groupText} 聚合，匹配 ${aggregate.matchedRowCount}/${aggregate.rowCount} 行、共 ${aggregate.totalGroupCount} 组，Top ${topRows.join("；") || "暂无结果"}`;
}

function formatStageValue(value: unknown) {
  if (typeof value === "number") {
    return Number(value.toFixed(4)).toString();
  }

  return String(value ?? "");
}

function buildQueryAttachmentContent(args: {
  profileSummary: CsvProfileSummary;
  queryResults: CsvDataQueryResult[];
  stageSummaries: string[];
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
  const stageSummaryText = args.stageSummaries
    .map((summary, index) => `${index + 1}. ${summary}`)
    .join("\n");

  return `${baseContent}\n\n阶段性结论：\n${stageSummaryText || "暂无"}\n\n模型本地查询记录：\n${querySummary || "未执行额外查询"}`;
}

function getCsvAnalysisDomain(
  agentId: string | undefined,
): "campaign" | "general" {
  return agentId === "campaign_planning" ? "campaign" : "general";
}

async function requestCombinedCsvSummary(args: {
  question: string;
  contexts: ActiveCsvContext[];
  domain: "campaign" | "general";
  enableThinking: boolean;
  signal: AbortSignal;
}) {
  const files = compactRelatedFilesForQuery(
    args.contexts.map((context) => ({
      name: context.name,
      profile: context.profile,
      stageSummaries: context.stageSummaries,
      summary: context.summary,
    })),
  );

  try {
    const resp = await fetch("/api/chat/analysis/combine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: args.question,
        files,
        domain: args.domain,
        enable_thinking: args.enableThinking,
      }),
      signal: args.signal,
    });
    const data = await resp.json();

    if (!resp.ok || !data.ok || typeof data.summary !== "string") {
      throw new Error(data.error ?? "CSV 多文件综合总结失败。");
    }

    return data.summary;
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw error;
    }

    return buildLocalCombinedCsvSummary(args.question, args.contexts, error);
  }
}

function buildLocalCombinedCsvSummary(
  question: string,
  contexts: ActiveCsvContext[],
  error?: unknown,
) {
  const isChinese = /[\u3400-\u9fff]/.test(question);
  const sections = contexts.map((context) => {
    const stageText = compactStageSummariesForPrompt(
      context.stageSummaries ?? [],
    )
      .map((summary) => `- ${summary}`)
      .join("\n");
    return `## ${context.name}\n\n${context.summary ?? "暂无单文件摘要"}${stageText ? `\n\n${stageText}` : ""}`;
  });
  const errorText = error ? `\n\n恢复记录：${formatErrorMessage(error)}` : "";

  if (isChinese) {
    return [
      "多文件分析已并行完成。综合总结接口不可用时，先给出以下基于各文件阶段性结论的保底汇总：",
      "",
      "总体判断：请优先寻找多个文件之间同名或语义相近的字段，结合各文件已确认的阶段性结论做横向对比、趋势衔接和异常互证。",
      "",
      ...sections,
      errorText,
    ]
      .join("\n")
      .trim();
  }

  return [
    "Multi-file analysis completed in parallel. The integrated summary endpoint was unavailable, so here is a fallback synthesis from each file's interim conclusions:",
    "",
    "Overall: compare shared or semantically similar fields across files, then use the per-file conclusions below for trend stitching and anomaly validation.",
    "",
    ...sections,
    errorText,
  ]
    .join("\n")
    .trim();
}

type DataQueryDecision =
  | { type: "queries"; queries: CsvDataQuery[]; rationale?: string }
  | { type: "final"; finalAnswer: string };

async function requestDataQueriesWithFallback(args: {
  question: string;
  profile: CsvProfile;
  previousResults: CsvDataQueryResult[];
  stageSummaries: string[];
  relatedFiles: CsvRelatedFileContext[];
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
  stageSummaries: string[];
  relatedFiles: CsvRelatedFileContext[];
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
      stageSummaries: compactStageSummariesForPrompt(args.stageSummaries),
      relatedFiles: args.relatedFiles,
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
  stageSummaries: string[];
  relatedFiles: CsvRelatedFileContext[];
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
      stageSummaries: args.stageSummaries,
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
    stageSummaries: args.stageSummaries,
    recoveryNotes: [
      ...(args.recoveryNotes ?? []),
      "已达到本地查询轮次上限，模型仍请求更多查询。",
    ],
  });
}

function buildExecutableQueryCandidates(
  queries: CsvDataQuery[],
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

  return [];
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
  stageSummaries: string[];
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
  const stageText = args.stageSummaries.length
    ? `阶段性结论：${compactStageSummariesForPrompt(args.stageSummaries).join("；")}\n\n`
    : "";

  if (!aggregate || !topRow) {
    return `${stageText}本地查询没有得到可总结的聚合结果。请指定要查询的字段或缩小问题范围。${notes}`;
  }

  const metricText = metricName
    ? `，${metricName} 为 ${String(metricValue)}`
    : "";
  return `${stageText}本地聚合结果显示：共有 ${aggregate.totalGroupCount} 个分组，最靠前的分组是 ${topLabel}${metricText}。结果基于 ${aggregate.matchedRowCount}/${aggregate.rowCount} 行数据。${notes}`;
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

"use client";

import {
  Agent,
  streamProxy,
  type AgentEvent,
  type AgentMessage,
} from "@earendil-works/pi-agent-core";
import type {
  AssistantMessage,
  Message as PiMessage,
  TextContent,
  ThinkingContent,
} from "@earendil-works/pi-ai";
import type {
  FileAttachment,
  Message as ChatMessage,
} from "@/components/chat/types";
import { createPiAgentBudget } from "./budget";
import { fetchPiAgentLimits } from "./client-config";
import { createLatestFrameNotifier } from "./frame-update-notifier";
import { PI_AGENT_MODEL } from "./model";
import { createPiAgentTools } from "./tools";
import { createGenericFileAgentTools } from "@/lib/file-agent/pi-tools";
import type {
  RunPiAgentOptions,
  RunPiAgentResult,
} from "./types";

const MAX_HISTORY_MESSAGES = 24;
const MAX_HISTORY_MESSAGE_CHARS = 120_000;
const MAX_PROMPT_CHARS = 500_000;
const MAX_REASONING_CHARS = 120_000;
const MAX_CONTENT_CHARS = 200_000;

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export async function runPiAgent(
  args: RunPiAgentOptions,
): Promise<RunPiAgentResult> {
  const limits = await fetchPiAgentLimits(args.signal);
  const budget = createPiAgentBudget(limits);
  const scriptResults: RunPiAgentResult["scriptResults"] = [];
  let reasoning = "";
  let currentTurnText = "";
  let finalContent = "";

  const agent = new Agent({
    initialState: {
      systemPrompt: buildAgentSystemPrompt(
        args.systemPrompt,
        args.csvContexts,
        args.fileContexts,
        limits,
      ),
      model: PI_AGENT_MODEL,
      thinkingLevel: "max",
      messages: convertChatHistory(args.history),
      tools: [
        ...createPiAgentTools({
          csvContexts: args.csvContexts,
          scriptResults,
        }),
        ...createGenericFileAgentTools(args.fileContexts),
      ],
    },
    streamFn: (model, context, options) =>
      streamProxy(model, context, {
        ...options,
        authToken: "same-origin",
        proxyUrl: window.location.origin,
      }),
    sessionId: args.sessionId,
    toolExecution: "parallel",
    beforeToolCall: async ({ toolCall }) => {
      const decision = budget.tryUseTool(toolCall.name);
      return decision.allowed
        ? undefined
        : { block: true, reason: decision.reason };
    },
    shouldStopAfterTurn: () => budget.shouldStopAfterTurn(),
  });

  const updateNotifier = createLatestFrameNotifier(args.onUpdate);
  const notify = () => {
    updateNotifier.push({
      content: finalContent || currentTurnText,
      reasoning,
      budget: budget.snapshot(),
    });
  };

  const unsubscribe = agent.subscribe((event) => {
    switch (event.type) {
      case "turn_start": {
        budget.startModelTurn();
        currentTurnText = "";
        notify();
        break;
      }
      case "message_update":
        if (event.assistantMessageEvent.type === "thinking_delta") {
          reasoning = appendCapped(
            reasoning,
            event.assistantMessageEvent.delta,
            MAX_REASONING_CHARS,
          );
          notify();
        } else if (event.assistantMessageEvent.type === "text_delta") {
          currentTurnText = appendCapped(
            currentTurnText,
            event.assistantMessageEvent.delta,
            MAX_CONTENT_CHARS,
          );
          notify();
        }
        break;
      case "tool_execution_start":
        reasoning = appendCapped(
          reasoning,
          `\n[工具] 正在调用 ${event.toolName}...`,
          MAX_REASONING_CHARS,
        );
        notify();
        break;
      case "tool_execution_end":
        reasoning = appendCapped(
          reasoning,
          `\n[工具] ${event.toolName} ${event.isError ? "失败" : "完成"}`,
          MAX_REASONING_CHARS,
        );
        notify();
        break;
      case "turn_end":
        handleTurnEnd(event);
        break;
      case "agent_end":
        if (!finalContent) {
          finalContent = getLastAssistantText(event.messages);
        }
        notify();
        break;
    }
  });

  function handleTurnEnd(event: Extract<AgentEvent, { type: "turn_end" }>) {
    if (event.toolResults.length > 0) {
      if (currentTurnText.trim()) {
        reasoning = appendCapped(
          reasoning,
          `\n[阶段输出] ${currentTurnText.trim()}`,
          MAX_REASONING_CHARS,
        );
      }
      currentTurnText = "";
    } else if (event.message.role === "assistant") {
      finalContent = currentTurnText || getAssistantText(event.message);
    }
    notify();
  }

  const handleExternalAbort = () => agent.abort();
  args.signal.addEventListener("abort", handleExternalAbort, { once: true });

  try {
    await agent.prompt(args.prompt.slice(0, MAX_PROMPT_CHARS));
    if (args.signal.aborted) {
      throw createAbortError();
    }
    if (agent.state.errorMessage) {
      throw new Error(agent.state.errorMessage);
    }
    if (!finalContent.trim()) {
      finalContent =
        "Pi Agent 已达到本次思考预算，但没有生成可用的最终回答。请缩小问题范围后重试。";
      notify();
    }

    return {
      content: finalContent,
      reasoning,
      budget: budget.snapshot(),
      scriptResults,
    };
  } finally {
    unsubscribe();
    args.signal.removeEventListener("abort", handleExternalAbort);
    updateNotifier.flush();
  }
}

export function buildPiUserPrompt(
  content: string,
  attachments?: FileAttachment[],
) {
  const attachmentText = attachments
    ?.map((attachment) => `[附件：${attachment.name}]\n\n${attachment.content}`)
    .join("\n\n");
  return [content, attachmentText].filter(Boolean).join("\n\n");
}

function buildAgentSystemPrompt(
  basePrompt: string,
  csvContexts: RunPiAgentOptions["csvContexts"],
  fileContexts: RunPiAgentOptions["fileContexts"],
  limits: Awaited<ReturnType<typeof fetchPiAgentLimits>>,
) {
  const legacyCsvCatalog = csvContexts.map((context) => ({
    id: context.id,
    name: context.name,
    size: context.size,
    profile: context.profileSummary,
    sampleRows: context.profile.sampleRows.slice(0, 5),
    previousSummary: context.summary?.slice(0, 4_000),
  }));
  const fileCatalog = fileContexts.map((context) => context.descriptor);

  return `${basePrompt}

# Pi Agent 思考循环

你可以自主决定是否以及何时调用工具。需要实时事实时使用 web_search。处理通用文件时，先调用 inspect_file，再根据 capabilities 选择 search_file、read_file_chunk 或 query_file；不要顺序读取整个大文件。处理 XLSX 时先从 structure.sheets 确定工作表，再通过 sheet 参数读取或查询。旧版大 CSV 使用 query_large_file。只有本地查询不足以完成二次计算时才使用 run_analysis_script。收集到足够证据后，停止调用工具并直接给出最终答案。

约束：最多 ${limits.maxModelTurns} 个模型回合、${limits.maxToolCalls} 次工具调用、${limits.maxWebSearches} 次 Web Search。不要为了耗尽预算而调用工具，也不要重复相同查询。工具失败时应调整方法或基于已有证据作答。

run_analysis_script 中的代码是函数体，输入变量名为 input，必须使用 return 返回可 JSON 序列化的数据。脚本没有网络、文件系统、浏览器或 Node.js API。

通用文件目录：
${fileCatalog.length > 0 ? JSON.stringify(fileCatalog) : "无"}

旧版 CSV 分析目录：
${legacyCsvCatalog.length > 0 ? JSON.stringify(legacyCsvCatalog) : "无"}`;
}

function convertChatHistory(messages: ChatMessage[]): AgentMessage[] {
  return messages
    .filter((message) => message.role !== "system")
    .slice(-MAX_HISTORY_MESSAGES)
    .map(convertChatMessage);
}

function convertChatMessage(message: ChatMessage): PiMessage {
  const timestamp = Date.now();
  if (message.role === "user") {
    return {
      role: "user",
      content: buildPiUserPrompt(message.content, message.attachments).slice(
        0,
        MAX_HISTORY_MESSAGE_CHARS,
      ),
      timestamp,
    };
  }

  const content: Array<TextContent | ThinkingContent> = [];
  if (message.reasoning?.trim()) {
    content.push({
      type: "thinking",
      thinking: message.reasoning.slice(0, MAX_HISTORY_MESSAGE_CHARS / 2),
    });
  }
  content.push({
    type: "text",
    text: message.content.slice(0, MAX_HISTORY_MESSAGE_CHARS),
  });
  return {
    role: "assistant",
    content,
    api: PI_AGENT_MODEL.api,
    provider: PI_AGENT_MODEL.provider,
    model: PI_AGENT_MODEL.id,
    usage: EMPTY_USAGE,
    stopReason: "stop",
    timestamp,
  };
}

function getLastAssistantText(messages: AgentMessage[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === "assistant") {
      const text = getAssistantText(message);
      if (text) return text;
    }
  }
  return "";
}

function getAssistantText(message: AssistantMessage) {
  return message.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function appendCapped(current: string, addition: string, maxLength: number) {
  if (!addition || current.length >= maxLength) return current;
  const remaining = maxLength - current.length;
  return current + addition.slice(0, remaining);
}

function createAbortError() {
  return new DOMException("Operation aborted", "AbortError");
}

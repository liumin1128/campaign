import { getDeepSeekApiKey } from "@/lib/env";
import { searchWeb } from "@/lib/search";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEEPSEEK_BASE = "https://api.deepseek.com";

// ---------- Types ----------

interface DeepSeekMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

interface RequestBody {
  messages: Array<{ role: string; content: string }>;
  /** 是否启用互联网搜索（tool calling） */
  enable_search?: boolean;
}

// ---------- Tool 定义 ----------

const SEARCH_WEB_TOOL = {
  type: "function" as const,
  function: {
    name: "search_web",
    description:
      "搜索互联网获取实时信息，包括新闻资讯、节假日安排、学期校历、活动赛事、突发事件、政策公告等。" +
      "当用户询问需要最新数据、当前日期相关、或你不确定的事实性信息时，调用此工具。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "搜索关键词。建议使用中文，尽可能具体，包含地点、时间、主体等要素（如'2026年7月北京国际旅游博览会'）。",
        },
        topic: {
          type: "string",
          enum: ["general", "news"],
          description:
            "搜索类型：general 通用搜索（节假日、活动、政策等），news 最新新闻资讯。",
        },
        time_range: {
          type: "string",
          enum: ["day", "week", "month", "year"],
          description: "时间范围筛选，从当前日期往前推。新闻类建议使用 week。",
        },
      },
      required: ["query"],
    },
  },
};

const TOOLS = [SEARCH_WEB_TOOL];

// ---------- DeepSeek API helpers ----------

async function callDeepSeek(
  apiKey: string,
  messages: DeepSeekMessage[],
  options?: { stream?: boolean; tools?: boolean },
): Promise<Response> {
  const body: Record<string, unknown> = {
    model: "deepseek-v4-flash",
    messages,
  };

  if (options?.stream) {
    body.stream = true;
  }

  if (options?.tools) {
    body.tools = TOOLS;
  }

  return fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

/** 非流式调用，用于 tool calling 协商 */
async function askWithTools(
  apiKey: string,
  messages: DeepSeekMessage[],
): Promise<{
  message: DeepSeekMessage;
  finish_reason: "stop" | "tool_calls" | "length";
}> {
  const resp = await callDeepSeek(apiKey, messages, { tools: true });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DeepSeek API error: ${errText}`);
  }

  const data = await resp.json();
  const choice = data.choices?.[0];

  return {
    message: choice?.message ?? { role: "assistant", content: null },
    finish_reason: choice?.finish_reason ?? "stop",
  };
}

/** 执行 search_web tool call */
async function executeToolCall(
  toolCall: NonNullable<DeepSeekMessage["tool_calls"]>[0],
): Promise<string> {
  const args = JSON.parse(toolCall.function.arguments);
  const result = await searchWeb(args.query, {
    topic: args.topic ?? "general",
    maxResults: 6,
    includeAnswer: true,
    timeRange: args.time_range ?? undefined,
  });

  const lines: string[] = [];

  if (result.answer) {
    lines.push(`## 搜索摘要\n${result.answer}\n`);
  }

  lines.push(`## 搜索结果（搜索词: ${args.query}）\n`);

  for (const item of result.results) {
    lines.push(
      `### ${item.title}\n- 来源: ${item.url}\n- 时间: ${item.publishedDate ?? "未知"}\n- 内容: ${item.content}\n`,
    );
  }

  return lines.join("\n");
}

// ---------- SSE 流式响应 ----------

function createSSEStream(deepseekResp: Response): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const reader = deepseekResp.body?.getReader();
      if (!reader) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", content: "无法读取响应流" })}\n\n`,
          ),
        );
        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
        controller.close();
        return;
      }

      // 类型已收窄，赋值给不可变引用让内部函数也能推断
      const upstreamReader: ReadableStreamDefaultReader<Uint8Array> = reader;

      const decoder = new TextDecoder();
      let buffer = "";

      async function pump(): Promise<void> {
        try {
          const { done, value } = await upstreamReader.read();

          if (done) {
            if (buffer.trim()) processLine(buffer.trim());
            controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) processLine(line);
          await pump();
        } catch {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", content: "响应中断" })}\n\n`,
            ),
          );
          controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
          controller.close();
        }
      }

      function processLine(line: string) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) return;
        if (!trimmed.startsWith("data:")) return;

        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr === "[DONE]") return;

        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) return;

          if (delta.reasoning_content) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "reasoning", content: delta.reasoning_content })}\n\n`,
              ),
            );
          }

          if (delta.content) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "content", content: delta.content })}\n\n`,
              ),
            );
          }
        } catch {
          // JSON parse 失败则忽略
        }
      }

      await pump();
    },
  });
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

// ---------- 流式响应的公共入口 ----------

async function streamFinalResponse(
  apiKey: string,
  messages: DeepSeekMessage[],
): Promise<Response> {
  const deepseekResp = await callDeepSeek(apiKey, messages, { stream: true });

  if (!deepseekResp.ok) {
    const errText = await deepseekResp.text();
    return Response.json(
      { ok: false, error: `DeepSeek 请求失败: ${errText}` },
      { status: 502 },
    );
  }

  return new Response(createSSEStream(deepseekResp), { headers: SSE_HEADERS });
}

// ---------- 主 Handler ----------

export async function POST(request: Request) {
  try {
    const apiKey = getDeepSeekApiKey();
    const body = (await request.json()) as RequestBody;

    if (!body.messages?.length) {
      return Response.json(
        { ok: false, error: "messages is required" },
        { status: 400 },
      );
    }

    const messages = body.messages as DeepSeekMessage[];
    const enableSearch = body.enable_search ?? false;

    // ---- 不启用搜索：直接流式 ----
    if (!enableSearch) {
      return streamFinalResponse(apiKey, messages);
    }

    // ---- 启用搜索：Tool Calling 循环 ----
    const MAX_ROUNDS = 5;
    const currentMessages = [...messages];

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const result = await askWithTools(apiKey, currentMessages);

      const hasToolCalls =
        result.finish_reason === "tool_calls" &&
        result.message.tool_calls?.length;

      if (!hasToolCalls) {
        // 模型决定不再调用工具，将协商得到的 assistant 消息追加到历史后流式输出
        if (result.message.content) {
          currentMessages.push(result.message);

          // 继续流式生成后续内容
          return streamFinalResponse(apiKey, currentMessages);
        }

        // content 为 null（如 stop 时），直接流式
        return streamFinalResponse(apiKey, currentMessages);
      }

      // 有 tool calls：追加 assistant 消息
      currentMessages.push(result.message);

      // 逐个执行
      for (const toolCall of result.message.tool_calls!) {
        if (toolCall.function.name === "search_web") {
          const toolResult = await executeToolCall(toolCall);
          currentMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: "search_web",
            content: toolResult,
          });
        }
      }

      // 继续循环，让模型基于搜索结果继续推理
    }

    // 超过最大轮次，直接输出
    return streamFinalResponse(apiKey, currentMessages);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

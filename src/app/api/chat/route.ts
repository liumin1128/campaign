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

// ---------- DSML 格式检测与解析 ----------
// DeepSeek 模型有时会在 content 中直接输出 DSML 格式的工具调用，
// 而不是通过 API 的 tool_calls 字段返回，需要检测并手动处理。

const DSML_PATTERN =
  /(?:<｜｜DSML｜｜tool_calls>|<｜tool▁calls｜>|<\|tool_calls\|>)/;

function containsDSMLToolCalls(content: string): boolean {
  return DSML_PATTERN.test(content);
}

/**
 * 解析 content 中的 DSML 格式工具调用，返回结构化的 tool_calls 数组。
 * 支持 <｜｜DSML｜｜invoke> 和 <｜｜DSML｜｜parameter> 标记。
 */
function parseDSMLToolCalls(
  content: string,
): NonNullable<DeepSeekMessage["tool_calls"]> | null {
  const invokeRe =
    /<｜｜DSML｜｜invoke\s+name="(\w+)">([\s\S]*?)<\/｜｜DSML｜｜invoke>/g;
  const calls: NonNullable<DeepSeekMessage["tool_calls"]> = [];

  let m: RegExpExecArray | null;
  while ((m = invokeRe.exec(content)) !== null) {
    const name = m[1];
    const paramBlock = m[2];

    const paramRe =
      /<｜｜DSML｜｜parameter\s+name="(\w+)"[^>]*>([\s\S]*?)<\/｜｜DSML｜｜parameter>/g;
    const args: Record<string, string> = {};
    let pm: RegExpExecArray | null;
    while ((pm = paramRe.exec(paramBlock)) !== null) {
      args[pm[1]] = pm[2].trim();
    }

    calls.push({
      id: `dsml_${Date.now()}_${calls.length}`,
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    });
  }

  return calls.length > 0 ? calls : null;
}

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

/** 执行 search_web tool call，支持重试与退避 */
async function executeToolCall(
  toolCall: NonNullable<DeepSeekMessage["tool_calls"]>[0],
): Promise<string> {
  const args = JSON.parse(toolCall.function.arguments);
  const query: string = args.query;
  const topic: "general" | "news" = args.topic ?? "general";
  const timeRange: string | undefined = args.time_range;

  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // 首次用原始参数；重试时逐步放宽：去掉时间范围 → 强制 general
      const retryTimeRange: "day" | "week" | "month" | "year" | undefined =
        attempt === 0 &&
        (timeRange === "day" ||
          timeRange === "week" ||
          timeRange === "month" ||
          timeRange === "year")
          ? timeRange
          : undefined;

      const opts = {
        topic: (attempt === 0 ? topic : attempt === 1 ? topic : "general") as
          | "general"
          | "news",
        maxResults: 6,
        includeAnswer: true,
        timeRange: retryTimeRange,
      };

      const result = await searchWeb(query, opts);

      const hasResults = result.results.length > 0 || !!result.answer;

      if (hasResults) {
        // 有结果，立即返回
        return formatSearchResult(query, result);
      }

      // 无结果：等待后退避重试
      if (attempt < MAX_RETRIES - 1) {
        const delayMs = (attempt + 1) * 3000; // 3s → 6s
        console.warn(
          `[search_web] 第 ${attempt + 1} 次搜索无结果，${delayMs / 1000}s 后重试（query: ${query}）`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[search_web] 第 ${attempt + 1} 次搜索异常: ${errMsg}`);
      if (attempt < MAX_RETRIES - 1) {
        const delayMs = (attempt + 1) * 3000;
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        return `搜索失败（已重试 ${MAX_RETRIES} 次）: ${errMsg}`;
      }
    }
  }

  // 全部重试后仍无结果
  return `搜索"${query}"未找到相关结果（已尝试 ${MAX_RETRIES} 次）。建议更换搜索词或扩大搜索范围。`;
}

/** 将搜索结果格式化为文本 */
function formatSearchResult(
  query: string,
  result: Awaited<ReturnType<typeof searchWeb>>,
): string {
  const lines: string[] = [];

  lines.push(`## 事实核验说明\n${result.verificationSummary}\n`);
  lines.push(
    "请仅将搜索结果作为待核验上下文使用；低可信或缺少多来源交叉验证的信息，回答时必须使用保守表述并提示用户确认。\n",
  );

  if (result.answer) {
    lines.push(`## 搜索摘要\n${result.answer}\n`);
  }

  lines.push(`## 搜索结果（搜索词: ${query}）\n`);

  for (const item of result.results) {
    lines.push(
      `### ${item.title}\n- 来源: ${item.url}\n- 时间: ${item.publishedDate ?? "未知"}\n- 可信度: ${item.credibility.level}（${item.credibility.reasons.join("；")}）\n- 内容: ${item.content}\n`,
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

// ---------- 将已有内容直接包装为 SSE 流 ----------

function streamStaticContent(message: DeepSeekMessage): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 发送 reasoning_content（如果有）
      const reasoning = (message as unknown as Record<string, unknown>)
        .reasoning_content as string | undefined;
      if (reasoning) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "reasoning", content: reasoning })}\n\n`,
          ),
        );
      }

      // 发送主内容
      if (message.content) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "content", content: message.content })}\n\n`,
          ),
        );
      }

      controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

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
        // 检测 content 中是否包含 DSML 格式的工具调用
        // DeepSeek 有时在 content 中直接输出 DSML 标记而非使用 tool_calls 字段
        if (
          result.message.content &&
          containsDSMLToolCalls(result.message.content)
        ) {
          const dsmlCalls = parseDSMLToolCalls(result.message.content);
          if (dsmlCalls) {
            console.warn(
              `[chat] 检测到 DSML 格式工具调用（round ${round + 1}），手动解析执行`,
            );
            // 用解析出的 tool_calls 替代原始 content
            const assistantMsg: DeepSeekMessage = {
              role: "assistant",
              content: null,
              tool_calls: dsmlCalls,
            };
            currentMessages.push(assistantMsg);

            for (const toolCall of dsmlCalls) {
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
            continue; // 继续循环让模型基于搜索结果生成回复
          }
        }

        // 模型已在非流式阶段生成了完整回复，直接包装为 SSE 流返回
        // 不再二次调用 API，否则模型会认为已回答过只给简短后续
        if (result.message.content) {
          return streamStaticContent(result.message);
        }

        // content 为 null（如 stop 时），让模型继续流式生成
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

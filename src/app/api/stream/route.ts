import type { ProxyAssistantMessageEvent } from "@earendil-works/pi-agent-core";
import type { Context } from "@earendil-works/pi-ai";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { getDeepSeekApiKey } from "@/lib/env";
import { PI_AGENT_MODEL } from "@/lib/pi-agent/model";
import { toProxyAssistantEvent } from "@/lib/pi-agent/proxy-events";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_MESSAGES = 256;
const MAX_TOOLS = 16;
const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

const provider = deepseekProvider();

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "Pi request body is too large" }, { status: 413 });
  }

  let context: Context;
  let sessionId: string | undefined;
  try {
    const body = (await request.json()) as unknown;
    context = parseContext(body);
    sessionId = parseSessionId(body);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid Pi request" },
      { status: 400 },
    );
  }

  const apiKey = getDeepSeekApiKey();
  const upstream = provider.streamSimple(PI_AGENT_MODEL, context, {
    apiKey,
    reasoning: "max",
    sessionId,
    signal: request.signal,
    maxRetryDelayMs: 15_000,
  });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of upstream) {
          controller.enqueue(encodeSse(encoder, toProxyAssistantEvent(event)));
        }
      } catch (error) {
        controller.enqueue(
          encodeSse(encoder, createProxyError(error, request.signal.aborted)),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

function parseContext(body: unknown): Context {
  const record = asRecord(body);
  const rawContext = asRecord(record.context);
  if (!Array.isArray(rawContext.messages)) {
    throw new Error("context.messages must be an array");
  }
  if (rawContext.messages.length > MAX_MESSAGES) {
    throw new Error(`context.messages exceeds ${MAX_MESSAGES} messages`);
  }
  if (rawContext.tools !== undefined && !Array.isArray(rawContext.tools)) {
    throw new Error("context.tools must be an array");
  }
  if (Array.isArray(rawContext.tools) && rawContext.tools.length > MAX_TOOLS) {
    throw new Error(`context.tools exceeds ${MAX_TOOLS} tools`);
  }

  return {
    systemPrompt:
      typeof rawContext.systemPrompt === "string"
        ? rawContext.systemPrompt.slice(0, 120_000)
        : undefined,
    messages: rawContext.messages as Context["messages"],
    tools: Array.isArray(rawContext.tools)
      ? (rawContext.tools as Context["tools"])
      : undefined,
  };
}

function parseSessionId(body: unknown) {
  const options = asRecord(asRecord(body).options, false);
  return typeof options?.sessionId === "string"
    ? options.sessionId.slice(0, 200)
    : undefined;
}

function asRecord(
  value: unknown,
  required = true,
): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (!required) {
    return {};
  }
  throw new Error("Request body must be an object");
}

function encodeSse(
  encoder: TextEncoder,
  event: ProxyAssistantMessageEvent,
) {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

function createProxyError(
  error: unknown,
  aborted: boolean,
): ProxyAssistantMessageEvent {
  return {
    type: "error",
    reason: aborted ? "aborted" : "error",
    errorMessage: error instanceof Error ? error.message : String(error),
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

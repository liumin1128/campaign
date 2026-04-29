import { getDeepSeekApiKey } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 120; // 最长 120 秒

const DEEPSEEK_BASE = "https://api.deepseek.com";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface RequestBody {
  messages: ChatMessage[];
}

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

    const deepseekResp = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: body.messages,
        stream: true,
      }),
    });

    if (!deepseekResp.ok) {
      const errText = await deepseekResp.text();
      return Response.json(
        { ok: false, error: `DeepSeek API error: ${errText}` },
        { status: deepseekResp.status },
      );
    }

    // 将 DeepSeek 的 SSE 流转换为自定义格式转发给前端
    const upstreamReader = deepseekResp.body?.getReader();
    if (!upstreamReader) {
      return Response.json(
        { ok: false, error: "No response body from DeepSeek" },
        { status: 502 },
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";

        async function pump(): Promise<void> {
          try {
            const { done, value } = await upstreamReader.read();

            if (done) {
              // 处理缓冲区剩余数据
              if (buffer.trim()) {
                processSSELine(buffer.trim());
              }
              controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
              controller.close();
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              processSSELine(line);
            }

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

        function processSSELine(line: string) {
          const trimmed = line.trim();

          // 忽略空行和注释
          if (!trimmed || trimmed.startsWith(":")) return;

          // 只处理 data: 行
          if (!trimmed.startsWith("data:")) return;

          const jsonStr = trimmed.slice(5).trim();

          // 结束标记
          if (jsonStr === "[DONE]") {
            return;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta;

            if (!delta) return;

            // 推理过程
            if (delta.reasoning_content) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "reasoning", content: delta.reasoning_content })}\n\n`,
                ),
              );
            }

            // 最终内容
            if (delta.content) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "content", content: delta.content })}\n\n`,
                ),
              );
            }
          } catch {
            // JSON 解析失败则忽略该行
          }
        }

        await pump();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

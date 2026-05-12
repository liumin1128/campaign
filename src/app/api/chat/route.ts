import {
  createJob,
  createAgentSLSSEResponse,
  toAgentSLMessage,
} from "@/lib/agentsl";
import { getAgentSLUserId, getAgentSLId } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 120;

// ---------- Types ----------

interface RequestBody {
  messages: Array<{ role: string; content: string }>;
  /** 是否启用互联网搜索（由 AgentSL Agent 内部处理） */
  enable_search?: boolean;
  /** 会话 ID（用于多轮对话上下文追踪，未提供时自动生成） */
  session_id?: string;
  /** Agent ID（可选，默认使用环境变量 AGENTSL_ID） */
  agent_id?: string;
}

// ---------- 主 Handler ----------

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    if (!body.messages?.length) {
      return Response.json(
        { ok: false, error: "messages is required" },
        { status: 400 },
      );
    }

    const userId = getAgentSLUserId();
    const defaultAgentId = getAgentSLId();

    // 会话 ID：优先使用客户端传入的，否则生成新 UUID
    const sessionId =
      body.session_id || `session-${crypto.randomUUID().slice(0, 8)}`;

    // Agent ID：优先使用请求中指定的，否则用默认值
    const agentId = body.agent_id || defaultAgentId;

    // 将前端消息格式转换为 AgentSL 格式（取最后一条 user 消息）
    const { text } = toAgentSLMessage(body.messages);

    if (!text.trim()) {
      return Response.json(
        { ok: false, error: "empty user message" },
        { status: 400 },
      );
    }

    // 创建 AgentSL Job
    const job = await createJob({
      user_id: userId,
      session_id: sessionId,
      agent_id: agentId,
      message: {
        role: "user",
        parts: [{ text }],
      },
    });

    console.log(
      `[AgentSL] Job created: ${job.job_id}, agent: ${agentId}, session: ${sessionId}`,
    );

    // 流式返回 SSE 响应（客户端断开时自动取消 Job）
    return createAgentSLSSEResponse(job.job_id, request.signal);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[AgentSL] Chat error:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

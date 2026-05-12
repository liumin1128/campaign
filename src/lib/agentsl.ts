/**
 * AgentSL Runner API 客户端
 *
 * AgentSL Runner 是一个基于 Job 的 AI Agent 执行服务。
 * 不同于传统 LLM 的 /chat/completions 接口，AgentSL 采用异步 Job 模型：
 * 1. 创建 Job → 获得 job_id
 * 2. 轮询或 SSE 流式监听 Job 状态
 * 3. Job 完成后获取结果
 *
 * API 文档: https://api.nonprod.kariba-agentsl-runner.de.sin.auto2.nonprod.c0.sq.com.sg/docs
 * OpenAPI 规范: https://api.nonprod.kariba-agentsl-runner.de.sin.auto2.nonprod.c0.sq.com.sg/openapi.json
 *
 * 注意：非生产环境使用自签名证书，需设置 NODE_TLS_REJECT_UNAUTHORIZED=0
 *       或通过 HTTPS_PROXY 访问。
 */

import { getAgentSLApiToken, getAgentSLBaseUrl } from "@/lib/env";

// ---------- 常量 ----------

/** AgentSL Runner API 基础 URL */
const AGENTSL_BASE = getAgentSLBaseUrl();

/** 是否为非生产环境（自签名证书） */
const isNonProd = AGENTSL_BASE.includes("nonprod");

/** HTTP 请求头工厂 */
function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Agent-Auth-Token": getAgentSLApiToken(),
  };
}

/**
 * 带 SSL 处理的 fetch 封装
 * Node.js 原生 fetch 不支持 rejectUnauthorized 选项，
 * 通过 undici dispatcher 实现。
 */
async function agentslFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  // 非生产环境：通过 NODE_TLS_REJECT_UNAUTHORIZED 环境变量控制
  // 用户需在运行前设置: export NODE_TLS_REJECT_UNAUTHORIZED=0
  if (isNonProd) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  return fetch(url, init);
}

// ---------- 类型定义 ----------

/** Job 执行状态枚举 */
export type JobStatus =
  | "pending"
  | "submitted"
  | "queued"
  | "running"
  | "cancelling"
  | "success"
  | "failed"
  | "timeout"
  | "cancelled";

/** 内联多模态数据（base64 编码的图片、文件等） */
export interface InlineData {
  /** MIME 类型，如 'image/jpeg', 'image/png', 'application/pdf', 'text/plain' */
  mime_type: string;
  /** base64 编码的二进制数据 */
  data: string;
}

/** 消息内容片段（文本或内联数据，二选一） */
export interface MessagePart {
  /** 文本内容 */
  text?: string | null;
  /** 内联多模态数据 */
  inline_data?: InlineData | null;
}

/** 用户消息 */
export interface AgentSLMessage {
  /** 消息角色（用户消息固定为 'user'） */
  role: "user";
  /** 消息内容片段列表 */
  parts: MessagePart[];
}

/** 文件输入元数据 */
export interface FileInputMetadata {
  /** 预签名 GET URL，用于从应用 S3 桶下载文件 */
  presigned_url: string;
  /** 文件的可读描述 */
  description: string;
  /** MIME 类型 */
  mime_type: string;
  /** 文件大小（字节） */
  file_size_bytes: number;
  /** 是否在会话中持久化该文件供后续 Job 使用，默认 true */
  persist_across_jobs?: boolean;
}

/** Job 元数据（工具凭据和输入文件） */
export interface JobMetadata {
  /** 工具凭据和配置，按工具名索引 */
  tool_metadata?: Record<string, unknown> | null;
  /** 输入文件元数据，按目标文件名索引 */
  file_metadata?: Record<string, FileInputMetadata> | null;
}

/** 创建 Job 的请求体 */
export interface JobCreate {
  /** 提交 Job 的用户 ID */
  user_id: string;
  /** 会话 ID（用于对话追踪） */
  session_id: string;
  /** 要执行的 Agent ID */
  agent_id: string;
  /** 用户消息 */
  message: AgentSLMessage;
  /** 可选的工具凭据和输入文件元数据 */
  metadata?: JobMetadata | null;
  /** 是否保留容器日志并发送遥测，默认 true */
  keep_logs?: boolean;
  /** 执行引擎，默认 'pods' */
  execution_engine?: "agentcore" | "pods" | null;
}

/** Job 输出文件信息 */
export interface JobFileInfo {
  /** 文件名 */
  filename: string;
  /** 文件的可读描述 */
  description: string;
  /** 预签名下载 URL（24 小时有效） */
  download_url: string;
  /** 下载 URL 过期时间（ISO 8601 SGT） */
  expires_at: string;
  /** S3 URI，格式 s3://bucket/object_key */
  s3_path: string;
  /** 是否在共享文件夹中持久化 */
  persist_across_jobs: boolean;
  /** 文件版本号（从 0 开始） */
  version: number;
  /** 文件来源：'tool' | 'user_upload' | 'agent_managed' */
  created_by: "tool" | "user_upload" | "agent_managed";
  /** MIME 类型 */
  mime_type?: string | null;
  /** 文件大小（字节） */
  file_size_bytes?: number | null;
  /** 创建时间（ISO 8601 SGT） */
  created_at?: string | null;
}

/** Job 输出文件分组 */
export interface JobFiles {
  /** LLM 筛选的子集：Agent 声明与用户请求直接相关的文件 */
  response_files: JobFileInfo[];
  /** 所有工具生成的文件（response_files 的超集） */
  tool_files: JobFileInfo[];
}

/** Job 执行结果 */
export interface JobResults {
  /** Agent 对用户消息的响应文本 */
  response?: string | null;
  /** 总执行时间（秒） */
  execution_time_seconds?: number | null;
  /** 执行失败时的错误消息 */
  error_message?: string | null;
  /** 开始执行时间（ISO 8601） */
  started_at?: string | null;
  /** 完成时间（ISO 8601） */
  completed_at?: string | null;
  /** 输出文件 */
  files?: JobFiles;
}

/** Job 响应（创建/查询 Job 的返回值） */
export interface JobResponse {
  /** 唯一 Job 标识符 */
  job_id: string;
  /** 提交 Job 的用户 ID */
  user_id: string;
  /** 会话 ID */
  session_id: string;
  /** Agent ID */
  agent_id: string;
  /** 当前 Job 状态 */
  job_status: JobStatus;
  /** 执行结果（仅在 success/failed 时存在） */
  job_results?: JobResults | null;
}

/** Job 列表摘要 */
export interface JobSummary {
  /** Job ID */
  job_id: string;
  /** Job 状态 */
  status: JobStatus;
  /** 创建时间（ISO 8601） */
  created_at: string;
  /** 会话 ID */
  session_id: string;
  /** 用户 ID */
  user_id: string;
}

/** Job 列表响应 */
export interface JobListResponse {
  /** Job 摘要列表 */
  jobs: JobSummary[];
  /** 匹配查询的 Job 总数 */
  total: number;
  /** 返回的最大 Job 数量 */
  limit: number;
  /** 结果偏移量 */
  offset: number;
}

/** Job 取消响应 */
export interface JobCancelResponse {
  /** 取消确认消息（含 job_id） */
  message: string;
}

/** 容器日志输出 */
export interface ContainerLogOutput {
  /** 实际输出内容 */
  content: string;
  /** 是否有任何输出内容 */
  has_output: boolean;
}

/** 结构化容器日志 */
export interface StructuredContainerLogs {
  /** 是否有任何输出（stdout 或 stderr） */
  has_any_output: boolean;
  /** 标准输出信息 */
  stdout: ContainerLogOutput;
  /** 标准错误信息 */
  stderr: ContainerLogOutput;
}

/** Job 日志响应 */
export interface JobLogsResponse {
  /** 结构化容器日志 */
  logs: StructuredContainerLogs;
}

/** 健康检查响应 */
export interface HealthCheckResponse {
  [key: string]: unknown;
}

// ---------- 基础 API 方法 ----------

/**
 * 创建新的 Agent 执行 Job
 *
 * POST /run/
 */
export async function createJob(job: JobCreate): Promise<JobResponse> {
  const resp = await agentslFetch(`${AGENTSL_BASE}/run/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(job),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AgentSL createJob failed (${resp.status}): ${errText}`);
  }

  return resp.json() as Promise<JobResponse>;
}

/**
 * 查询 Job 状态和结果
 *
 * GET /run/{job_id}
 */
export async function getJob(jobId: string): Promise<JobResponse> {
  const resp = await agentslFetch(
    `${AGENTSL_BASE}/run/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      headers: authHeaders(),
    },
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AgentSL getJob failed (${resp.status}): ${errText}`);
  }

  return resp.json() as Promise<JobResponse>;
}

/**
 * 列出当前 Agent 的 Job
 *
 * GET /run/jobs
 */
export async function listJobs(options?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<JobListResponse> {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  if (options?.offset !== undefined)
    params.set("offset", String(options.offset));

  const url = `${AGENTSL_BASE}/run/jobs${params.toString() ? "?" + params.toString() : ""}`;

  const resp = await agentslFetch(url, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AgentSL listJobs failed (${resp.status}): ${errText}`);
  }

  return resp.json() as Promise<JobListResponse>;
}

/**
 * 取消 Job
 *
 * DELETE /run/{job_id}
 */
export async function cancelJob(jobId: string): Promise<JobCancelResponse> {
  const resp = await agentslFetch(
    `${AGENTSL_BASE}/run/${encodeURIComponent(jobId)}`,
    {
      method: "DELETE",
      headers: authHeaders(),
    },
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AgentSL cancelJob failed (${resp.status}): ${errText}`);
  }

  return resp.json() as Promise<JobCancelResponse>;
}

/**
 * 获取 Job 日志
 *
 * GET /run/logs/{job_id}
 */
export async function getJobLogs(jobId: string): Promise<JobLogsResponse> {
  const resp = await agentslFetch(
    `${AGENTSL_BASE}/run/logs/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      headers: authHeaders(),
    },
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AgentSL getJobLogs failed (${resp.status}): ${errText}`);
  }

  return resp.json() as Promise<JobLogsResponse>;
}

/**
 * 实时流式监听 Job 事件（SSE）
 *
 * GET /run/stream/{job_id}
 *
 * 返回 ReadableStream，可以用 SSE 方式消费。
 * 注意：需要在 Job 创建后尽快调用，以捕获完整的事件流。
 */
export async function streamJobEvents(
  jobId: string,
): Promise<ReadableStream<Uint8Array>> {
  const resp = await agentslFetch(
    `${AGENTSL_BASE}/run/stream/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      headers: {
        "X-Agent-Auth-Token": getAgentSLApiToken(),
        Accept: "text/event-stream",
      },
    },
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(
      `AgentSL streamJobEvents failed (${resp.status}): ${errText}`,
    );
  }

  if (!resp.body) {
    throw new Error("AgentSL streamJobEvents: response body is null");
  }

  return resp.body;
}

/**
 * 健康检查
 *
 * GET /health_check
 */
export async function healthCheck(): Promise<HealthCheckResponse> {
  const resp = await agentslFetch(`${AGENTSL_BASE}/health_check`, {
    method: "GET",
  });

  if (!resp.ok) {
    throw new Error(`AgentSL healthCheck failed (${resp.status})`);
  }

  return resp.json() as Promise<HealthCheckResponse>;
}

// ---------- 辅助方法 ----------

/** 终端状态集合 */
const TERMINAL_STATUSES: Set<JobStatus> = new Set([
  "success",
  "failed",
  "timeout",
  "cancelled",
]);

/**
 * 判断 Job 是否已结束
 */
export function isJobTerminal(status: JobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * 轮询 Job 直到完成（或超时）
 *
 * @param jobId - Job ID
 * @param options - 轮询选项
 * @returns 最终的 JobResponse
 */
export async function pollJobUntilComplete(
  jobId: string,
  options?: {
    /** 轮询间隔（毫秒），默认 2000 */
    intervalMs?: number;
    /** 最大等待时间（毫秒），默认 300000（5 分钟） */
    timeoutMs?: number;
    /** 进度回调，每次轮询后调用 */
    onProgress?: (job: JobResponse) => void;
  },
): Promise<JobResponse> {
  const intervalMs = options?.intervalMs ?? 2000;
  const timeoutMs = options?.timeoutMs ?? 300_000;
  const startTime = Date.now();

  while (true) {
    const job = await getJob(jobId);

    options?.onProgress?.(job);

    if (isJobTerminal(job.job_status)) {
      return job;
    }

    if (Date.now() - startTime > timeoutMs) {
      throw new Error(
        `AgentSL pollJobUntilComplete timeout after ${timeoutMs}ms (job_id: ${jobId}, status: ${job.job_status})`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * 便捷方法：创建 Job 并轮询等待完成
 *
 * 适用于不需要流式输出的场景，一次性提交并等待结果。
 */
export async function runJobSync(job: JobCreate): Promise<JobResponse> {
  const created = await createJob(job);
  return pollJobUntilComplete(created.job_id);
}

/**
 * 便捷方法：从纯文本消息创建 Job 并提交
 */
export async function sendMessage(options: {
  userId: string;
  sessionId: string;
  agentId: string;
  text: string;
  metadata?: JobMetadata | null;
}): Promise<JobResponse> {
  return createJob({
    user_id: options.userId,
    session_id: options.sessionId,
    agent_id: options.agentId,
    message: {
      role: "user",
      parts: [{ text: options.text }],
    },
    metadata: options.metadata,
  });
}

// ---------- SSE 流转换适配器 ----------

/**
 * AgentSL SSE 事件（原始格式）
 */
interface AgentSLStreamEvent {
  job_id: string;
  event_type:
    | "stream:ready"
    | "agent_entering"
    | "agent_exiting"
    | "response_start"
    | "response_streaming"
    | "response_end"
    | "job:completed"
    | "stream:closed";
  timestamp?: string;
  content?: string;
  status?: JobStatus;
  message?: string;
  [key: string]: unknown;
}

/**
 * 前端 SSE 事件格式
 */
export type ChatSSEEvent =
  | { type: "content"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "done" }
  | { type: "error"; content: string }
  | { type: "status"; status: string; message?: string };

/**
 * SSE 响应头
 */
export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

/**
 * 创建 AgentSL → 前端格式的 SSE 流转换器
 *
 * 从 AgentSL 的 /run/stream/{job_id} SSE 流读取原始事件，
 * 转换为前端期望的 `ChatSSEEvent` 格式。
 */
export function createAgentSLSSEStream(
  jobId: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      let agentSLStream: ReadableStream<Uint8Array> | null = null;

      try {
        agentSLStream = await streamJobEvents(jobId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", content: msg })}\n\n`,
          ),
        );
        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
        controller.close();
        return;
      }

      const reader = agentSLStream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      function enqueueSSE(event: ChatSSEEvent) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // 流意外结束，发送 done
            enqueueSSE({ type: "done" });
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;

            const jsonStr = trimmed.slice(5).trim();
            try {
              const event: AgentSLStreamEvent = JSON.parse(jsonStr);

              switch (event.event_type) {
                case "response_streaming":
                  // 流式内容块 → content 事件
                  if (event.content) {
                    enqueueSSE({ type: "content", content: event.content });
                  }
                  break;

                case "job:completed":
                  if (event.status === "success") {
                    enqueueSSE({
                      type: "status",
                      status: "success",
                      message: "Job completed",
                    });
                    enqueueSSE({ type: "done" });
                  } else if (
                    event.status === "failed" ||
                    event.status === "timeout"
                  ) {
                    // 尝试获取详细错误信息
                    let errorMsg = event.message ?? `Job ${event.status}`;
                    try {
                      const jobDetails = await getJob(event.job_id);
                      if (jobDetails.job_results?.error_message) {
                        errorMsg = jobDetails.job_results.error_message;
                      }
                    } catch {
                      // 获取详情失败，使用事件中的 message
                    }
                    enqueueSSE({
                      type: "error",
                      content: errorMsg,
                    });
                    enqueueSSE({ type: "done" });
                  }
                  break;

                case "agent_entering":
                  enqueueSSE({
                    type: "status",
                    status: "agent_entering",
                    message: "Agent started",
                  });
                  break;

                case "response_start":
                  enqueueSSE({
                    type: "status",
                    status: "response_start",
                    message: "Generating response",
                  });
                  break;

                case "stream:closed":
                  // Steam 正常关闭，如果之前没有 done 则补发
                  break;

                // stream:ready, agent_exiting, response_end 等忽略
                default:
                  break;
              }
            } catch {
              // JSON 解析失败，跳过该行
            }
          }
        }
      } catch {
        enqueueSSE({
          type: "error",
          content: "AgentSL 流响应中断",
        });
        enqueueSSE({ type: "done" });
        controller.close();
      }
    },
  });
}

/**
 * 创建带终止保护的 SSE 响应
 *
 * 当客户端断开连接时自动取消 AgentSL Job。
 */
export function createAgentSLSSEResponse(
  jobId: string,
  abortSignal?: AbortSignal | null,
): Response {
  const stream = createAgentSLSSEStream(jobId);

  // 如果提供了 abort signal，在客户端断开时取消 Job
  if (abortSignal) {
    abortSignal.addEventListener("abort", () => {
      cancelJob(jobId).catch((err) =>
        console.warn(`[AgentSL] 取消 Job ${jobId} 失败:`, err),
      );
    });
  }

  return new Response(stream, { headers: SSE_HEADERS });
}

/**
 * 将通用聊天消息转换为 AgentSL 消息格式
 *
 * 仅提取最后一条 user 消息的纯文本内容。
 * AgentSL 通过 session_id 维护对话历史，无需发送完整消息链。
 *
 * 重要：AgentSL Agent 有自己的系统指令，不要在消息中附加 system prompt，
 * 否则会被视为 prompt injection 并拒绝请求。
 */
export function toAgentSLMessage(
  messages: Array<{ role: string; content: string }>,
): { text: string; systemContext?: string } {
  // 提取 system 消息（仅用于日志/调试，不发送给 AgentSL）
  const systemMessages = messages.filter((m) => m.role === "system");
  const systemContext =
    systemMessages.length > 0
      ? systemMessages.map((m) => m.content).join("\n\n")
      : undefined;

  // 只取最后一条 user 消息的纯文本，不附加任何 system 内容
  const userMessages = messages.filter((m) => m.role === "user");
  const lastUserMsg = userMessages.at(-1);
  const text = lastUserMsg?.content ?? "";

  return { text, systemContext };
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { POST as queryAnalysisPost } from "../src/app/api/chat/analysis/query/route";
import {
  buildAnalysisAttachmentContent,
  summarizeProfile,
} from "../src/lib/client-analysis/csv-analysis-prompts";
import { executeDataQuery } from "../src/lib/client-analysis/csv-plan-executor";
import {
  compactPreviousResultsForQuery,
  compactProfileForQuery,
} from "../src/lib/client-analysis/csv-query-payload";
import {
  createCsvProfile,
  decodeCsvText,
  parseCsv,
} from "../src/lib/client-analysis/csv-profiler";
import {
  MAX_QUERY_ITERATIONS,
  type CsvDataQuery,
  type CsvDataQueryResult,
  type CsvProfile,
  type CsvProfileSummary,
  type CsvRow,
} from "../src/lib/client-analysis/csv-types";

type StepStatus = "ok" | "error";

type LogStep = {
  name: string;
  status: StepStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  request?: unknown;
  response?: unknown;
  error?: string;
  metrics?: Record<string, unknown>;
};

type QueryDecision =
  | { type: "queries"; queries: CsvDataQuery[]; rationale?: string }
  | { type: "final"; finalAnswer: string };

type RunLog = {
  metadata: {
    script: string;
    targetFile: string;
    question: string;
    domain: "campaign" | "general";
    enableThinking: boolean;
    maxIterations: number;
    startedAt: string;
    endedAt?: string;
    logFile: string;
    reportFile: string;
  };
  steps: LogStep[];
  final?: {
    ok: boolean;
    summary: string;
    queryResultCount: number;
    optimizationFindings: OptimizationFinding[];
  };
};

type OptimizationFinding = {
  title: string;
  evidence: string;
  recommendation: string;
};

type LoadedCsv = {
  fileName: string;
  fileSize: number;
  rows: CsvRow[];
  profile: CsvProfile;
  profileSummary: CsvProfileSummary;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultTargetFile = path.resolve(
  projectRoot,
  "data/line avail +bar chart LF_Dep Sep26.csv",
);
const defaultQuestion =
  "请基于这个 CSV 做一次大文件本地分析全流程测试：识别字段与数据质量，并重点分析 Sep26 各 origin destination、travel_solution_path、booking_class 的舱位可用性、O&D max load factor 与 booking class availability，找出低可用或高 LF 的机会点，给出可执行建议。";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const targetFile = path.resolve(projectRoot, options.file ?? defaultTargetFile);
  const question = options.question ?? defaultQuestion;
  const domain = options.domain ?? "campaign";
  const enableThinking = options.enableThinking ?? false;
  const maxIterations = options.maxIterations ?? MAX_QUERY_ITERATIONS;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logDir = path.resolve(projectRoot, "logs");
  const logFile = path.join(logDir, `chat-large-csv-flow-${timestamp}.json`);
  const reportFile = path.join(logDir, `chat-large-csv-flow-${timestamp}.md`);
  const log: RunLog = {
    metadata: {
      script: path.relative(projectRoot, fileURLToPath(import.meta.url)),
      targetFile: path.relative(projectRoot, targetFile),
      question,
      domain,
      enableThinking,
      maxIterations,
      startedAt: new Date().toISOString(),
      logFile: path.relative(projectRoot, logFile),
      reportFile: path.relative(projectRoot, reportFile),
    },
    steps: [],
  };

  await mkdir(logDir, { recursive: true });

  const logger = new FlowLogger(log, logFile);

  await logger.run("load-local-env", {
    request: { envPath: path.relative(projectRoot, path.join(projectRoot, ".env.local")) },
    action: async () => {
      const loadedKeys = await loadLocalEnv();
      return { loadedKeys };
    },
  });

  const loadedCsv = await logger.run("load-and-profile-csv", {
    request: { file: path.relative(projectRoot, targetFile) },
    action: async () => loadCsv(targetFile),
    responseForLog: (csv) => ({
      fileName: csv.fileName,
      fileSize: csv.fileSize,
      rowCount: csv.profile.rowCount,
      columnCount: csv.profile.columnCount,
      parseMetadata: csv.profile.dataQuality.parseMetadata,
      warnings: csv.profile.dataQuality.warnings,
      columns: csv.profile.columns,
      sampleRows: csv.profile.sampleRows.slice(0, 3),
    }),
  });

  const queryResults: CsvDataQueryResult[] = [];
  const recoveryNotes: string[] = [];
  const executedQueryKeys = new Set<string>();
  let summary = "";

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const roundNumber = iteration + 1;
    const decision = await requestDataQueries({
      logger,
      stepName: `round-${roundNumber}-model-decision`,
      question,
      profile: loadedCsv.profile,
      previousResults: queryResults,
      domain,
      enableThinking,
      recoveryNotes,
      forceFinal: false,
    });

    if (decision.type === "final") {
      summary = appendRecoveryNotes(decision.finalAnswer, recoveryNotes);
      break;
    }

    if (decision.queries.length === 0) {
      recoveryNotes.push("模型没有返回可执行查询，提前进入总结阶段。");
      break;
    }

    const candidates = buildExecutableQueryCandidates(
      decision.queries,
      executedQueryKeys,
    );

    if (candidates.length === 0) {
      recoveryNotes.push("本轮模型请求的查询都已执行过，提前进入总结阶段。");
      await logger.run(`round-${roundNumber}-skipped-local-query`, {
        request: { queries: decision.queries },
        action: async () => ({
          skipped: decision.queries.length,
          reason: "all queries were already executed",
        }),
      });
      break;
    }

    let successfulQueries = 0;

    for (const [queryIndex, query] of candidates.entries()) {
      const queryKey = getCsvDataQueryKey(query);
      const result = await logger.run(
        `round-${roundNumber}-local-query-${queryIndex + 1}`,
        {
          request: {
            query,
            description: describeCsvDataQuery(query),
          },
          action: async () =>
            executeDataQuery(loadedCsv.rows, query, loadedCsv.profile.dataQuality),
          responseForLog: compactQueryResultForLog,
        },
      );
      executedQueryKeys.add(queryKey);
      queryResults.push(result);
      successfulQueries += 1;
    }

    if (successfulQueries === 0) {
      recoveryNotes.push("本轮没有成功执行任何本地查询，提前进入总结阶段。");
      break;
    }
  }

  if (!summary) {
    const finalDecision = await requestDataQueries({
      logger,
      stepName: "final-answer-model-decision",
      question,
      profile: loadedCsv.profile,
      previousResults: queryResults,
      domain,
      enableThinking,
      recoveryNotes,
      forceFinal: true,
    });

    summary =
      finalDecision.type === "final"
        ? appendRecoveryNotes(finalDecision.finalAnswer, recoveryNotes)
        : buildLocalFallbackSummary({
            queryResults,
            recoveryNotes: [
              ...recoveryNotes,
              "最终请求没有返回可用总结，已使用本地聚合结果生成简要结论。",
            ],
          });
  }

  const content = buildFinalAttachmentContent({
    profileSummary: loadedCsv.profileSummary,
    queryResults,
    summary,
  });

  await logger.run("build-final-analysis-artifact", {
    request: {
      queryResultCount: queryResults.length,
      summaryLength: summary.length,
    },
    action: async () => ({
      content,
      summary,
    }),
    responseForLog: (artifact) => ({
      summary: artifact.summary,
      contentPreview: artifact.content.slice(0, 4000),
    }),
  });

  const optimizationFindings = analyzeFlowLog(log);
  log.metadata.endedAt = new Date().toISOString();
  log.final = {
    ok: log.steps.every((step) => step.status === "ok") && Boolean(summary),
    summary,
    queryResultCount: queryResults.length,
    optimizationFindings,
  };

  await writeRunLog(logFile, log);
  await writeFile(reportFile, buildMarkdownReport(log), "utf8");

  console.log(`Log: ${path.relative(projectRoot, logFile)}`);
  console.log(`Report: ${path.relative(projectRoot, reportFile)}`);
  console.log(`Steps: ${log.steps.length}`);
  console.log(`Query results: ${queryResults.length}`);
  console.log(`OK: ${log.final.ok ? "yes" : "no"}`);
  console.log("\nFinal summary:\n");
  console.log(summary);
  console.log("\nOptimization findings:\n");
  for (const finding of optimizationFindings) {
    console.log(`- ${finding.title}: ${finding.recommendation}`);
  }

  if (!log.final.ok) {
    process.exitCode = 1;
  }
}

class FlowLogger {
  constructor(
    private readonly log: RunLog,
    private readonly logFile: string,
  ) {}

  async run<T>(
    name: string,
    args: {
      request?: unknown;
      action: () => Promise<T>;
      responseForLog?: (value: T) => unknown;
      metrics?: (value: T) => Record<string, unknown>;
    },
  ): Promise<T> {
    const startedAt = new Date();
    const start = performance.now();
    try {
      const value = await args.action();
      const endedAt = new Date();
      const step: LogStep = {
        name,
        status: "ok",
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: roundMs(performance.now() - start),
        request: args.request,
        response: args.responseForLog ? args.responseForLog(value) : value,
        metrics: args.metrics?.(value),
      };
      this.log.steps.push(addPayloadMetrics(step));
      await writeRunLog(this.logFile, this.log);
      return value;
    } catch (error) {
      const endedAt = new Date();
      const step: LogStep = {
        name,
        status: "error",
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: roundMs(performance.now() - start),
        request: args.request,
        error: formatErrorMessage(error),
      };
      this.log.steps.push(addPayloadMetrics(step));
      await writeRunLog(this.logFile, this.log);
      throw error;
    }
  }
}

async function requestDataQueries(args: {
  logger: FlowLogger;
  stepName: string;
  question: string;
  profile: CsvProfile;
  previousResults: CsvDataQueryResult[];
  domain: "campaign" | "general";
  enableThinking: boolean;
  recoveryNotes: string[];
  forceFinal: boolean;
}): Promise<QueryDecision> {
  const body = {
    question: args.question,
    profile: compactProfileForQuery(args.profile),
    previousResults: compactPreviousResultsForQuery(args.previousResults),
    domain: args.domain,
    enable_thinking: args.enableThinking,
    force_final: args.forceFinal,
  };

  const routeResponse = await args.logger.run(args.stepName, {
    request: {
      route: "POST /api/chat/analysis/query",
      body,
    },
    action: async () => {
      const response = await queryAnalysisPost(
        new Request("http://localhost/api/chat/analysis/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      const text = await response.text();
      return {
        status: response.status,
        ok: response.ok,
        body: safeJsonParse(text) ?? text,
      };
    },
    responseForLog: (response) => response,
  });

  if (!routeResponse.ok || !isRecord(routeResponse.body)) {
    throw new Error(
      `Query route failed: status=${routeResponse.status}, body=${JSON.stringify(routeResponse.body)}`,
    );
  }

  if (routeResponse.body.ok !== true) {
    throw new Error(String(routeResponse.body.error ?? "CSV query route failed"));
  }

  if (typeof routeResponse.body.finalAnswer === "string") {
    return {
      type: "final",
      finalAnswer: routeResponse.body.finalAnswer.trim(),
    };
  }

  return {
    type: "queries",
    queries: Array.isArray(routeResponse.body.queries)
      ? (routeResponse.body.queries as CsvDataQuery[])
      : [],
    rationale:
      typeof routeResponse.body.rationale === "string"
        ? routeResponse.body.rationale
        : undefined,
  };
}

async function loadCsv(targetFile: string): Promise<LoadedCsv> {
  const buffer = await readFile(targetFile);
  const decoded = decodeCsvText(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
  );
  const parsed = parseCsv(decoded.text, decoded.encoding);
  const profile = createCsvProfile(
    { name: path.basename(targetFile), size: buffer.byteLength },
    parsed,
  );

  return {
    fileName: path.basename(targetFile),
    fileSize: buffer.byteLength,
    rows: parsed.rows,
    profile,
    profileSummary: summarizeProfile(profile),
  };
}

async function loadLocalEnv() {
  const envPath = path.join(projectRoot, ".env.local");
  const content = await readFile(envPath, "utf8").catch(() => "");
  const loadedKeys: string[] = [];

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
      loadedKeys.push(key);
    }
  }

  return loadedKeys;
}

function unquoteEnvValue(value: string) {
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.at(-1) === quote) {
    return value.slice(1, -1);
  }

  return value;
}

function buildExecutableQueryCandidates(
  queries: CsvDataQuery[],
  executedQueryKeys: Set<string>,
) {
  const seen = new Set<string>();
  const uniqueQueries = queries.filter((query) => {
    const key = getCsvDataQueryKey(query);
    if (seen.has(key) || executedQueryKeys.has(key)) {
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

function buildFinalAttachmentContent(args: {
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

function buildLocalFallbackSummary(args: {
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

function compactQueryResultForLog(result: CsvDataQueryResult) {
  return {
    query: result.query,
    rowCount: result.rowCount,
    matchedRowCount: result.matchedRowCount,
    rows: result.rows?.slice(0, 20),
    values: result.values?.slice(0, 50),
    stats: result.stats,
    aggregateResult: result.aggregateResult
      ? {
          plan: result.aggregateResult.plan,
          rowCount: result.aggregateResult.rowCount,
          matchedRowCount: result.aggregateResult.matchedRowCount,
          totalGroupCount: result.aggregateResult.totalGroupCount,
          resultRows: result.aggregateResult.resultRows.slice(0, 50),
          warnings: result.aggregateResult.warnings,
        }
      : undefined,
    warnings: result.warnings,
  };
}

function analyzeFlowLog(log: RunLog): OptimizationFinding[] {
  const findings: OptimizationFinding[] = [];
  const steps = log.steps;
  const modelSteps = steps.filter((step) => step.name.includes("model-decision"));
  const localQuerySteps = steps.filter((step) => step.name.includes("local-query"));
  const profileStep = steps.find((step) => step.name === "load-and-profile-csv");
  const slowest = [...steps].sort((left, right) => right.durationMs - left.durationMs)[0];
  const totalDuration = steps.reduce((sum, step) => sum + step.durationMs, 0);
  const modelDuration = modelSteps.reduce((sum, step) => sum + step.durationMs, 0);
  const repeatedQueries = findRepeatedLocalQueries(localQuerySteps);
  const fallbackQueryCount = localQuerySteps.filter((step) =>
    JSON.stringify(step.request).includes("local_fallback_count_by_group"),
  ).length;
  const utf16Tsv = JSON.stringify(profileStep?.response ?? "").includes("utf-16le")
    && JSON.stringify(profileStep?.response ?? "").includes("Tab/TSV");

  if (slowest) {
    findings.push({
      title: "先处理耗时最高的步骤",
      evidence: `${slowest.name} 用时 ${slowest.durationMs} ms；全流程记录步骤耗时合计约 ${roundMs(totalDuration)} ms。`,
      recommendation:
        slowest.name.includes("model-decision")
          ? "模型决策是主要瓶颈，优先让每轮尤其首轮批量请求更完整的互补查询，并压缩不必要的 prompt，而不是提前限制模型继续取证。"
          : "本地计算或解析是主要瓶颈，优先优化 CSV 解析、字段画像和聚合执行路径。",
    });
  }

  if (modelSteps.length > 1) {
    findings.push({
      title: "模型决策轮次偏多",
      evidence: `共调用 ${modelSteps.length} 次 /api/chat/analysis/query，模型步骤耗时合计 ${roundMs(modelDuration)} ms。`,
      recommendation:
        "在 query prompt 中鼓励首轮批量请求覆盖关键维度/指标的互补查询；如果结果仍截断或缺少问题关键字段，应继续查询而不是提前 finalAnswer。",
    });
  }

  if (fallbackQueryCount > 1) {
    findings.push({
      title: "后备聚合查询重复执行",
      evidence: `检测到 ${fallbackQueryCount} 次 local_fallback_count_by_group。当前流程每轮都会追加同一个本地 fallback，跨轮没有去重。`,
      recommendation:
        "为本地查询增加跨轮 query signature 去重，或只在模型查询为空/失败时执行 fallback，避免重复扫描全量 rows。",
    });
  }

  if (repeatedQueries.length > 0) {
    findings.push({
      title: "存在重复本地查询",
      evidence: `重复 query signature 数量 ${repeatedQueries.length}；最高重复 ${Math.max(...repeatedQueries.map((item) => item.count))} 次。`,
      recommendation:
        "缓存 executeDataQuery 的结果，按 JSON.stringify(query) 命中直接复用；同时不要把重复结果反复塞回 previousResults。",
    });
  }

  if (utf16Tsv) {
    findings.push({
      title: "文件是 UTF-16LE TSV，解析成本高于普通 UTF-8 CSV",
      evidence:
        "profile 显示编码 utf-16le、分隔符 Tab/TSV；脚本和浏览器流程都会先完整解码并物化 rows。",
      recommendation:
        "对 UTF-16/TSV 增加流式解码和分块 profile；对只做聚合的查询可二次流式扫描，减少一次性 rows 对象内存峰值。",
    });
  }

  if (localQuerySteps.length > 2) {
    findings.push({
      title: "本地查询串行执行",
      evidence: `共执行 ${localQuerySteps.length} 个本地查询，当前测试按生产流程逐个执行。`,
      recommendation:
        "对 distinctValues、columnStats、多个 aggregate 这类互不依赖的查询，可在 Worker 内合并为一次扫描，比分别多次 executeDataQuery 更省 CPU。",
    });
  }

  if (findings.length === 0) {
    findings.push({
      title: "全流程没有明显异常",
      evidence: "所有记录步骤均成功，且没有检测到重复查询或高轮次模型调用。",
      recommendation:
        "保留当前日志脚本作为回归用例，并把关键耗时阈值接入 CI 或本地 smoke test。",
    });
  }

  return findings;
}

function findRepeatedLocalQueries(localQuerySteps: LogStep[]) {
  const counts = new Map<string, number>();
  for (const step of localQuerySteps) {
    const query = isRecord(step.request) ? step.request.query : undefined;
    const key = JSON.stringify(query);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([signature, count]) => ({ signature, count }));
}

function buildMarkdownReport(log: RunLog) {
  const final = log.final;
  const lines = [
    "# Chat Large CSV Flow Test Report",
    "",
    `- Target file: ${log.metadata.targetFile}`,
    `- Question: ${log.metadata.question}`,
    `- OK: ${final?.ok ? "yes" : "no"}`,
    `- Steps: ${log.steps.length}`,
    `- Query results: ${final?.queryResultCount ?? 0}`,
    `- JSON log: ${log.metadata.logFile}`,
    "",
    "## Step Timings",
    "",
    "| Step | Status | Duration ms | Request bytes | Response bytes |",
    "|---|---:|---:|---:|---:|",
    ...log.steps.map((step) => {
      const requestBytes =
        typeof step.metrics?.requestBytes === "number"
          ? step.metrics.requestBytes
          : "";
      const responseBytes =
        typeof step.metrics?.responseBytes === "number"
          ? step.metrics.responseBytes
          : "";
      return `| ${step.name} | ${step.status} | ${step.durationMs} | ${requestBytes} | ${responseBytes} |`;
    }),
    "",
    "## Final Summary",
    "",
    final?.summary || "No final summary.",
    "",
    "## Optimization Findings",
    "",
    ...(final?.optimizationFindings ?? []).flatMap((finding, index) => [
      `${index + 1}. ${finding.title}`,
      `   Evidence: ${finding.evidence}`,
      `   Recommendation: ${finding.recommendation}`,
    ]),
    "",
  ];

  return lines.join("\n");
}

async function writeRunLog(logFile: string, log: RunLog) {
  await writeFile(logFile, `${JSON.stringify(log, null, 2)}\n`, "utf8");
}

function addPayloadMetrics(step: LogStep): LogStep {
  return {
    ...step,
    metrics: {
      ...step.metrics,
      requestBytes: jsonByteLength(step.request),
      responseBytes: jsonByteLength(step.response),
    },
  };
}

function jsonByteLength(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function parseArgs(args: string[]) {
  const options: {
    file?: string;
    question?: string;
    domain?: "campaign" | "general";
    enableThinking?: boolean;
    maxIterations?: number;
  } = {};

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--file" && next) {
      options.file = next;
      index += 1;
    } else if (arg === "--question" && next) {
      options.question = next;
      index += 1;
    } else if (arg === "--domain" && (next === "campaign" || next === "general")) {
      options.domain = next;
      index += 1;
    } else if (arg === "--thinking") {
      options.enableThinking = true;
    } else if (arg === "--max-iterations" && next) {
      const value = Number(next);
      if (Number.isFinite(value) && value > 0) {
        options.maxIterations = Math.floor(value);
      }
      index += 1;
    }
  }

  return options;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

"use client";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { JsonValue } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { executeQueryInWorker } from "@/lib/client-analysis/csv-worker-client";
import { validateAnalysisPlan } from "@/lib/client-analysis/csv-plan-validator";
import type { CsvDataQuery } from "@/lib/client-analysis/csv-types";
import { runAnalysisScript } from "./script-worker-client";
import type { PiCsvContext } from "./types";

const scalarSchema = Type.Union([Type.String(), Type.Number()]);
const filterValueSchema = Type.Union([
  scalarSchema,
  Type.Tuple([scalarSchema, scalarSchema]),
]);
const filterSchema = Type.Object(
  {
    field: Type.String(),
    op: Type.Union([
      Type.Literal("eq"),
      Type.Literal("contains"),
      Type.Literal("between"),
      Type.Literal("gte"),
      Type.Literal("lte"),
      Type.Literal("notEmpty"),
    ]),
    value: Type.Optional(filterValueSchema),
  },
  { additionalProperties: false },
);
const metricSchema = Type.Object(
  {
    name: Type.String(),
    field: Type.String(),
    agg: Type.Union([
      Type.Literal("sum"),
      Type.Literal("avg"),
      Type.Literal("min"),
      Type.Literal("max"),
      Type.Literal("count"),
    ]),
  },
  { additionalProperties: false },
);
const analysisPlanSchema = Type.Object(
  {
    goal: Type.String(),
    requiredFields: Type.Array(Type.String()),
    filters: Type.Array(filterSchema),
    groupBy: Type.Array(Type.String()),
    metrics: Type.Array(metricSchema),
    ranking: Type.Optional(
      Type.Object(
        {
          sortBy: Type.String(),
          direction: Type.Union([Type.Literal("asc"), Type.Literal("desc")]),
          limit: Type.Number(),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
const csvQuerySchema = Type.Union([
  Type.Object(
    {
      type: Type.Literal("rows"),
      rowNumbers: Type.Optional(Type.Array(Type.Number())),
      startRow: Type.Optional(Type.Number()),
      limit: Type.Optional(Type.Number()),
      columns: Type.Optional(Type.Array(Type.String())),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("columns"),
      columns: Type.Array(Type.String()),
      startRow: Type.Optional(Type.Number()),
      limit: Type.Optional(Type.Number()),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("filterRows"),
      filters: Type.Array(filterSchema),
      columns: Type.Optional(Type.Array(Type.String())),
      limit: Type.Optional(Type.Number()),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("distinctValues"),
      column: Type.String(),
      limit: Type.Optional(Type.Number()),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("columnStats"),
      column: Type.String(),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("aggregate"),
      plan: analysisPlanSchema,
    },
    { additionalProperties: false },
  ),
]);

type PiAgentTool =
  | ReturnType<typeof createWebSearchTool>
  | ReturnType<typeof createLargeFileTool>
  | ReturnType<typeof createScriptTool>;

export function createPiAgentTools(args: {
  csvContexts: PiCsvContext[];
  scriptResults: JsonValue[];
}): AgentTool[] {
  const tools: PiAgentTool[] = [
    createWebSearchTool(),
    createScriptTool(args.scriptResults),
  ];
  if (args.csvContexts.length > 0) {
    tools.push(createLargeFileTool(args.csvContexts));
  }
  return tools as unknown as AgentTool[];
}

function createWebSearchTool() {
  const parameters = Type.Object(
    {
      query: Type.String({ description: "A precise search query" }),
      topic: Type.Optional(
        Type.Union([Type.Literal("general"), Type.Literal("news")]),
      ),
      timeRange: Type.Optional(
        Type.Union([
          Type.Literal("day"),
          Type.Literal("week"),
          Type.Literal("month"),
          Type.Literal("year"),
        ]),
      ),
    },
    { additionalProperties: false },
  );

  return {
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web for current facts, news, events, policies, schedules, or claims that require source verification. Results include URLs and credibility notes.",
    parameters,
    async execute(_toolCallId, params, signal) {
      const response = await fetch("/api/pi-agent/tools/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal,
      });
      const data = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(readApiError(data, "Web search failed"));
      }
      return {
        content: [{ type: "text", text: stringifyToolResult(data) }],
        details: { query: params.query },
      };
    },
  } satisfies AgentTool<typeof parameters>;
}

function createLargeFileTool(csvContexts: PiCsvContext[]) {
  const parameters = Type.Object(
    {
      fileId: Type.String({ description: "File id from the attached-file catalog" }),
      query: csvQuerySchema,
    },
    { additionalProperties: false },
  );

  return {
    name: "query_large_file",
    label: "Query Large File",
    description:
      "Read bounded rows or columns, filter rows, inspect distinct values or statistics, or aggregate an attached CSV. The raw file remains in the browser. Prefer aggregate/statistics over row reads.",
    parameters,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal) {
      const context = csvContexts.find((item) => item.id === params.fileId);
      if (!context) {
        throw new Error(`Unknown file id: ${params.fileId}`);
      }

      let query = params.query as CsvDataQuery;
      let validationWarnings: string[] = [];
      if (query.type === "aggregate") {
        const validation = validateAnalysisPlan(query.plan, context.profile);
        query = { ...query, plan: validation.plan };
        validationWarnings = validation.warnings;
      }

      const result = await executeQueryInWorker(context.id, query, signal);
      result.warnings = [...validationWarnings, ...result.warnings];
      context.queryResults = [...(context.queryResults ?? []), result];

      return {
        content: [{ type: "text", text: stringifyToolResult(result) }],
        details: {
          fileId: context.id,
          fileName: context.name,
          queryType: query.type,
        },
      };
    },
  } satisfies AgentTool<typeof parameters>;
}

function createScriptTool(scriptResults: JsonValue[]) {
  const parameters = Type.Object(
    {
      code: Type.String({
        description:
          "JavaScript function body. The JSON value is available as `input`; return a JSON-serializable result.",
      }),
      input: Type.Optional(
        Type.Unknown({
          description:
            "JSON input, usually copied from a prior file query or search result",
        }),
      ),
    },
    { additionalProperties: false },
  );

  return {
    name: "run_analysis_script",
    label: "Run Analysis Script",
    description:
      "Generate and run isolated JavaScript for calculations that are awkward to express with the file query tool. No browser, network, filesystem, Node.js, or host APIs are available. The script must return JSON.",
    parameters,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal) {
      const input = toJsonValue(params.input);
      const result = await runAnalysisScript(params.code, input, signal);
      scriptResults.push(result);
      return {
        content: [{ type: "text", text: stringifyToolResult(result) }],
        details: { resultIndex: scriptResults.length - 1 },
      };
    },
  } satisfies AgentTool<typeof parameters>;
}

function stringifyToolResult(value: unknown) {
  const serialized = JSON.stringify(value);
  const maxLength = 120_000;
  return serialized.length <= maxLength
    ? serialized
    : `${serialized.slice(0, maxLength)}\n[tool result truncated]`;
}

function readApiError(value: unknown, fallback: string) {
  return typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
    ? value.error
    : fallback;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

import { getDeepSeekApiKey } from "@/lib/env";
import {
  compactPreviousResultsForQuery,
  compactProfileForQuery,
  type CsvQueryProfileContext,
  type CsvQueryResultContext,
} from "@/lib/client-analysis/csv-query-payload";
import { validateAnalysisPlan } from "@/lib/client-analysis/csv-plan-validator";
import {
  MAX_QUERY_COLUMNS,
  MAX_QUERY_DISTINCT_VALUES,
  MAX_QUERY_RESULT_ROWS,
  type CsvDataQuery,
  type FilterRule,
} from "@/lib/client-analysis/csv-types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEEPSEEK_BASE = "https://api.deepseek.com";
const QUERY_MODEL_ATTEMPTS = 2;

interface QueryRequest {
  question?: string;
  profile?: CsvQueryProfileContext;
  previousResults?: CsvQueryResultContext[];
  domain?: "campaign" | "general";
}

type QueryAgentResponse =
  | { type: "queries"; queries: CsvDataQuery[]; rationale?: string }
  | { type: "final"; finalAnswer: string };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as QueryRequest;

    if (!body.question?.trim()) {
      return Response.json(
        { ok: false, error: "question is required" },
        { status: 400 },
      );
    }

    if (!body.profile) {
      return Response.json(
        { ok: false, error: "profile is required" },
        { status: 400 },
      );
    }

    const requestArgs = {
      question: body.question,
      profile: compactProfileForQuery(body.profile),
      previousResults: compactPreviousResultsForQuery(body.previousResults ?? []),
      domain: body.domain ?? "campaign",
    } satisfies Omit<Parameters<typeof requestQueryDecision>[0], "apiKey">;

    let apiKey: string | null = null;
    try {
      apiKey = getDeepSeekApiKey();
    } catch {
      return Response.json({
        ok: true,
        ...createFallbackQueryDecision(requestArgs),
      });
    }

    const response = await requestQueryDecision({
      apiKey,
      ...requestArgs,
    });

    return Response.json({ ok: true, ...response });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}

async function requestQueryDecision(args: {
  apiKey: string;
  question: string;
  profile: CsvQueryProfileContext;
  previousResults: unknown[];
  domain: "campaign" | "general";
}): Promise<QueryAgentResponse> {
  for (let attempt = 1; attempt <= QUERY_MODEL_ATTEMPTS; attempt++) {
    try {
      const response = await requestQueryDecisionOnce(args);
      if (response.type === "queries" && response.queries.length === 0) {
        continue;
      }
      return response;
    } catch (error) {
      if (attempt === QUERY_MODEL_ATTEMPTS) {
        return createFallbackQueryDecision(args, error);
      }
    }
  }

  return createFallbackQueryDecision(args);
}

async function requestQueryDecisionOnce(args: {
  apiKey: string;
  question: string;
  profile: CsvQueryProfileContext;
  previousResults: unknown[];
  domain: "campaign" | "general";
}): Promise<QueryAgentResponse> {
  const content = await requestQueryModelContent(args);
  const parsed = extractJsonObject(content);

  if (Array.isArray(parsed)) {
    const queries = normalizeQueries(parsed, args.profile);
    return queries.length > 0
      ? { type: "queries", queries, rationale: "Parsed a query list directly." }
      : createFallbackQueryDecision(args);
  }

  if (!parsed || typeof parsed !== "object") {
    return createFallbackQueryDecision(args);
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.finalAnswer === "string" && record.finalAnswer.trim()) {
    return { type: "final", finalAnswer: record.finalAnswer.trim() };
  }

  if (Array.isArray(record.queries)) {
    const queries = normalizeQueries(record.queries, args.profile);
    if (queries.length === 0) {
      return createFallbackQueryDecision(args);
    }

    return {
      type: "queries",
      queries,
      rationale:
        typeof record.rationale === "string" ? record.rationale : undefined,
    };
  }

  return createFallbackQueryDecision(args);
}

async function requestQueryModelContent(args: {
  apiKey: string;
  question: string;
  profile: CsvQueryProfileContext;
  previousResults: unknown[];
  domain: "campaign" | "general";
}) {
  const resp = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-pro",
      thinking: { type: "enabled", reasoning_effort: "medium" },
      messages: [
        {
          role: "system",
          content: buildQuerySystemPrompt(args.domain),
        },
        {
          role: "user",
          content: JSON.stringify({
            question: args.question,
            profile: args.profile,
            previousResults: args.previousResults,
          }),
        },
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DeepSeek query request failed: ${errText}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Query agent returned empty content.");
  }

  return content;
}

function buildQuerySystemPrompt(domain: "campaign" | "general") {
  return `You are a CSV data analyst that can request small, bounded browser-side data queries.

You do not have the raw CSV. The browser has it locally. You may decide which rows, columns, filters, distinct values, column stats, or aggregates to query. Return JSON only.

Available response shapes:
1. Ask for more data:
{
  "queries": [
    {"type":"rows","rowNumbers":[1,2,3],"columns":["field"],"limit":10},
    {"type":"rows","startRow":100,"limit":10,"columns":["field"]},
    {"type":"columns","columns":["fieldA","fieldB"],"startRow":1,"limit":20},
    {"type":"filterRows","filters":[{"field":"field","op":"eq|contains|between|gte|lte","value":"value"}],"columns":["field"],"limit":20},
    {"type":"distinctValues","column":"field","limit":50},
    {"type":"columnStats","column":"field"},
    {"type":"aggregate","plan":{"goal":"goal","requiredFields":[],"filters":[],"groupBy":["field"],"metrics":[{"name":"metric","field":"field","agg":"sum|avg|min|max|count"}],"ranking":{"sortBy":"metric","direction":"desc","limit":20}}}
  ],
  "rationale": "why these queries are needed"
}

2. Final answer:
{"finalAnswer":"answer based only on profile and previousResults"}

Rules:
- Use only fields that exist in profile.
- Read profile.dataQuality.parseMetadata to understand the detected encoding, delimiter, and parser confidence.
- If parser confidence is low or fields look like whole rows, mention the parsing uncertainty instead of forcing an analysis.
- Never ask for all rows or all columns. Max rows per query is ${MAX_QUERY_RESULT_ROWS}; max columns is ${MAX_QUERY_COLUMNS}; max distinct values is ${MAX_QUERY_DISTINCT_VALUES}.
- Prefer aggregate, columnStats, and distinctValues before row-level inspection.
- Use row-level queries when the user explicitly asks for specific rows or when examples are needed.
- rowNumber is 1-based data-row numbering after the header row. If the user asks for "row N" or "第 N 行数据", request {"type":"rows","rowNumbers":[N]}.
- You may make multiple small queries, then finalAnswer after previousResults are sufficient.
- State limitations if previousResults are insufficient.
- Reply finalAnswer in the user's language.
- Domain is ${domain}; for campaign work prefer route/origin/destination, revenue, passengers/demand, yield, cabin, and date fields when relevant.`;
}

function normalizeQueries(
  rawQueries: unknown[],
  profile: CsvQueryProfileContext,
): CsvDataQuery[] {
  return rawQueries
    .slice(0, 4)
    .flatMap((query) => normalizeQuery(query, profile));
}

function normalizeQuery(
  query: unknown,
  profile: CsvQueryProfileContext,
): CsvDataQuery[] {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    return [];
  }

  const record = query as Record<string, unknown>;
  if (record.type === "rows") {
    return [
      {
        type: "rows",
        rowNumbers: normalizeNumberArray(record.rowNumbers),
        startRow: normalizeNumber(record.startRow),
        limit: normalizeLimit(record.limit),
        columns: normalizeStringArray(record.columns),
      },
    ];
  }

  if (record.type === "columns") {
    const columns = normalizeStringArray(record.columns) ?? [];
    return columns.length
      ? [
          {
            type: "columns",
            columns,
            startRow: normalizeNumber(record.startRow),
            limit: normalizeLimit(record.limit),
          },
        ]
      : [];
  }

  if (record.type === "filterRows") {
    return [
      {
        type: "filterRows",
        filters: normalizeFilters(record.filters),
        columns: normalizeStringArray(record.columns),
        limit: normalizeLimit(record.limit),
      },
    ];
  }

  if (record.type === "distinctValues" && typeof record.column === "string") {
    return [
      {
        type: "distinctValues",
        column: record.column,
        limit: normalizeLimit(record.limit, MAX_QUERY_DISTINCT_VALUES),
      },
    ];
  }

  if (record.type === "columnStats" && typeof record.column === "string") {
    return [{ type: "columnStats", column: record.column }];
  }

  if (record.type === "aggregate" && typeof record.plan === "object") {
    const validation = validateAnalysisPlan(record.plan, profile);
    return [{ type: "aggregate", plan: validation.plan }];
  }

  return [];
}

function createFallbackQueryDecision(args: {
  question: string;
  profile: CsvQueryProfileContext;
  previousResults: unknown[];
}, reason?: unknown): QueryAgentResponse {
  const finalAnswer = buildFallbackFinalAnswer(args.question, args.previousResults);
  if (finalAnswer) {
    return { type: "final", finalAnswer };
  }

  const aggregateQuery = createFallbackAggregateQuery(args.question, args.profile);
  if (aggregateQuery) {
    return {
      type: "queries",
      queries: [aggregateQuery],
      rationale: formatFallbackRationale(reason),
    };
  }

  return {
    type: "final",
    finalAnswer: isChineseQuestion(args.question)
      ? "模型没有返回可执行的 JSON 查询计划，并且当前字段画像不足以生成保底查询。请指定要分组或统计的字段名。"
      : "The model did not return an executable JSON query plan, and the current profile was not sufficient to build a fallback query. Please specify the fields to group or count.",
  };
}

function formatFallbackRationale(reason: unknown) {
  const reasonText = reason instanceof Error ? reason.message : String(reason ?? "");
  return reasonText
    ? `Query planning fell back to a safe local aggregate query: ${reasonText}`
    : "Query planning fell back to a safe local aggregate query.";
}

function createFallbackAggregateQuery(
  question: string,
  profile: CsvQueryProfileContext,
): CsvDataQuery | null {
  const groupBy = inferFallbackGroupBy(question, profile);
  const countField = groupBy[0] ?? profile.columns[0]?.name;
  if (!countField) {
    return null;
  }

  return {
    type: "aggregate",
    plan: {
      goal: "fallback_count_by_group",
      requiredFields: groupBy,
      filters: [],
      groupBy,
      metrics: [{ name: "row_count", field: countField, agg: "count" }],
      ranking: { sortBy: "row_count", direction: "desc", limit: 50 },
    },
  };
}

function inferFallbackGroupBy(
  question: string,
  profile: CsvQueryProfileContext,
): string[] {
  const lowerQuestion = question.toLowerCase();
  const origin = findColumnBySemantic(profile, "origin");
  const destination = findColumnBySemantic(profile, "destination");
  const route = findColumnBySemantic(profile, "route");

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
  return dimension ? [dimension.name] : profile.columns.slice(0, 1).map((column) => column.name);
}

function findColumnBySemantic(
  profile: CsvQueryProfileContext,
  semanticType: NonNullable<CsvQueryProfileContext["columns"][number]["semanticType"]>,
) {
  return profile.columns.find((column) => column.semanticType === semanticType);
}

function buildFallbackFinalAnswer(
  question: string,
  previousResults: unknown[],
): string | null {
  const aggregateContext = previousResults
    .map((result) => toRecord(result))
    .findLast((result) => Boolean(toRecord(result?.aggregateResult)));
  const aggregateResult = toRecord(aggregateContext?.aggregateResult);
  const resultRows = Array.isArray(aggregateResult?.resultRows)
    ? aggregateResult.resultRows.flatMap((row) => {
        const record = toRecord(row);
        return record ? [record] : [];
      })
    : [];

  if (!aggregateResult || resultRows.length === 0) {
    return null;
  }

  const query = toRecord(aggregateContext?.query);
  const plan = toRecord(query?.plan);
  const groupBy = Array.isArray(plan?.groupBy)
    ? plan.groupBy.flatMap((field) => (typeof field === "string" ? [field] : []))
    : [];
  const topRow = resultRows[0];
  const metricName =
    "row_count" in topRow
      ? "row_count"
      : Object.keys(topRow).find((key) => !groupBy.includes(key));
  const metricValue = metricName ? topRow[metricName] : undefined;
  const topLabel = groupBy.length > 0
    ? groupBy.map((field) => `${field}=${String(topRow[field] ?? "")}`).join(" / ")
    : JSON.stringify(topRow);
  const totalGroupCount = Number(aggregateResult.totalGroupCount);

  if (isChineseQuestion(question)) {
    const totalText = Number.isFinite(totalGroupCount)
      ? `共有 ${totalGroupCount} 种组合`
      : "已完成组合聚合";
    const metricText = metricName ? `，${metricName} 为 ${String(metricValue)}` : "";
    return `${totalText}。最受欢迎的组合是 ${topLabel}${metricText}。结果基于本地聚合查询；如结果被截断，完整组合数以 totalGroupCount 为准。`;
  }

  const totalText = Number.isFinite(totalGroupCount)
    ? `There are ${totalGroupCount} combinations`
    : "The combinations have been aggregated";
  const metricText = metricName ? ` with ${metricName} = ${String(metricValue)}` : "";
  return `${totalText}. The most popular combination is ${topLabel}${metricText}. This is based on the local aggregate query; if rows were truncated, totalGroupCount is the full combination count.`;
}

function isChineseQuestion(question: string) {
  return /[\u3400-\u9fff]/.test(question);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeFilters(value: unknown): FilterRule[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const field = typeof record.field === "string" ? record.field : null;
    const op = typeof record.op === "string" ? record.op : null;
    if (
      !field ||
      (op !== "eq" &&
        op !== "contains" &&
        op !== "between" &&
        op !== "gte" &&
        op !== "lte")
    ) {
      return [];
    }

    return [
      {
        field,
        op,
        value: normalizeFilterValue(record.value),
      },
    ];
  });
}

function normalizeFilterValue(
  value: unknown,
): string | number | [string | number, string | number] {
  if (Array.isArray(value)) {
    return [normalizeSingleValue(value[0]), normalizeSingleValue(value[1])];
  }

  return normalizeSingleValue(value);
}

function normalizeSingleValue(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return String(value ?? "");
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "string" ? [item] : []))
    : undefined;
}

function normalizeNumberArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const number = Number(item);
        return Number.isFinite(number) ? [number] : [];
      })
    : undefined;
}

function normalizeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeLimit(value: unknown, max = MAX_QUERY_RESULT_ROWS) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.min(Math.floor(number), max)
    : undefined;
}

function extractJsonObject(content: unknown): unknown | null {
  if (typeof content !== "string") {
    return null;
  }

  const direct = tryParseJson(content);
  if (direct) return direct;

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    const parsed = tryParseJson(fenced);
    if (parsed) return parsed;
  }

  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return tryParseJson(content.slice(start, end + 1));
  }

  return null;
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

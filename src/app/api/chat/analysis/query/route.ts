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
const MAX_QUERIES_PER_ROUND = 8;

interface QueryRequest {
  question?: string;
  profile?: CsvQueryProfileContext;
  previousResults?: CsvQueryResultContext[];
  domain?: "campaign" | "general";
  enable_thinking?: boolean;
  force_final?: boolean;
}

type DeepSeekThinking =
  | { type: "enabled"; reasoning_effort: "medium" }
  | { type: "disabled" };

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
      enableThinking: body.enable_thinking ?? false,
      forceFinal: body.force_final ?? false,
    } satisfies Omit<Parameters<typeof requestQueryDecision>[0], "apiKey">;

    let apiKey: string | null = null;
    try {
      apiKey = getDeepSeekApiKey();
    } catch {
      return Response.json({
        ok: true,
        ...(requestArgs.forceFinal
          ? createFallbackFinalDecision(requestArgs)
          : createFallbackQueryDecision(requestArgs)),
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
  enableThinking: boolean;
  forceFinal: boolean;
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
        return args.forceFinal
          ? createFallbackFinalDecision(args, error)
          : createFallbackQueryDecision(args, error);
      }
    }
  }

  return args.forceFinal
    ? createFallbackFinalDecision(args)
    : createFallbackQueryDecision(args);
}

async function requestQueryDecisionOnce(args: {
  apiKey: string;
  question: string;
  profile: CsvQueryProfileContext;
  previousResults: unknown[];
  domain: "campaign" | "general";
  enableThinking: boolean;
  forceFinal: boolean;
}): Promise<QueryAgentResponse> {
  const content = await requestQueryModelContent(args);
  const parsed = extractJsonObject(content);

  if (Array.isArray(parsed)) {
    if (args.forceFinal) {
      return createFallbackFinalDecision(args, "Final answer was requested.");
    }

    const queries = normalizeQueries(parsed, args.profile, args.question);
    return queries.length > 0
      ? { type: "queries", queries, rationale: "Parsed a query list directly." }
      : createFallbackQueryDecision(args);
  }

  if (!parsed || typeof parsed !== "object") {
    return args.forceFinal
      ? createFallbackFinalDecision(args, "Model did not return valid JSON.")
      : createFallbackQueryDecision(args);
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.finalAnswer === "string" && record.finalAnswer.trim()) {
    if (!args.forceFinal) {
      const guardQueries = buildCompletenessGuardQueries(args);
      if (guardQueries.length > 0) {
        return {
          type: "queries",
          queries: guardQueries,
          rationale:
            "Previous results are missing key non-empty metric coverage for the requested dimensions; requesting targeted follow-up queries before finalizing.",
        };
      }
    }

    return { type: "final", finalAnswer: record.finalAnswer.trim() };
  }

  if (Array.isArray(record.queries)) {
    if (args.forceFinal) {
      return createFallbackFinalDecision(args, "Final answer was requested.");
    }

    const queries = normalizeQueries(record.queries, args.profile, args.question);
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

  return args.forceFinal
    ? createFallbackFinalDecision(args, "Final answer was requested.")
    : createFallbackQueryDecision(args);
}

async function requestQueryModelContent(args: {
  apiKey: string;
  question: string;
  profile: CsvQueryProfileContext;
  previousResults: unknown[];
  domain: "campaign" | "general";
  enableThinking: boolean;
  forceFinal: boolean;
}) {
  const resp = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-pro",
      thinking: buildThinkingConfig(args.enableThinking),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildQuerySystemPrompt(args.domain, args.forceFinal),
        },
        {
          role: "user",
          content: JSON.stringify({
            question: args.question,
            profile: args.profile,
            previousResults: args.previousResults,
            force_final: args.forceFinal,
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

function buildThinkingConfig(enableThinking: boolean): DeepSeekThinking {
  return enableThinking
    ? { type: "enabled", reasoning_effort: "medium" }
    : { type: "disabled" };
}

function buildQuerySystemPrompt(
  domain: "campaign" | "general",
  forceFinal: boolean,
) {
  return `You are a CSV data analyst that can request small, bounded browser-side data queries.

You do not have the raw CSV. The browser has it locally. You may decide which rows, columns, filters, distinct values, column stats, or aggregates to query. Return JSON only.

Local computation and browser/server message transfer are cheap for this workflow. Optimize for fewer model/API turns by requesting a broad, evidence-complete batch of bounded local queries each round.

Available response shapes:
1. Ask for more data:
{
  "queries": [
    {"type":"rows","rowNumbers":[1,2,3],"columns":["field"],"limit":10},
    {"type":"rows","startRow":100,"limit":10,"columns":["field"]},
    {"type":"columns","columns":["fieldA","fieldB"],"startRow":1,"limit":20},
    {"type":"filterRows","filters":[{"field":"field","op":"eq|contains|between|gte|lte|notEmpty","value":"value"}],"columns":["field"],"limit":20},
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
- Never ask for all rows or all columns. Max rows per row-detail query is ${MAX_QUERY_RESULT_ROWS}; max columns is ${MAX_QUERY_COLUMNS}; max distinct values is ${MAX_QUERY_DISTINCT_VALUES}. Aggregate queries can summarize the full dataset and may return top-ranked groups.
- Use {"op":"notEmpty"} filters to exclude missing dimension or metric fields before ranking by low availability or high load factor.
- Prefer aggregate, columnStats, and distinctValues before row-level inspection.
- In the first query round, request enough complementary queries to cover the user's main dimensions and metrics in one batch whenever possible. You may request up to ${MAX_QUERIES_PER_ROUND} queries per round.
- For analytical questions, combine columnStats for key metrics, distinctValues for key dimensions, and several aggregate queries with different groupBy/ranking/filter views instead of asking for one narrow query at a time.
- Use row-level queries when the user explicitly asks for specific rows or when examples are needed.
- rowNumber is 1-based data-row numbering after the header row. If the user asks for "row N" or "第 N 行数据", request {"type":"rows","rowNumbers":[N]}.
- If previousResults already contain aggregateResult, stats, values, or rows that fully address the question, return finalAnswer instead of asking for more data.
- Do not repeat a query shape that is already present in previousResults.
- Top-ranked aggregates can be truncated by limit while still covering the full dataset through totalGroupCount and matchedRowCount. Do not ask for more data solely because an aggregate is truncated; ask only when the returned rows miss important dimensions, important metrics, or part of the user's question.
- Aggregate numeric metrics include companion fields named metric__non_null_count. Treat low or zero non-null counts as weak evidence and request filtered follow-up queries when needed.
- If low-availability rankings are dominated by null metric values or "(empty)" dimension groups, request a notEmpty-filtered aggregate before finalAnswer.
- If load factor and booking-class availability appear at different row granularities and joint notEmpty queries return zero rows, do not keep forcing the join. Use separate aggregates, state the granularity limitation, and make cautious recommendations.
- If a previous aggregate with notEmpty filters for both load factor and availability returned matchedRowCount = 0, treat the joint row-level intersection as disproven. Do not request another query that requires both fields to be non-empty unless the grouping/filter scope is genuinely different and necessary.
- Interpret compact labels like Sep26, Aug26, or Dec26 in file names as departure month/year labels, not day-of-month filters. Only filter Day of departure_date when the user explicitly says day 26, 26日, or similar.
- Do not claim comprehensive coverage until previousResults cover each key dimension, metric, and filter implied by the question, or until you explicitly state the remaining gap.
- When force_final is true, you must return {"finalAnswer":"..."} and must not return queries.
- State limitations if previousResults are insufficient.
- Reply finalAnswer in the user's language.
- Domain is ${domain}; for campaign work prefer route/origin/destination, revenue, passengers/demand, yield, cabin, and date fields when relevant.
- force_final is ${forceFinal ? "true" : "false"}.`;
}

function normalizeQueries(
  rawQueries: unknown[],
  profile: CsvQueryProfileContext,
  question: string,
): CsvDataQuery[] {
  return rawQueries
    .slice(0, MAX_QUERIES_PER_ROUND)
    .flatMap((query) => normalizeQuery(query, profile, question));
}

function normalizeQuery(
  query: unknown,
  profile: CsvQueryProfileContext,
  question: string,
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
    return [
      {
        type: "aggregate",
        plan: applyInferredContextFilters(validation.plan, profile, question),
      },
    ];
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

function createFallbackFinalDecision(
  args: {
    question: string;
    previousResults: unknown[];
  },
  reason?: unknown,
): QueryAgentResponse {
  const finalAnswer = buildFallbackFinalAnswer(args.question, args.previousResults);
  if (finalAnswer) {
    return { type: "final", finalAnswer };
  }

  const reasonText =
    reason instanceof Error ? reason.message : String(reason ?? "");
  return {
    type: "final",
    finalAnswer: isChineseQuestion(args.question)
      ? `当前已进入总结阶段，但已有查询结果不足以生成可靠结论。${reasonText ? `原因：${reasonText}` : ""}`
      : `The flow is in final-answer mode, but the available query results are not sufficient for a reliable conclusion.${reasonText ? ` Reason: ${reasonText}` : ""}`,
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
        op !== "lte" &&
        op !== "notEmpty")
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

function applyInferredContextFilters(
  plan: ReturnType<typeof validateAnalysisPlan>["plan"],
  profile: CsvQueryProfileContext,
  question: string,
) {
  const month = inferDepartureMonth(question, profile.fileName);
  if (!month) {
    return plan;
  }

  const monthColumn = findColumnByName(profile, ["Month of departure_date"]);
  if (!monthColumn || plan.filters.some((filter) => filter.field === monthColumn.name)) {
    return plan;
  }

  return {
    ...plan,
    requiredFields: Array.from(
      new Set([...plan.requiredFields, monthColumn.name]),
    ),
    filters: [
      ...plan.filters,
      { field: monthColumn.name, op: "eq" as const, value: month },
    ],
  };
}

function inferDepartureMonth(question: string, fileName: string) {
  const text = `${question} ${fileName}`.toLowerCase();
  const entries: Array<[RegExp, string]> = [
    [/\b(?:jan|january)\s*'?2\d\b/, "January"],
    [/\b(?:feb|february)\s*'?2\d\b/, "February"],
    [/\b(?:mar|march)\s*'?2\d\b/, "March"],
    [/\b(?:apr|april)\s*'?2\d\b/, "April"],
    [/\bmay\s*'?2\d\b/, "May"],
    [/\b(?:jun|june)\s*'?2\d\b/, "June"],
    [/\b(?:jul|july)\s*'?2\d\b/, "July"],
    [/\b(?:aug|august)\s*'?2\d\b/, "August"],
    [/\b(?:sep|sept|september)\s*'?2\d\b/, "September"],
    [/\b(?:oct|october)\s*'?2\d\b/, "October"],
    [/\b(?:nov|november)\s*'?2\d\b/, "November"],
    [/\b(?:dec|december)\s*'?2\d\b/, "December"],
  ];

  return entries.find(([pattern]) => pattern.test(text))?.[1];
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

function buildCompletenessGuardQueries(args: {
  question: string;
  profile: CsvQueryProfileContext;
  previousResults: unknown[];
}): CsvDataQuery[] {
  const question = args.question.toLowerCase();
  const previousResults = args.previousResults.flatMap((result) => {
    const record = toRecord(result);
    return record ? [record] : [];
  });
  const wantsAvailability =
    question.includes("availability") ||
    question.includes("available") ||
    question.includes("可用") ||
    question.includes("舱位");
  const wantsLoadFactor =
    question.includes("load factor") ||
    question.includes("lf") ||
    question.includes("载运") ||
    question.includes("客座率");
  const wantsRoute =
    question.includes("origin") ||
    question.includes("destination") ||
    question.includes("route") ||
    question.includes("path") ||
    question.includes("航线");
  const wantsBookingClass =
    question.includes("booking_class") ||
    question.includes("booking class") ||
    question.includes("舱位");

  const routeColumn = findColumnByName(args.profile, [
    "origin destination",
    "route",
    "od",
  ]);
  const pathColumn = findColumnByName(args.profile, ["travel_solution_path"]);
  const bookingClassColumn = findColumnByName(args.profile, ["booking_class"]);
  const availabilityColumn = findColumnByName(args.profile, [
    "Booking class availability",
    "Avg. Booking class availability",
  ]);
  const loadFactorColumn = findColumnByName(args.profile, [
    "O&D max load factor",
    "load factor",
    "lf",
  ]);
  const monthColumn = findColumnByName(args.profile, ["Month of departure_date"]);
  const dayColumn = findColumnByName(args.profile, ["Day of departure_date"]);
  const requestedSpecificDay = extractRequestedDay(args.question);
  const hasAvailabilityEvidence =
    Boolean(availabilityColumn) &&
    hasEvidenceForMetric(previousResults, availabilityColumn?.name ?? "", {
      dimensionNames: [
        routeColumn?.name,
        pathColumn?.name,
        wantsBookingClass ? bookingClassColumn?.name : undefined,
      ],
      requiresNonEmptyDimensionNames: wantsBookingClass
        ? [bookingClassColumn?.name]
        : undefined,
      dayColumnName: requestedSpecificDay ? dayColumn?.name : undefined,
    });
  const hasLoadFactorEvidence =
    Boolean(loadFactorColumn) &&
    hasEvidenceForMetric(previousResults, loadFactorColumn?.name ?? "", {
      dimensionNames: [
        wantsRoute ? routeColumn?.name : undefined,
        wantsRoute ? pathColumn?.name : undefined,
      ],
      dayColumnName: requestedSpecificDay ? dayColumn?.name : undefined,
    });
  const needsAvailabilityGuard =
    wantsAvailability &&
    Boolean(availabilityColumn) &&
    !hasAvailabilityEvidence;
  const needsLoadFactorGuard =
    wantsLoadFactor &&
    Boolean(loadFactorColumn) &&
    !hasLoadFactorEvidence;

  if (!needsAvailabilityGuard && !needsLoadFactorGuard) {
    return [];
  }

  const filters: FilterRule[] = [];

  if (monthColumn) {
    filters.push({ field: monthColumn.name, op: "eq", value: "September" });
  }
  if (dayColumn && requestedSpecificDay) {
    filters.push({ field: dayColumn.name, op: "eq", value: requestedSpecificDay });
  }
  if (bookingClassColumn && wantsBookingClass) {
    filters.push({ field: bookingClassColumn.name, op: "notEmpty" });
  }
  if (availabilityColumn && wantsAvailability) {
    filters.push({ field: availabilityColumn.name, op: "notEmpty" });
  }

  const groupBy = [routeColumn?.name, pathColumn?.name, bookingClassColumn?.name]
    .flatMap((field) => (field ? [field] : []))
    .slice(0, 3);
  const queries: CsvDataQuery[] = [];

  if (groupBy.length > 0 && availabilityColumn && needsAvailabilityGuard) {
    queries.push({
      type: "aggregate",
      plan: {
        goal: "guard_low_availability_non_empty_metrics",
        requiredFields: [...groupBy, availabilityColumn.name],
        filters,
        groupBy,
        metrics: [
          {
            name: "avg_availability",
            field: availabilityColumn.name,
            agg: "avg",
          },
          {
            name: "min_availability",
            field: availabilityColumn.name,
            agg: "min",
          },
          {
            name: "row_count",
            field: groupBy[0],
            agg: "count",
          },
        ],
        ranking: {
          sortBy: "avg_availability",
          direction: "asc",
          limit: 100,
        },
      },
    });
  }

  if (
    wantsRoute &&
    needsLoadFactorGuard &&
    routeColumn &&
    pathColumn &&
    loadFactorColumn
  ) {
    queries.push({
      type: "aggregate",
      plan: {
        goal: "guard_high_load_factor_non_empty_metrics",
        requiredFields: [routeColumn.name, pathColumn.name, loadFactorColumn.name],
        filters: [
          ...(monthColumn
            ? [{ field: monthColumn.name, op: "eq" as const, value: "September" }]
            : []),
          ...(dayColumn && requestedSpecificDay
            ? [{ field: dayColumn.name, op: "eq" as const, value: requestedSpecificDay }]
            : []),
          { field: loadFactorColumn.name, op: "notEmpty" },
        ],
        groupBy: [routeColumn.name, pathColumn.name],
        metrics: [
          {
            name: "avg_max_lf",
            field: loadFactorColumn.name,
            agg: "avg",
          },
          {
            name: "max_max_lf",
            field: loadFactorColumn.name,
            agg: "max",
          },
          {
            name: "row_count",
            field: routeColumn.name,
            agg: "count",
          },
        ],
        ranking: {
          sortBy: "avg_max_lf",
          direction: "desc",
          limit: 100,
        },
      },
    });
  }

  return queries.filter((query) => !hasPreviousQuery(previousResults, query));
}

function hasEvidenceForMetric(
  previousResults: Record<string, unknown>[],
  metricFieldName: string,
  options: {
    dimensionNames?: Array<string | undefined>;
    requiresNonEmptyDimensionNames?: Array<string | undefined>;
    dayColumnName?: string;
  } = {},
) {
  return previousResults.some((result) => {
    const aggregate = toRecord(result.aggregateResult);
    if (!aggregate) {
      return false;
    }

    const rows = getAggregateRows(aggregate);
    if (rows.length === 0) {
      return false;
    }

    const plan = getResultPlan(result, aggregate);
    const metricNames = getPlanMetricNamesForField(plan, metricFieldName);
    if (metricNames.length === 0) {
      return false;
    }

    const groupBy = toStringArray(plan?.groupBy);
    const filters = toRecordArray(plan?.filters);
    const dimensionNames = (options.dimensionNames ?? []).flatMap((field) =>
      field ? [field] : [],
    );
    const requiredDimensionNames = (
      options.requiresNonEmptyDimensionNames ?? []
    ).flatMap((field) => (field ? [field] : []));

    if (dimensionNames.some((dimension) => !groupBy.includes(dimension))) {
      return false;
    }

    if (
      options.dayColumnName &&
      !filters.some((filter) => filter.field === options.dayColumnName)
    ) {
      return false;
    }

    if (
      requiredDimensionNames.some(
        (dimension) => !hasNotEmptyFilter(filters, dimension),
      )
    ) {
      return false;
    }

    return rows.some((row) =>
      metricNames.some((metricName) => {
        const count = row[`${metricName}__non_null_count`];
        if (typeof count === "number") {
          return count > 0;
        }

        return row[metricName] !== null && row[metricName] !== undefined;
      }),
    );
  });
}

function getResultPlan(
  result: Record<string, unknown>,
  aggregate: Record<string, unknown> | null,
) {
  const query = toRecord(result.query);
  return toRecord(aggregate?.plan) ?? toRecord(query?.plan);
}

function getPlanMetricNamesForField(
  plan: Record<string, unknown> | null,
  fieldName: string,
) {
  const metrics = toRecordArray(plan?.metrics);
  return metrics.flatMap((metric) =>
    metric.field === fieldName && typeof metric.name === "string"
      ? [metric.name]
      : [],
  );
}

function getAggregateRows(aggregate: Record<string, unknown> | null) {
  return Array.isArray(aggregate?.resultRows)
    ? aggregate.resultRows.flatMap((row) => {
        const record = toRecord(row);
        return record ? [record] : [];
      })
    : [];
}

function hasNotEmptyFilter(filters: Record<string, unknown>[], fieldName: string) {
  return filters.some(
    (filter) => filter.field === fieldName && filter.op === "notEmpty",
  );
}

function hasPreviousQuery(
  previousResults: Record<string, unknown>[],
  query: CsvDataQuery,
) {
  const signature = getQuerySignature(query);
  return previousResults.some((result) => {
    const previousQuery = toRecord(result.query);
    return previousQuery && getQuerySignature(previousQuery) === signature;
  });
}

function getQuerySignature(query: unknown) {
  return JSON.stringify(query);
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "string" ? [item] : []))
    : [];
}

function toRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = toRecord(item);
        return record ? [record] : [];
      })
    : [];
}

function extractRequestedDay(question: string) {
  const lowerQuestion = question.toLowerCase();
  const dayMatch = lowerQuestion.match(/\b(?:day|date)\s*(?:of\s*)?(?:=|is|:)?\s*0?([1-9]|[12]\d|30)\b/);
  if (dayMatch?.[1]) {
    return Number(dayMatch[1]);
  }

  const chineseDayMatch = question.match(/([1-9]|[12]\d|30)\s*(?:日|号)/);
  if (chineseDayMatch?.[1]) {
    return Number(chineseDayMatch[1]);
  }

  return undefined;
}

function findColumnByName(
  profile: CsvQueryProfileContext,
  candidates: string[],
) {
  const lowerCandidates = candidates.map((candidate) => candidate.toLowerCase());
  return profile.columns.find((column) => {
    const lowerName = column.name.toLowerCase();
    return lowerCandidates.some(
      (candidate) =>
        lowerName === candidate ||
        lowerName.includes(candidate) ||
        candidate.includes(lowerName),
    );
  });
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

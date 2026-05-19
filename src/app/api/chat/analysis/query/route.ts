import { getDeepSeekApiKey } from "@/lib/env";
import {
  MAX_QUERY_COLUMNS,
  MAX_QUERY_DISTINCT_VALUES,
  MAX_QUERY_RESULT_ROWS,
  type CsvDataQuery,
  type CsvDataQueryResult,
  type FilterRule,
  type AnalysisPlan,
  type CsvProfile,
} from "@/lib/client-analysis/csv-types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEEPSEEK_BASE = "https://api.deepseek.com";

interface QueryRequest {
  question?: string;
  profile?: CsvProfile;
  previousResults?: CsvDataQueryResult[];
  domain?: "campaign" | "general";
}

type QueryAgentResponse =
  | { type: "queries"; queries: CsvDataQuery[]; rationale?: string }
  | { type: "final"; finalAnswer: string };

export async function POST(request: Request) {
  try {
    const apiKey = getDeepSeekApiKey();
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

    const response = await requestQueryDecision({
      apiKey,
      question: body.question,
      profile: compactProfile(body.profile),
      previousResults: compactPreviousResults(body.previousResults ?? []),
      domain: body.domain ?? "campaign",
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
  profile: unknown;
  previousResults: unknown[];
  domain: "campaign" | "general";
}): Promise<QueryAgentResponse> {
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
  const parsed = extractJsonObject(content);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Query agent did not return valid JSON.");
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.finalAnswer === "string" && record.finalAnswer.trim()) {
    return { type: "final", finalAnswer: record.finalAnswer.trim() };
  }

  if (Array.isArray(record.queries)) {
    return {
      type: "queries",
      queries: normalizeQueries(record.queries),
      rationale:
        typeof record.rationale === "string" ? record.rationale : undefined,
    };
  }

  throw new Error("Query agent returned neither queries nor finalAnswer.");
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
- Never ask for all rows or all columns. Max rows per query is ${MAX_QUERY_RESULT_ROWS}; max columns is ${MAX_QUERY_COLUMNS}; max distinct values is ${MAX_QUERY_DISTINCT_VALUES}.
- Prefer aggregate, columnStats, and distinctValues before row-level inspection.
- Use row-level queries when the user explicitly asks for specific rows or when examples are needed.
- You may make multiple small queries, then finalAnswer after previousResults are sufficient.
- State limitations if previousResults are insufficient.
- Reply finalAnswer in the user's language.
- Domain is ${domain}; for campaign work prefer route/origin/destination, revenue, passengers/demand, yield, cabin, and date fields when relevant.`;
}

function compactProfile(profile: CsvProfile) {
  return {
    fileName: profile.fileName,
    fileSize: profile.fileSize,
    rowCount: profile.rowCount,
    columnCount: profile.columnCount,
    columns: profile.columns.slice(0, 160).map((column) => ({
      name: column.name,
      type: column.type,
      semanticType: column.semanticType,
      missingRate: Number(column.missingRate.toFixed(4)),
      sampleValues: column.sampleValues.slice(0, 8),
      min: column.min,
      max: column.max,
      avg:
        typeof column.avg === "number"
          ? Number(column.avg.toFixed(4))
          : undefined,
    })),
    sampleRows: profile.sampleRows.slice(0, 5),
    dataQuality: profile.dataQuality,
  };
}

function compactPreviousResults(results: CsvDataQueryResult[]) {
  return results.slice(-12).map((result) => ({
    query: result.query,
    rowCount: result.rowCount,
    matchedRowCount: result.matchedRowCount,
    rows: result.rows?.slice(0, MAX_QUERY_RESULT_ROWS),
    values: result.values?.slice(0, MAX_QUERY_DISTINCT_VALUES),
    stats: result.stats,
    aggregateResult: result.aggregateResult
      ? {
          rowCount: result.aggregateResult.rowCount,
          matchedRowCount: result.aggregateResult.matchedRowCount,
          resultRows: result.aggregateResult.resultRows.slice(0, MAX_QUERY_RESULT_ROWS),
          warnings: result.aggregateResult.warnings,
        }
      : undefined,
    warnings: result.warnings,
  }));
}

function normalizeQueries(rawQueries: unknown[]): CsvDataQuery[] {
  return rawQueries
    .slice(0, 4)
    .flatMap((query) => normalizeQuery(query));
}

function normalizeQuery(query: unknown): CsvDataQuery[] {
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
    return [{ type: "aggregate", plan: record.plan as AnalysisPlan }];
  }

  return [];
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

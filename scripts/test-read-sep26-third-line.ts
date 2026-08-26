import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDeepSeekApiKey } from "../src/lib/env";
import { executeDataQuery } from "../src/lib/client-analysis/csv-plan-executor";
import {
  buildAnalysisAttachmentContent,
  summarizeProfile,
} from "../src/lib/client-analysis/csv-analysis-prompts";
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
  MAX_QUERY_COLUMNS,
  MAX_QUERY_DISTINCT_VALUES,
  MAX_QUERY_ITERATIONS,
  MAX_QUERY_RESULT_ROWS,
  type AnalysisPlan,
  type CsvDataQuery,
  type CsvDataQueryResult,
  type CsvProfile,
  type FilterRule,
} from "../src/lib/client-analysis/csv-types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const targetFilePath = path.resolve(
  __dirname,
  "../data/line avail +bar chart LF_Dep Sep26.csv",
);
const targetFileName = path.basename(targetFilePath);
const question =
  "请测试你对这个大 CSV 的本地访问能力：读取文件物理第三行内容并原样返回。";
const deepseekBase = "https://api.deepseek.com";

async function main() {
  await loadLocalEnv();

  const buffer = await readFile(targetFilePath);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const decoded = decodeCsvText(arrayBuffer);
  const parsed = parseCsv(decoded.text, decoded.encoding);
  const profile = createCsvProfile(
    { name: targetFileName, size: buffer.byteLength },
    parsed,
  );
  const profileSummary = summarizeProfile(profile);
  const queryResults: CsvDataQueryResult[] = [];

  console.log(
    buildAnalysisAttachmentContent({ profileSummary }) +
      "\n\n[测试说明] 原始 CSV 不发送给模型；模型只能根据字段画像请求小范围本地查询。",
  );

  for (let iteration = 0; iteration < MAX_QUERY_ITERATIONS; iteration++) {
    const decision = await requestDataQueries({
      question,
      profile,
      previousResults: queryResults,
    });

    if ("finalAnswer" in decision) {
      console.log("\n[模型最终回答]");
      console.log(decision.finalAnswer);
      return;
    }

    if (!decision.queries.length) {
      break;
    }

    console.log(`\n[第 ${iteration + 1} 轮模型请求]`);
    console.log(JSON.stringify(decision.queries, null, 2));

    for (const query of decision.queries) {
      queryResults.push(
        executeDataQuery(parsed.rows, query, parsed.dataQuality),
      );
    }

    console.log("\n[本地查询结果]");
    console.log(JSON.stringify(queryResults.at(-1), null, 2));
  }

  const finalDecision = await requestDataQueries({
    question,
    profile,
    previousResults: queryResults,
  });

  console.log(
    ("finalAnswer" in finalDecision ? finalDecision.finalAnswer : undefined) ??
      "模型未给出最终回答，请检查查询轮次或提示词约束。",
  );
}

async function loadLocalEnv() {
  const envPath = path.join(projectRoot, ".env.local");
  const content = await readFile(envPath, "utf8").catch(() => "");

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
    process.env[key] ??= value;
  }
}

function unquoteEnvValue(value: string) {
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.at(-1) === quote) {
    return value.slice(1, -1);
  }

  return value;
}

type QueryDecision =
  | { queries: CsvDataQuery[]; rationale?: string; finalAnswer?: never }
  | { finalAnswer: string; queries?: never; rationale?: never };

async function requestDataQueries(args: {
  question: string;
  profile: CsvProfile;
  previousResults: CsvDataQueryResult[];
}): Promise<QueryDecision> {
  const apiKey = getDeepSeekApiKey();
  const resp = await fetch(`${deepseekBase}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash-vision-exp",
      thinking: { type: "enabled", reasoning_effort: "max" },
      messages: [
        { role: "system", content: buildQuerySystemPrompt() },
        {
          role: "user",
          content: JSON.stringify({
            question: args.question,
            profile: compactProfileForQuery(args.profile),
            previousResults: compactPreviousResultsForQuery(
              args.previousResults,
            ),
          }),
        },
      ],
    }),
  });

  if (!resp.ok) {
    throw new Error(`DeepSeek query request failed: ${await resp.text()}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  const parsedContent = extractJsonObject(content);

  if (
    !parsedContent ||
    typeof parsedContent !== "object" ||
    Array.isArray(parsedContent)
  ) {
    throw new Error("模型没有返回有效 JSON。响应内容：" + String(content));
  }

  const record = parsedContent as Record<string, unknown>;
  if (typeof record.finalAnswer === "string" && record.finalAnswer.trim()) {
    return { finalAnswer: record.finalAnswer.trim() };
  }

  if (Array.isArray(record.queries)) {
    return {
      queries: normalizeQueries(record.queries),
      rationale:
        typeof record.rationale === "string" ? record.rationale : undefined,
    };
  }

  throw new Error("模型既没有返回 queries，也没有返回 finalAnswer。");
}

function buildQuerySystemPrompt() {
  return `You are a CSV data analyst that can request small, bounded local data queries.

You do not have the raw CSV. The local test script has it. You may decide which rows, columns, filters, distinct values, column stats, or aggregates to query. Return JSON only.

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
- Read profile.dataQuality.parseMetadata to understand encoding, delimiter, and parser confidence.
- Never ask for all rows or all columns. Max rows per query is ${MAX_QUERY_RESULT_ROWS}; max columns is ${MAX_QUERY_COLUMNS}; max distinct values is ${MAX_QUERY_DISTINCT_VALUES}.
- Use row-level queries when the user explicitly asks for specific rows.
- rowNumber is 1-based data-row numbering after the header row. If the user asks for physical line N, request rowNumbers [N-1], because physical line 1 is the header.
- You may make multiple small queries, then finalAnswer after previousResults are sufficient.
- Reply finalAnswer in the user's language.`;
}

function normalizeQueries(rawQueries: unknown[]): CsvDataQuery[] {
  return rawQueries.slice(0, 4).flatMap((query) => normalizeQuery(query));
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

function extractJsonObject(content: unknown): unknown {
  if (typeof content !== "string") {
    return null;
  }

  const direct = safeJsonParse(content.trim());
  if (direct) {
    return direct;
  }

  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (match) {
    const fenced = safeJsonParse(match[1].trim());
    if (fenced) {
      return fenced;
    }
  }

  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return safeJsonParse(content.slice(start, end + 1));
  }

  return null;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

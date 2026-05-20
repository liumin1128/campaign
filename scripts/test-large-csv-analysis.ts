import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeDataQuery } from "../src/lib/client-analysis/csv-plan-executor";
import {
  createFallbackPlan,
  validateAnalysisPlan,
} from "../src/lib/client-analysis/csv-plan-validator";
import {
  createCsvProfile,
  decodeCsvText,
  parseCsv,
  parseNumber,
} from "../src/lib/client-analysis/csv-profiler";
import type {
  AnalysisPlan,
  CsvDataQuery,
  CsvProfile,
  CsvRow,
} from "../src/lib/client-analysis/csv-types";

type TestStatus = "PASS" | "FAIL";

type TestCase = {
  name: string;
  run: (context: CsvFileContext) => void;
};

type TestResult = {
  name: string;
  status: TestStatus;
  details: string;
};

type CsvFileContext = {
  fileName: string;
  fileSize: number;
  rows: CsvRow[];
  profile: CsvProfile;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");

const testCases: TestCase[] = [
  {
    name: "CSV 可被完整解析并生成 profile",
    run: ({ rows, profile }) => {
      assert(rows.length > 0, "没有解析到数据行");
      assert(profile.columnCount > 0, "没有解析到字段");
      assert(profile.rowCount === rows.length, "profile 行数与实际行数不一致");
      assert(
        (profile.dataQuality.parseMetadata?.confidence ?? 0) >= 0.6,
        "分隔符或编码识别置信度过低",
      );
    },
  },
  {
    name: "支持任意行窗口读取",
    run: ({ rows, profile }) => {
      const query: CsvDataQuery = { type: "rows", startRow: 2, limit: 5 };
      const result = executeDataQuery(rows, query, profile.dataQuality);
      assert(result.rows !== undefined, "未返回行数据");
      assert(
        result.rows.length === Math.min(5, Math.max(rows.length - 1, 0)),
        "行窗口数量不正确",
      );
      assert(
        result.rows[0]?.rowNumber === 2 || rows.length === 1,
        "rowNumber 未按原始行号返回",
      );
    },
  },
  {
    name: "支持指定列读取并跳过非法列",
    run: ({ rows, profile }) => {
      const columns = profile.columns.slice(0, 3).map((column) => column.name);
      const query: CsvDataQuery = {
        type: "columns",
        columns: [...columns, "__not_exists__"],
        startRow: 1,
        limit: 3,
      };
      const result = executeDataQuery(rows, query, profile.dataQuality);
      assert(result.rows !== undefined, "未返回列读取结果");
      assert(
        result.rows.length === Math.min(3, rows.length),
        "列读取行数不正确",
      );
      assert(
        result.warnings.some((warning) => warning.includes("字段不存在")),
        "未提示非法列已跳过",
      );
      for (const row of result.rows) {
        for (const column of columns) {
          assert(column in row, `返回结果缺少字段：${column}`);
        }
      }
    },
  },
  {
    name: "支持字段唯一值探索",
    run: ({ rows, profile }) => {
      const dimensionColumn =
        findColumnByType(profile, "string") ?? profile.columns[0]?.name;
      assert(Boolean(dimensionColumn), "没有可探索的字段");
      const result = executeDataQuery(
        rows,
        { type: "distinctValues", column: dimensionColumn, limit: 10 },
        profile.dataQuality,
      );
      assert(result.values !== undefined, "未返回唯一值结果");
      assert(result.values.length > 0, "唯一值为空");
      assert(result.values.length <= 10, "唯一值数量未按 limit 截断");
    },
  },
  {
    name: "支持列统计分析",
    run: ({ rows, profile }) => {
      const metricColumn =
        findColumnByType(profile, "number") ?? profile.columns[0]?.name;
      assert(Boolean(metricColumn), "没有可统计的字段");
      const result = executeDataQuery(
        rows,
        { type: "columnStats", column: metricColumn },
        profile.dataQuality,
      );
      assert(result.stats !== undefined, "未返回统计结果");
      assert(result.stats.rowCount === rows.length, "统计行数不正确");
      assert(
        typeof result.stats.distinctCount === "number",
        "缺少 distinctCount",
      );
    },
  },
  {
    name: "支持筛选后读取明细",
    run: ({ rows, profile }) => {
      const filter = createSampleFilter(rows, profile);
      const columns = profile.columns.slice(0, 5).map((column) => column.name);
      const result = executeDataQuery(
        rows,
        { type: "filterRows", filters: [filter], columns, limit: 5 },
        profile.dataQuality,
      );
      assert(result.rows !== undefined, "未返回筛选明细");
      assert((result.matchedRowCount ?? 0) > 0, "筛选条件未匹配任何行");
      assert(result.rows.length <= 5, "筛选明细未按 limit 截断");
    },
  },
  {
    name: "支持自动聚合分析计划",
    run: ({ rows, profile }) => {
      const plan = createFallbackPlan(profile);
      const result = executeDataQuery(
        rows,
        { type: "aggregate", plan },
        profile.dataQuality,
      );
      assert(result.aggregateResult !== undefined, "未返回聚合分析结果");
      assert(
        result.aggregateResult.rowCount === rows.length,
        "聚合输入行数不正确",
      );
      assert(result.aggregateResult.resultRows.length > 0, "聚合结果为空");
    },
  },
  {
    name: "聚合计划缺省 filters 时仍可执行",
    run: ({ rows, profile }) => {
      const groupColumn = profile.columns[0]?.name;
      assert(groupColumn, "没有可分组字段");
      const plan = {
        goal: "test_missing_filters",
        groupBy: [groupColumn],
        metrics: [{ name: "row_count", field: groupColumn, agg: "count" }],
        ranking: { sortBy: "row_count", direction: "desc", limit: 10 },
      } as unknown as AnalysisPlan;

      const result = executeDataQuery(
        rows,
        { type: "aggregate", plan },
        profile.dataQuality,
      );

      assert(result.aggregateResult !== undefined, "未返回聚合分析结果");
      assert(result.aggregateResult.resultRows.length > 0, "聚合结果为空");
    },
  },
  {
    name: "校验后的 count 聚合默认按 count 降序排序",
    run: ({ rows, profile }) => {
      const groupColumn =
        profile.columns.find((column) => column.type === "string")?.name ??
        profile.columns[0]?.name;
      assert(groupColumn, "没有可分组字段");

      const validation = validateAnalysisPlan(
        {
          goal: "test_count_popularity",
          groupBy: [groupColumn],
          metrics: [{ name: "row_count", field: groupColumn, agg: "count" }],
        },
        profile,
      );
      const result = executeDataQuery(
        rows,
        { type: "aggregate", plan: validation.plan },
        profile.dataQuality,
      );
      const counts =
        result.aggregateResult?.resultRows.map((row) => Number(row.row_count)) ??
        [];

      assert(counts.length > 0, "聚合结果为空");
      assert(isSortedDesc(counts), "count 聚合未按 row_count 降序排序");
    },
  },
  {
    name: "支持自定义数值聚合与排序",
    run: ({ rows, profile }) => {
      const groupColumn =
        findColumnByType(profile, "string") ?? profile.columns[0]?.name;
      const metricColumn = findColumnByType(profile, "number");
      assert(groupColumn, "没有可分组字段");
      assert(metricColumn, "没有数值字段可聚合");
      const safeGroupColumn = groupColumn;
      const safeMetricColumn = metricColumn;
      const plan: AnalysisPlan = {
        goal: "test_custom_sum",
        requiredFields: [safeGroupColumn, safeMetricColumn],
        filters: [],
        groupBy: [safeGroupColumn],
        metrics: [{ name: "test_sum", field: safeMetricColumn, agg: "sum" }],
        ranking: { sortBy: "test_sum", direction: "desc", limit: 10 },
      };
      const result = executeDataQuery(
        rows,
        { type: "aggregate", plan },
        profile.dataQuality,
      );
      const resultRows = result.aggregateResult?.resultRows ?? [];
      assert(resultRows.length > 0, "自定义聚合结果为空");
      assert(
        isSortedDesc(resultRows.map((row) => Number(row.test_sum ?? 0))),
        "聚合结果未按降序排序",
      );
    },
  },
  {
    name: "聚合排序会将空指标排在末尾并返回非空计数",
    run: ({ rows, profile }) => {
      const groupColumn =
        findColumnByType(profile, "string") ?? profile.columns[0]?.name;
      const metricColumn = findColumnByType(profile, "number");
      assert(groupColumn, "没有可分组字段");
      assert(metricColumn, "没有数值字段可聚合");

      const result = executeDataQuery(
        rows,
        {
          type: "aggregate",
          plan: {
            goal: "test_null_sort_and_non_null_count",
            requiredFields: [groupColumn, metricColumn],
            filters: [],
            groupBy: [groupColumn],
            metrics: [
              { name: "avg_metric", field: metricColumn, agg: "avg" },
            ],
            ranking: { sortBy: "avg_metric", direction: "asc", limit: 20 },
          },
        },
        profile.dataQuality,
      );
      const resultRows = result.aggregateResult?.resultRows ?? [];

      assert(resultRows.length > 0, "聚合结果为空");
      assert(
        resultRows[0]?.avg_metric !== null,
        "空指标不应排在升序结果首位",
      );
      assert(
        "avg_metric__non_null_count" in resultRows[0],
        "聚合结果缺少非空计数字段",
      );
    },
  },
  {
    name: "count 聚合会返回字段非空计数",
    run: ({ rows, profile }) => {
      const columnWithMissing = profile.columns.find(
        (column) => column.missingCount > 0,
      );
      if (!columnWithMissing) {
        return;
      }

      const result = executeDataQuery(
        rows,
        {
          type: "aggregate",
          plan: {
            goal: "test_count_non_null_count",
            requiredFields: [columnWithMissing.name],
            filters: [],
            groupBy: [],
            metrics: [
              { name: "row_count", field: columnWithMissing.name, agg: "count" },
            ],
            ranking: { sortBy: "row_count", direction: "desc", limit: 1 },
          },
        },
        profile.dataQuality,
      );
      const row = result.aggregateResult?.resultRows[0];

      assert(row, "聚合结果为空");
      assert(row.row_count === rows.length, "count 聚合行数不正确");
      assert(
        row.row_count__non_null_count === rows.length - columnWithMissing.missingCount,
        "count 聚合的非空计数不正确",
      );
    },
  },
  {
    name: "支持 notEmpty 筛选",
    run: ({ rows, profile }) => {
      const columnWithMissing = profile.columns.find(
        (column) => column.missingCount > 0,
      );
      if (!columnWithMissing) {
        return;
      }

      const result = executeDataQuery(
        rows,
        {
          type: "filterRows",
          filters: [{ field: columnWithMissing.name, op: "notEmpty" }],
          columns: [columnWithMissing.name],
          limit: 20,
        },
        profile.dataQuality,
      );

      assert(result.rows !== undefined, "未返回筛选明细");
      assert(
        result.rows.every((row) => String(row[columnWithMissing.name] ?? "").trim()),
        "notEmpty 筛选返回了空值",
      );
    },
  },
];

async function main() {
  const files = (await readdir(dataDir))
    .filter((fileName) => fileName.toLowerCase().endsWith(".csv"))
    .sort();

  assert(files.length > 0, "./data 下没有 CSV 文件");

  let total = 0;
  let failed = 0;
  for (const fileName of files) {
    const context = await loadCsvFile(fileName);
    console.log(`\n[FILE] ${fileName}`);
    console.log(
      `rows=${context.profile.rowCount}, columns=${context.profile.columnCount}, encoding=${context.profile.dataQuality.parseMetadata?.encoding}, delimiter=${context.profile.dataQuality.parseMetadata?.delimiterName}`,
    );

    const results = testCases.map((testCase) => runTestCase(testCase, context));
    for (const result of results) {
      total += 1;
      if (result.status === "FAIL") failed += 1;
      console.log(
        `${result.status === "PASS" ? "✅" : "❌"} ${result.name} - ${result.details}`,
      );
    }
  }

  console.log(`\n[SUMMARY] ${total - failed}/${total} passed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

async function loadCsvFile(fileName: string): Promise<CsvFileContext> {
  const filePath = path.join(dataDir, fileName);
  const buffer = await readFile(filePath);
  const decoded = decodeCsvText(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
  );
  const parsed = parseCsv(decoded.text, decoded.encoding);
  const profile = createCsvProfile(
    { name: fileName, size: buffer.byteLength },
    parsed,
  );

  return {
    fileName,
    fileSize: buffer.byteLength,
    rows: parsed.rows,
    profile,
  };
}

function runTestCase(testCase: TestCase, context: CsvFileContext): TestResult {
  try {
    testCase.run(context);
    return { name: testCase.name, status: "PASS", details: "ok" };
  } catch (error) {
    return {
      name: testCase.name,
      status: "FAIL",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

function findColumnByType(profile: CsvProfile, type: "string" | "number") {
  return profile.columns.find((column) => column.type === type)?.name;
}

function createSampleFilter(rows: CsvRow[], profile: CsvProfile) {
  const stringColumn = findColumnByType(profile, "string");
  if (stringColumn) {
    const value = rows.find((row) => row[stringColumn]?.trim())?.[stringColumn];
    if (value) {
      return { field: stringColumn, op: "eq" as const, value };
    }
  }

  const numberColumn = findColumnByType(profile, "number");
  if (numberColumn) {
    const value = rows
      .map((row) => parseNumber(row[numberColumn]))
      .find((item) => item !== null);
    if (value !== undefined && value !== null) {
      return { field: numberColumn, op: "gte" as const, value };
    }
  }

  const fallbackColumn = profile.columns[0]?.name;
  assert(fallbackColumn, "没有可筛选字段");
  return { field: fallbackColumn, op: "contains" as const, value: "" };
}

function isSortedDesc(values: number[]) {
  return values.every(
    (value, index) => index === 0 || values[index - 1] >= value,
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

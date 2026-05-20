import {
  DEFAULT_RESULT_LIMIT,
  MAX_GROUP_BY_FIELDS,
  MAX_RESULT_ROWS,
  type AnalysisPlan,
  type CsvColumnProfile,
  type FilterOperator,
  type MetricAggregator,
  type MetricRule,
} from "./csv-types";

const ALLOWED_AGGS: MetricAggregator[] = ["sum", "avg", "min", "max", "count"];
const ALLOWED_OPS: FilterOperator[] = [
  "eq",
  "contains",
  "between",
  "gte",
  "lte",
  "notEmpty",
];

export interface PlanValidationResult {
  plan: AnalysisPlan;
  warnings: string[];
}

type PlanValidationColumn = Pick<
  CsvColumnProfile,
  "name" | "type" | "semanticType"
>;

type PlanValidationProfile = {
  columns: PlanValidationColumn[];
};

export function validateAnalysisPlan(
  candidate: unknown,
  profile: PlanValidationProfile,
): PlanValidationResult {
  const warnings: string[] = [];
  const fieldNames = new Set(profile.columns.map((column) => column.name));
  const rawPlan = toRecord(candidate);
  const fallback = createFallbackPlan(profile);

  if (!rawPlan) {
    return {
      plan: fallback,
      warnings: ["模型未返回可识别的分析计划，已使用默认聚合计划。"],
    };
  }

  const groupBy = normalizeStringArray(rawPlan.groupBy)
    .filter((field) => fieldNames.has(field))
    .slice(0, MAX_GROUP_BY_FIELDS);
  if (normalizeStringArray(rawPlan.groupBy).length !== groupBy.length) {
    warnings.push("已移除不存在或超出数量限制的 groupBy 字段。");
  }

  const filters = normalizeArray(rawPlan.filters)
    .map((filter) => toRecord(filter))
    .filter((filter): filter is Record<string, unknown> => Boolean(filter))
    .filter((filter) => {
      const field = asString(filter.field);
      const op = asString(filter.op) as FilterOperator;
      const valid =
        field !== null && fieldNames.has(field) && ALLOWED_OPS.includes(op);
      if (!valid) {
        warnings.push("已移除非法筛选条件。");
      }
      return valid;
    })
    .map((filter) => ({
      field: filter.field as string,
      op: filter.op as FilterOperator,
      value: normalizeFilterValue(filter.value),
    }));

  const metrics = normalizeMetrics(rawPlan.metrics, profile, warnings);
  if (metrics.length === 0) {
    metrics.push(...fallback.metrics);
    warnings.push("模型计划没有可执行指标，已补充默认指标。");
  }

  const requiredFields = normalizeStringArray(rawPlan.requiredFields).filter(
    (field) => fieldNames.has(field),
  );

  const metricNames = new Set(metrics.map((metric) => metric.name));
  const rankingRecord = toRecord(rawPlan.ranking);
  let ranking: AnalysisPlan["ranking"] = {
    sortBy: metrics[0]?.name ?? groupBy[0] ?? fallback.ranking?.sortBy ?? "row_count",
    direction: "desc",
    limit: DEFAULT_RESULT_LIMIT,
  };
  if (rankingRecord) {
    const sortBy = asString(rankingRecord.sortBy);
    const direction = rankingRecord.direction === "asc" ? "asc" : "desc";
    const rawLimit = Number(rankingRecord.limit);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), MAX_RESULT_ROWS)
        : DEFAULT_RESULT_LIMIT;

    if (
      sortBy &&
      (metricNames.has(sortBy) || groupBy.includes(sortBy) || fieldNames.has(sortBy))
    ) {
      ranking = { sortBy, direction, limit };
    } else {
      warnings.push("模型排序字段不可用，已使用默认排序。");
    }
  }

  const plan: AnalysisPlan = {
    goal: asString(rawPlan.goal) ?? "analyze_csv",
    requiredFields,
    filters,
    groupBy: groupBy.length > 0 ? groupBy : fallback.groupBy,
    metrics,
    ranking,
  };

  return { plan, warnings };
}

export function createFallbackPlan(profile: PlanValidationProfile): AnalysisPlan {
  const origin = findColumn(profile.columns, ["origin"]);
  const destination = findColumn(profile.columns, ["destination"]);
  const route = findColumn(profile.columns, ["route"]);
  const revenue = findColumn(profile.columns, ["revenue"]);
  const demand = findColumn(profile.columns, ["demand"]);
  const yieldColumn = findColumn(profile.columns, ["yield"]);
  const numberColumns = profile.columns.filter((column) => column.type === "number");
  const dimensionColumns = profile.columns.filter(
    (column) => column.type === "string" || column.type === "date",
  );

  const groupBy =
    origin && destination
      ? [origin.name, destination.name]
      : route
        ? [route.name]
        : dimensionColumns.slice(0, 1).map((column) => column.name);

  const metrics: MetricRule[] = [];
  if (revenue) {
    metrics.push({ name: safeMetricName("total", revenue.name), field: revenue.name, agg: "sum" });
  }
  if (demand) {
    metrics.push({ name: safeMetricName("total", demand.name), field: demand.name, agg: "sum" });
  }
  if (yieldColumn) {
    metrics.push({ name: safeMetricName("avg", yieldColumn.name), field: yieldColumn.name, agg: "avg" });
  }

  for (const column of numberColumns) {
    if (metrics.length >= 3) break;
    if (metrics.some((metric) => metric.field === column.name)) continue;
    metrics.push({
      name: safeMetricName("sum", column.name),
      field: column.name,
      agg: "sum",
    });
  }

  if (metrics.length === 0) {
    const countField = profile.columns[0]?.name ?? "";
    metrics.push({ name: "row_count", field: countField, agg: "count" });
  }

  const sortMetric = metrics[0]?.name ?? groupBy[0] ?? "row_count";

  return {
    goal: "default_csv_summary",
    requiredFields: [...groupBy, ...metrics.map((metric) => metric.field)].filter(Boolean),
    filters: [],
    groupBy,
    metrics,
    ranking: {
      sortBy: sortMetric,
      direction: "desc",
      limit: DEFAULT_RESULT_LIMIT,
    },
  };
}

function normalizeMetrics(
  rawMetrics: unknown,
  profile: PlanValidationProfile,
  warnings: string[],
): MetricRule[] {
  const fieldNames = new Set(profile.columns.map((column) => column.name));
  const columnByName = new Map(
    profile.columns.map((column) => [column.name, column]),
  );
  const metricNames = new Set<string>();

  return normalizeArray(rawMetrics)
    .map((metric) => toRecord(metric))
    .filter((metric): metric is Record<string, unknown> => Boolean(metric))
    .flatMap((metric) => {
      const field = asString(metric.field);
      const agg = asString(metric.agg) as MetricAggregator;
      const rawName = asString(metric.name);

      if (!field || !fieldNames.has(field) || !ALLOWED_AGGS.includes(agg)) {
        warnings.push("已移除非法指标。");
        return [];
      }

      const column = columnByName.get(field);
      if (agg !== "count" && column?.type !== "number") {
        warnings.push("已移除非数值字段上的数值聚合指标。");
        return [];
      }

      const name = ensureUniqueMetricName(
        rawName ? sanitizeIdentifier(rawName) : safeMetricName(agg, field),
        metricNames,
      );
      metricNames.add(name);

      return [{ name, field, agg }];
    });
}

function findColumn(
  columns: PlanValidationColumn[],
  semantics: NonNullable<CsvColumnProfile["semanticType"]>[],
): PlanValidationColumn | undefined {
  return columns.find((column) => semantics.includes(column.semanticType ?? "unknown"));
}

function safeMetricName(prefix: string, field: string) {
  return sanitizeIdentifier(`${prefix}_${field}`);
}

function sanitizeIdentifier(value: string) {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return sanitized || "metric";
}

function ensureUniqueMetricName(name: string, seen: Set<string>) {
  if (!seen.has(name)) {
    return name;
  }

  let index = 2;
  while (seen.has(`${name}_${index}`)) {
    index += 1;
  }
  return `${name}_${index}`;
}

function normalizeFilterValue(
  value: unknown,
): string | number | [string | number, string | number] {
  if (Array.isArray(value)) {
    const first = normalizeSingleValue(value[0]);
    const second = normalizeSingleValue(value[1]);
    return [first, second];
  }

  return normalizeSingleValue(value);
}

function normalizeSingleValue(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    return value;
  }

  return String(value ?? "");
}

function normalizeStringArray(value: unknown): string[] {
  return normalizeArray(value).flatMap((item) => {
    const text = asString(item);
    return text ? [text] : [];
  });
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

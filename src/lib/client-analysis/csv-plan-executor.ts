import {
  MAX_RESULT_ROWS,
  type AnalysisPlan,
  type AnalysisResult,
  type CsvDataQuality,
  type CsvRow,
  type MetricRule,
} from "./csv-types";
import { parseDate, parseNumber } from "./csv-profiler";

type MetricState = {
  sum: number;
  count: number;
  min: number | null;
  max: number | null;
};

type GroupState = {
  groupValues: Record<string, string>;
  metrics: Record<string, MetricState>;
};

export function executeAnalysisPlan(
  rows: CsvRow[],
  plan: AnalysisPlan,
  dataQuality: CsvDataQuality,
): AnalysisResult {
  const warnings: string[] = [];
  const groupMap = new Map<string, GroupState>();
  let matchedRowCount = 0;

  for (const row of rows) {
    if (!matchesFilters(row, plan)) {
      continue;
    }

    matchedRowCount += 1;
    const groupValues = getGroupValues(row, plan.groupBy);
    const groupKey = getGroupKey(groupValues);
    const state =
      groupMap.get(groupKey) ?? createGroupState(groupValues, plan.metrics);

    for (const metric of plan.metrics) {
      updateMetricState(state.metrics[metric.name], row, metric);
    }

    groupMap.set(groupKey, state);
  }

  const resultRows = Array.from(groupMap.values()).map((state) => {
    const resultRow: Record<string, string | number | null> = {
      ...state.groupValues,
    };

    for (const metric of plan.metrics) {
      resultRow[metric.name] = finalizeMetric(state.metrics[metric.name], metric);
    }

    return resultRow;
  });

  sortRows(resultRows, plan);
  const limit = Math.min(plan.ranking?.limit ?? MAX_RESULT_ROWS, MAX_RESULT_ROWS);
  const limitedRows = resultRows.slice(0, limit);

  if (matchedRowCount === 0) {
    warnings.push("筛选后没有匹配行，请调整问题或筛选条件。");
  }

  if (resultRows.length > limitedRows.length) {
    warnings.push(`结果已截断为前 ${limitedRows.length} 行。`);
  }

  return {
    plan,
    rowCount: rows.length,
    matchedRowCount,
    resultRows: limitedRows,
    dataQuality,
    warnings: [...dataQuality.warnings, ...warnings],
  };
}

function matchesFilters(row: CsvRow, plan: AnalysisPlan): boolean {
  return plan.filters.every((filter) => {
    const rawValue = row[filter.field] ?? "";
    const compareValue = filter.value;

    if (filter.op === "contains") {
      return rawValue
        .toLowerCase()
        .includes(String(compareValue).toLowerCase());
    }

    if (filter.op === "eq") {
      return rawValue.toLowerCase() === String(compareValue).toLowerCase();
    }

    if (filter.op === "between") {
      if (!Array.isArray(compareValue)) return true;
      const rawNumber = parseNumber(rawValue);
      const startNumber = parseNumber(compareValue[0]);
      const endNumber = parseNumber(compareValue[1]);
      if (rawNumber !== null && startNumber !== null && endNumber !== null) {
        return rawNumber >= startNumber && rawNumber <= endNumber;
      }

      const rawDate = parseDate(rawValue)?.getTime();
      const startDate = parseDate(String(compareValue[0]))?.getTime();
      const endDate = parseDate(String(compareValue[1]))?.getTime();
      if (rawDate && startDate && endDate) {
        return rawDate >= startDate && rawDate <= endDate;
      }

      return rawValue >= String(compareValue[0]) && rawValue <= String(compareValue[1]);
    }

    const rawNumber = parseNumber(rawValue);
    const filterNumber = parseNumber(compareValue as string | number);
    if (rawNumber !== null && filterNumber !== null) {
      return filter.op === "gte"
        ? rawNumber >= filterNumber
        : rawNumber <= filterNumber;
    }

    const rawDate = parseDate(rawValue)?.getTime();
    const filterDate = parseDate(String(compareValue))?.getTime();
    if (rawDate && filterDate) {
      return filter.op === "gte" ? rawDate >= filterDate : rawDate <= filterDate;
    }

    return filter.op === "gte"
      ? rawValue >= String(compareValue)
      : rawValue <= String(compareValue);
  });
}

function getGroupValues(row: CsvRow, groupBy: string[]) {
  if (groupBy.length === 0) {
    return { all_rows: "All rows" };
  }

  return Object.fromEntries(
    groupBy.map((field) => [field, row[field]?.trim() || "(empty)"]),
  );
}

function getGroupKey(groupValues: Record<string, string>) {
  return Object.entries(groupValues)
    .map(([field, value]) => `${field}:${value}`)
    .join("\u001f");
}

function createGroupState(
  groupValues: Record<string, string>,
  metrics: MetricRule[],
): GroupState {
  return {
    groupValues,
    metrics: Object.fromEntries(
      metrics.map((metric) => [
        metric.name,
        { sum: 0, count: 0, min: null, max: null } satisfies MetricState,
      ]),
    ),
  };
}

function updateMetricState(state: MetricState, row: CsvRow, metric: MetricRule) {
  if (metric.agg === "count") {
    state.count += 1;
    return;
  }

  const value = parseNumber(row[metric.field]);
  if (value === null) {
    return;
  }

  state.sum += value;
  state.count += 1;
  state.min = state.min === null ? value : Math.min(state.min, value);
  state.max = state.max === null ? value : Math.max(state.max, value);
}

function finalizeMetric(state: MetricState, metric: MetricRule): number | null {
  if (metric.agg === "count") {
    return state.count;
  }

  if (state.count === 0) {
    return null;
  }

  if (metric.agg === "sum") {
    return roundNumber(state.sum);
  }

  if (metric.agg === "avg") {
    return roundNumber(state.sum / state.count);
  }

  if (metric.agg === "min") {
    return state.min;
  }

  return state.max;
}

function sortRows(
  rows: Array<Record<string, string | number | null>>,
  plan: AnalysisPlan,
) {
  const ranking = plan.ranking;
  if (!ranking) {
    return;
  }

  const directionMultiplier = ranking.direction === "asc" ? 1 : -1;
  rows.sort((left, right) => {
    const leftValue = left[ranking.sortBy];
    const rightValue = right[ranking.sortBy];

    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return (leftValue - rightValue) * directionMultiplier;
    }

    return String(leftValue ?? "").localeCompare(String(rightValue ?? "")) * directionMultiplier;
  });
}

function roundNumber(value: number) {
  return Math.round(value * 10000) / 10000;
}

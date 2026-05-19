import {
  MAX_QUERY_COLUMNS,
  MAX_QUERY_DISTINCT_VALUES,
  MAX_QUERY_RESULT_ROWS,
  MAX_RESULT_ROWS,
  type AnalysisPlan,
  type AnalysisResult,
  type CsvDataQuality,
  type CsvDataQuery,
  type CsvDataQueryResult,
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

type IndexedCsvRow = {
  row: CsvRow;
  rowNumber: number;
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

export function executeDataQuery(
  rows: CsvRow[],
  query: CsvDataQuery,
  dataQuality: CsvDataQuality,
): CsvDataQueryResult {
  const warnings: string[] = [];
  const allColumns = Object.keys(rows[0] ?? {});
  const indexedRows = rows.map((row, index) => ({
    row,
    rowNumber: index + 1,
  }));

  if (query.type === "aggregate") {
    return {
      query,
      rowCount: rows.length,
      aggregateResult: executeAnalysisPlan(rows, query.plan, dataQuality),
      warnings,
    };
  }

  if (query.type === "rows") {
    const selectedRows = selectRowsByPosition(indexedRows, query, warnings);
    return {
      query,
      rowCount: rows.length,
      matchedRowCount: selectedRows.length,
      rows: projectRows(selectedRows, query.columns, allColumns, warnings),
      warnings,
    };
  }

  if (query.type === "columns") {
    const start = normalizeStartRow(query.startRow);
    const limit = normalizeLimit(query.limit);
    const selectedRows = indexedRows.slice(start, start + limit);
    return {
      query,
      rowCount: rows.length,
      matchedRowCount: selectedRows.length,
      rows: projectRows(selectedRows, query.columns, allColumns, warnings),
      warnings,
    };
  }

  if (query.type === "filterRows") {
    const plan: AnalysisPlan = {
      goal: "query_filter_rows",
      requiredFields: [],
      filters: query.filters,
      groupBy: [],
      metrics: [{ name: "row_count", field: allColumns[0] ?? "", agg: "count" }],
    };
    const limit = normalizeLimit(query.limit);
    const matchedRows = indexedRows.filter(({ row }) => matchesFilters(row, plan));
    return {
      query,
      rowCount: rows.length,
      matchedRowCount: matchedRows.length,
      rows: projectRows(matchedRows.slice(0, limit), query.columns, allColumns, warnings),
      warnings: [
        ...warnings,
        ...(matchedRows.length > limit
          ? [`筛选结果已截断为前 ${limit} 行。`]
          : []),
      ],
    };
  }

  if (query.type === "distinctValues") {
    if (!allColumns.includes(query.column)) {
      return {
        query,
        rowCount: rows.length,
        values: [],
        warnings: [`字段不存在：${query.column}`],
      };
    }

    const limit = Math.min(
      normalizeLimit(query.limit, MAX_QUERY_DISTINCT_VALUES),
      MAX_QUERY_DISTINCT_VALUES,
    );
    const values = Array.from(
      new Set(rows.map((row) => row[query.column] ?? "").filter(Boolean)),
    );

    return {
      query,
      rowCount: rows.length,
      matchedRowCount: values.length,
      values: values.slice(0, limit),
      warnings:
        values.length > limit ? [`唯一值已截断为前 ${limit} 个。`] : warnings,
    };
  }

  if (!allColumns.includes(query.column)) {
    return {
      query,
      rowCount: rows.length,
      stats: {},
      warnings: [`字段不存在：${query.column}`],
    };
  }

  return {
    query,
    rowCount: rows.length,
    stats: buildColumnStats(rows, query.column),
    warnings,
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

function selectRowsByPosition(
  rows: IndexedCsvRow[],
  query: Extract<CsvDataQuery, { type: "rows" }>,
  warnings: string[],
) {
  if (query.rowNumbers?.length) {
    const selectedRows = query.rowNumbers.flatMap((rowNumber) => {
      const index = Math.floor(rowNumber) - 1;
      return rows[index] ? [rows[index]] : [];
    });
    if (selectedRows.length < query.rowNumbers.length) {
      warnings.push("部分行号超出 CSV 范围，已跳过。");
    }
    return selectedRows.slice(0, normalizeLimit(query.limit));
  }

  const start = normalizeStartRow(query.startRow);
  const limit = normalizeLimit(query.limit);
  return rows.slice(start, start + limit);
}

function projectRows(
  rows: IndexedCsvRow[],
  requestedColumns: string[] | undefined,
  allColumns: string[],
  warnings: string[],
) {
  const columns = normalizeColumns(requestedColumns, allColumns, warnings);
  return rows.map(({ row, rowNumber }) => ({
    ...Object.fromEntries(columns.map((column) => [column, row[column] ?? ""])),
    rowNumber,
  }));
}

function normalizeColumns(
  requestedColumns: string[] | undefined,
  allColumns: string[],
  warnings: string[],
) {
  const validColumns =
    requestedColumns?.filter((column) => allColumns.includes(column)) ?? allColumns;
  if (requestedColumns && validColumns.length < requestedColumns.length) {
    warnings.push("部分请求字段不存在，已跳过。");
  }

  if (validColumns.length > MAX_QUERY_COLUMNS) {
    warnings.push(`字段过多，已截断为前 ${MAX_QUERY_COLUMNS} 列。`);
  }

  return validColumns.slice(0, MAX_QUERY_COLUMNS);
}

function normalizeStartRow(startRow: number | undefined) {
  if (!Number.isFinite(startRow) || !startRow || startRow < 1) {
    return 0;
  }

  return Math.floor(startRow) - 1;
}

function normalizeLimit(limit: number | undefined, fallback = MAX_QUERY_RESULT_ROWS) {
  if (!Number.isFinite(limit) || !limit || limit < 1) {
    return fallback;
  }

  return Math.min(Math.floor(limit), fallback);
}

function buildColumnStats(rows: CsvRow[], column: string) {
  const values = rows.map((row) => row[column] ?? "");
  const nonEmptyValues = values.filter((value) => value.trim() !== "");
  const numericValues = nonEmptyValues.flatMap((value) => {
    const number = parseNumber(value);
    return number === null ? [] : [number];
  });
  const distinctValues = new Set(nonEmptyValues);

  return {
    rowCount: rows.length,
    nonEmptyCount: nonEmptyValues.length,
    missingCount: rows.length - nonEmptyValues.length,
    distinctCount: distinctValues.size,
    min:
      numericValues.length > 0
        ? Math.min(...numericValues)
        : Array.from(distinctValues).sort()[0] ?? null,
    max:
      numericValues.length > 0
        ? Math.max(...numericValues)
        : Array.from(distinctValues).sort().at(-1) ?? null,
    avg:
      numericValues.length > 0
        ? roundNumber(
            numericValues.reduce((total, value) => total + value, 0) /
              numericValues.length,
          )
        : null,
  };
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

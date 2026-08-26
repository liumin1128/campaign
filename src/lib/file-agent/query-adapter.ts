import { decodeFileCursor, encodeFileCursor } from "./cursor";
import { limitResultItems } from "./result-limits";
import { iterateTabularRows } from "./tabular-adapter";
import type {
  FileAgentLimits,
  FileQueryItem,
  FileQueryRequest,
  FileQueryResult,
  GenericFileDescriptor,
  GenericFileFilter,
  GenericFileMetric,
} from "./types";

const MAX_COLUMNS = 200;
const MAX_GROUPS = 50_000;
const MAX_DISTINCT_TRACKED = 20_000;
const MAX_RETURNED_ROWS = 100;

type ColumnProfile = {
  nonEmpty: number;
  numeric: number;
  boolean: number;
  min: number | null;
  max: number | null;
  sum: number;
  samples: Set<string>;
};

type MetricState = {
  count: number;
  numeric: number;
  sum: number;
  min: number | null;
  max: number | null;
};

export async function queryTextDataFile(args: {
  file: File;
  descriptor: GenericFileDescriptor;
  request: FileQueryRequest;
  limits: FileAgentLimits;
  isCancelled: () => boolean;
}): Promise<FileQueryResult> {
  switch (args.request.operation) {
    case "profile":
      return profileFile(args);
    case "count":
      return countRows(args);
    case "distinct":
      return distinctValues(args);
    case "stats":
      return columnStats(args);
    case "filter":
      return filterRows(args);
    case "aggregate":
      return aggregateRows(args);
    case "top":
      return topRows(args);
  }
}

async function profileFile(args: QueryArgs): Promise<FileQueryResult> {
  const profiles = new Map<string, ColumnProfile>();
  let rowCount = 0;

  for await (const { row } of rows(args)) {
    rowCount += 1;
    for (const [field, value] of Object.entries(row).slice(0, MAX_COLUMNS)) {
      const profile = profiles.get(field) ?? createColumnProfile();
      updateColumnProfile(profile, value);
      profiles.set(field, profile);
    }
  }

  const items = [...profiles.entries()].map(([field, profile]) => ({
    field,
    nonEmpty: profile.nonEmpty,
    numeric: profile.numeric,
    boolean: profile.boolean,
    min: profile.min,
    max: profile.max,
    average: profile.numeric > 0 ? profile.sum / profile.numeric : null,
    samples: [...profile.samples].join(" | "),
  }));

  return envelope(args, {
    summary: `Profiled ${rowCount} rows and ${items.length} columns in ${args.descriptor.name}.`,
    items,
    total: items.length,
    stats: { rowCount, columnCount: items.length },
  });
}

async function countRows(args: QueryArgs): Promise<FileQueryResult> {
  let rowCount = 0;
  for await (const { row } of rows(args)) {
    if (matchesFilters(row, args.request.filters ?? [])) rowCount += 1;
  }
  return envelope(args, {
    summary: `Counted ${rowCount} matching rows in ${args.descriptor.name}.`,
    items: [{ count: rowCount }],
    stats: { count: rowCount },
  });
}

async function distinctValues(args: QueryArgs): Promise<FileQueryResult> {
  const column = requireColumn(args.request.column);
  const values = new Set<string>();
  let capped = false;

  for await (const { row } of rows(args)) {
    if (!matchesFilters(row, args.request.filters ?? [])) continue;
    const value = scalarText(row[column]).slice(0, 2_000);
    if (!value) continue;
    if (values.size >= MAX_DISTINCT_TRACKED) {
      capped = true;
      break;
    }
    values.add(value);
  }

  const limit = queryLimit(args.request.limit);
  const items = [...values].slice(0, limit).map((value) => ({ value }));
  return envelope(args, {
    summary: `Found ${values.size}${capped ? "+" : ""} distinct values for ${column}.`,
    items,
    total: capped ? undefined : values.size,
    warnings: capped ? [`Distinct tracking stopped at ${MAX_DISTINCT_TRACKED} values.`] : [],
  });
}

async function columnStats(args: QueryArgs): Promise<FileQueryResult> {
  const column = requireColumn(args.request.column);
  const profile = createColumnProfile();
  let rowsSeen = 0;

  for await (const { row } of rows(args)) {
    if (!matchesFilters(row, args.request.filters ?? [])) continue;
    rowsSeen += 1;
    updateColumnProfile(profile, row[column]);
  }

  const stats = {
    rows: rowsSeen,
    nonEmpty: profile.nonEmpty,
    numeric: profile.numeric,
    min: profile.min,
    max: profile.max,
    average: profile.numeric > 0 ? profile.sum / profile.numeric : null,
  };
  return envelope(args, {
    summary: `Calculated statistics for ${column} across ${rowsSeen} matching rows.`,
    items: [stats],
    stats,
  });
}

async function filterRows(args: QueryArgs): Promise<FileQueryResult> {
  const cursor = decodeFileCursor(args.request.cursor);
  if (cursor && cursor.type !== "line") throw new Error("Query cursor type does not match row queries");
  const startRow = cursor?.type === "line" ? cursor.line : 1;
  const limit = queryLimit(args.request.limit);
  const selected: FileQueryItem[] = [];
  let lastRow = startRow - 1;

  for await (const entry of rows(args)) {
    if (entry.rowNumber < startRow) continue;
    lastRow = entry.rowNumber;
    if (!matchesFilters(entry.row, args.request.filters ?? [])) continue;
    selected.push({ _row: entry.rowNumber, ...projectRow(entry.row, args.request.columns) });
    if (selected.length >= limit) break;
  }

  const nextCursor = selected.length >= limit
    ? encodeFileCursor({ type: "line", line: lastRow + 1 })
    : undefined;
  return envelope(args, {
    summary: `Returned ${selected.length} bounded matching rows from ${args.descriptor.name}.`,
    items: selected,
    nextCursor,
    cursorAfterItem: (item) =>
      encodeFileCursor({ type: "line", line: Number(item._row) + 1 }),
  });
}

async function aggregateRows(args: QueryArgs): Promise<FileQueryResult> {
  const groupBy = [...new Set(args.request.groupBy ?? [])].slice(0, 3);
  const metrics = normalizeMetrics(args.request.metrics);
  const groups = new Map<string, { dimensions: FileQueryItem; metrics: Map<string, MetricState> }>();
  let matchedRows = 0;
  let groupCapReached = false;

  for await (const { row } of rows(args)) {
    if (!matchesFilters(row, args.request.filters ?? [])) continue;
    matchedRows += 1;
    const dimensions = Object.fromEntries(
      groupBy.map((field) => [field, toOutputScalar(row[field])]),
    );
    const key = JSON.stringify(dimensions);
    let group = groups.get(key);
    if (!group) {
      if (groups.size >= MAX_GROUPS) {
        groupCapReached = true;
        continue;
      }
      group = {
        dimensions,
        metrics: new Map(metrics.map((metric) => [metric.name, createMetricState()])),
      };
      groups.set(key, group);
    }
    for (const metric of metrics) updateMetric(group.metrics.get(metric.name)!, metric, row);
  }

  const items = [...groups.values()].map((group) => {
    const item: FileQueryItem = { ...group.dimensions };
    for (const metric of metrics) item[metric.name] = finalizeMetric(group.metrics.get(metric.name)!, metric);
    return item;
  });
  sortItems(items, args.request.sortBy ?? metrics[0]?.name, args.request.direction ?? "desc");
  const limit = queryLimit(args.request.limit);

  return envelope(args, {
    summary: `Aggregated ${matchedRows} matching rows into ${groups.size}${groupCapReached ? "+" : ""} groups.`,
    items: items.slice(0, limit),
    total: groupCapReached ? undefined : groups.size,
    stats: { matchedRows, groups: groups.size },
    warnings: groupCapReached ? [`Group tracking stopped at ${MAX_GROUPS} groups.`] : [],
  });
}

async function topRows(args: QueryArgs): Promise<FileQueryResult> {
  const column = requireColumn(args.request.column ?? args.request.sortBy);
  const limit = queryLimit(args.request.limit);
  const direction = args.request.direction ?? "desc";
  const selected: FileQueryItem[] = [];

  for await (const { row } of rows(args)) {
    if (!matchesFilters(row, args.request.filters ?? [])) continue;
    const projected = projectRow(row, args.request.columns);
    if (!(column in projected)) projected[column] = toOutputScalar(row[column]);
    selected.push(projected);
    sortItems(selected, column, direction);
    if (selected.length > limit) selected.pop();
  }

  return envelope(args, {
    summary: `Returned the top ${selected.length} rows ordered by ${column}.`,
    items: selected,
  });
}

type QueryArgs = {
  file: File;
  descriptor: GenericFileDescriptor;
  request: FileQueryRequest;
  limits: FileAgentLimits;
  isCancelled: () => boolean;
};

function rows(args: QueryArgs) {
  return iterateTabularRows(args);
}

function envelope(
  args: QueryArgs,
  result: {
    summary: string;
    items: FileQueryItem[];
    total?: number;
    nextCursor?: string;
    cursorAfterItem?: (item: FileQueryItem) => string;
    warnings?: string[];
    stats?: Record<string, string | number | null>;
  },
): FileQueryResult {
  return {
    ...limitResultItems({
      summary: result.summary,
      items: result.items,
      maxBytes: args.limits.maxToolResultBytes,
      total: result.total,
      nextCursor: result.nextCursor,
      cursorAfterItem: result.cursorAfterItem,
      warnings: result.warnings,
    }),
    ...(result.stats ? { stats: result.stats } : {}),
  };
}

function matchesFilters(row: FileQueryItem, filters: GenericFileFilter[]) {
  return filters.every((filter) => {
    const value = row[filter.field];
    const text = scalarText(value);
    switch (filter.op) {
      case "notEmpty":
        return text.trim() !== "";
      case "contains":
        return text.toLocaleLowerCase().includes(String(filter.value ?? "").toLocaleLowerCase());
      case "eq":
        return compareScalar(value, filter.value) === 0;
      case "gte":
        return compareScalar(value, filter.value) >= 0;
      case "lte":
        return compareScalar(value, filter.value) <= 0;
      case "between": {
        if (!Array.isArray(filter.value)) return false;
        return compareScalar(value, filter.value[0]) >= 0 && compareScalar(value, filter.value[1]) <= 0;
      }
    }
  });
}

function compareScalar(left: unknown, right: unknown) {
  const leftNumber = parseNumeric(left);
  const rightNumber = parseNumeric(right);
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
  return scalarText(left).localeCompare(scalarText(right));
}

function createColumnProfile(): ColumnProfile {
  return { nonEmpty: 0, numeric: 0, boolean: 0, min: null, max: null, sum: 0, samples: new Set() };
}

function updateColumnProfile(profile: ColumnProfile, value: unknown) {
  const text = scalarText(value).trim();
  if (!text) return;
  profile.nonEmpty += 1;
  if (typeof value === "boolean" || /^(true|false)$/i.test(text)) profile.boolean += 1;
  const number = parseNumeric(value);
  if (number !== null) {
    profile.numeric += 1;
    profile.sum += number;
    profile.min = profile.min === null ? number : Math.min(profile.min, number);
    profile.max = profile.max === null ? number : Math.max(profile.max, number);
  }
  if (profile.samples.size < 5) profile.samples.add(text.slice(0, 100));
}

function normalizeMetrics(metrics: GenericFileMetric[] | undefined): GenericFileMetric[] {
  if (!metrics?.length) return [{ name: "row_count", field: "", operation: "count" }];
  return metrics.slice(0, 5).map((metric, index) => ({
    name: metric.name.trim() || `metric_${index + 1}`,
    field: metric.field,
    operation: metric.operation,
  }));
}

function createMetricState(): MetricState {
  return { count: 0, numeric: 0, sum: 0, min: null, max: null };
}

function updateMetric(state: MetricState, metric: GenericFileMetric, row: FileQueryItem) {
  state.count += 1;
  if (metric.operation === "count") return;
  const number = parseNumeric(row[metric.field]);
  if (number === null) return;
  state.numeric += 1;
  state.sum += number;
  state.min = state.min === null ? number : Math.min(state.min, number);
  state.max = state.max === null ? number : Math.max(state.max, number);
}

function finalizeMetric(state: MetricState, metric: GenericFileMetric) {
  switch (metric.operation) {
    case "count":
      return state.count;
    case "sum":
      return state.sum;
    case "avg":
      return state.numeric > 0 ? state.sum / state.numeric : null;
    case "min":
      return state.min;
    case "max":
      return state.max;
  }
}

function projectRow(row: FileQueryItem, columns?: string[]) {
  const selectedColumns = columns?.length ? columns.slice(0, MAX_COLUMNS) : Object.keys(row).slice(0, MAX_COLUMNS);
  return Object.fromEntries(
    selectedColumns.map((column) => [column, toOutputScalar(row[column])]),
  );
}

function sortItems(items: FileQueryItem[], field: string | undefined, direction: "asc" | "desc") {
  if (!field) return;
  const factor = direction === "asc" ? 1 : -1;
  items.sort((left, right) => compareScalar(left[field], right[field]) * factor);
}

function parseNumeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = scalarText(value).replace(/[,$%\s]/g, "");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function scalarText(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function toOutputScalar(value: unknown): FileQueryItem[string] {
  if (typeof value !== "string") {
    return value === null || typeof value === "number" || typeof value === "boolean"
      ? value
      : scalarText(value).slice(0, 4_000);
  }
  return value.length <= 4_000 ? value : `${value.slice(0, 4_000)}... [truncated]`;
}

function requireColumn(value: string | undefined) {
  if (!value?.trim()) throw new Error("A column is required for this query operation");
  return value;
}

function queryLimit(value: number | undefined) {
  if (!Number.isFinite(value) || !value || value < 1) return 20;
  return Math.min(Math.floor(value), MAX_RETURNED_ROWS);
}

import readXlsxFile, { type Sheet } from "read-excel-file/web-worker";
import type {
  FileQueryItem,
  GenericFileDescriptor,
} from "./types";

const MAX_QUERY_COLUMNS = 200;

type RawSheet = {
  sheet: string;
  data: ReadonlyArray<ReadonlyArray<unknown>>;
};

export interface XlsxSheet {
  name: string;
  data: ReadonlyArray<ReadonlyArray<unknown>>;
  headerRowIndex: number;
  columns: string[];
  rowCount: number;
  columnCount: number;
}

export interface XlsxWorkbook {
  sheets: XlsxSheet[];
}

export async function loadXlsxWorkbook(
  file: File,
  isCancelled: () => boolean,
): Promise<XlsxWorkbook> {
  if (isCancelled()) throw createAbortError();

  let sheets: Sheet[];
  try {
    sheets = await readXlsxFile(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse XLSX workbook: ${message}`);
  }

  if (isCancelled()) throw createAbortError();
  return createXlsxWorkbook(sheets);
}

export function createXlsxWorkbook(sheets: readonly RawSheet[]): XlsxWorkbook {
  return {
    sheets: sheets.map((sheet) => createSheet(sheet)),
  };
}

export function inspectXlsxWorkbook(
  descriptor: GenericFileDescriptor,
  workbook: XlsxWorkbook,
): GenericFileDescriptor {
  const activeSheet = workbook.sheets[0];
  const totalRows = workbook.sheets.reduce((total, sheet) => total + sheet.rowCount, 0);
  const warnings = [...descriptor.warnings];

  if (workbook.sheets.length === 0) {
    warnings.push("The workbook does not contain any worksheets.");
  }
  if (workbook.sheets.some((sheet) => sheet.columnCount > MAX_QUERY_COLUMNS)) {
    warnings.push(
      `Structured queries use the first ${MAX_QUERY_COLUMNS} columns of each worksheet.`,
    );
  }

  return {
    ...descriptor,
    summary: `${descriptor.name}: XLSX workbook, ${workbook.sheets.length} sheets, ${totalRows} data rows`,
    sample: activeSheet ? createSheetSample(activeSheet) : undefined,
    structure: {
      columns: activeSheet?.columns,
      rowCount: activeSheet?.rowCount,
      activeSheet: activeSheet?.name,
      sheets: workbook.sheets.map((sheet) => ({
        name: sheet.name,
        rowCount: sheet.rowCount,
        columnCount: sheet.columnCount,
        ...(sheet.headerRowIndex >= 0
          ? { headerRow: sheet.headerRowIndex + 1 }
          : {}),
        columns: sheet.columns,
      })),
    },
    warnings,
  };
}

export async function* iterateXlsxRows(args: {
  workbook: XlsxWorkbook;
  sheet?: string;
  isCancelled: () => boolean;
}): AsyncGenerator<{ rowNumber: number; row: FileQueryItem }> {
  const sheet = getXlsxSheet(args.workbook, args.sheet);
  if (sheet.headerRowIndex < 0) return;

  for (let index = sheet.headerRowIndex + 1; index < sheet.data.length; index++) {
    if (args.isCancelled()) throw createAbortError();
    const values = sheet.data[index];
    if (isEmptyXlsxRow(values)) continue;
    yield {
      rowNumber: index + 1,
      row: toQueryRow(values, sheet.columns),
    };
  }
}

export function getXlsxSheet(workbook: XlsxWorkbook, requestedName?: string) {
  if (!requestedName) {
    const first = workbook.sheets[0];
    if (!first) throw new Error("The XLSX workbook does not contain any worksheets");
    return first;
  }

  const exact = workbook.sheets.find((sheet) => sheet.name === requestedName);
  if (exact) return exact;
  const normalizedName = requestedName.toLocaleLowerCase();
  const caseInsensitive = workbook.sheets.filter(
    (sheet) => sheet.name.toLocaleLowerCase() === normalizedName,
  );
  if (caseInsensitive.length === 1) return caseInsensitive[0];

  throw new Error(
    `Worksheet "${requestedName}" was not found. Available sheets: ${workbook.sheets.map((sheet) => sheet.name).join(", ") || "none"}`,
  );
}

export function normalizeXlsxRow(row: ReadonlyArray<unknown>) {
  return row.map(toCellValue);
}

export function isEmptyXlsxRow(row: ReadonlyArray<unknown>) {
  return row.every((value) => value === null || value === undefined || String(value).trim() === "");
}

function createSheet(raw: RawSheet): XlsxSheet {
  const headerRowIndex = raw.data.findIndex((row) => !isEmptyXlsxRow(row));
  const columnCount = raw.data.reduce(
    (maximum, row) => Math.max(maximum, row.length),
    0,
  );
  const header = headerRowIndex >= 0 ? raw.data[headerRowIndex] : [];
  const queryColumnCount = Math.min(columnCount, MAX_QUERY_COLUMNS);
  const columns = normalizeHeaders(
    Array.from({ length: queryColumnCount }, (_, index) => header[index]),
  );
  const rowCount =
    headerRowIndex < 0
      ? 0
      : raw.data
          .slice(headerRowIndex + 1)
          .filter((row) => !isEmptyXlsxRow(row)).length;

  return {
    name: raw.sheet,
    data: raw.data,
    headerRowIndex,
    columns,
    rowCount,
    columnCount,
  };
}

function normalizeHeaders(raw: ReadonlyArray<unknown>) {
  const counts = new Map<string, number>();
  return raw.map((value, index) => {
    const base = String(toCellValue(value) ?? "").trim() || `column_${index + 1}`;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

function toQueryRow(values: ReadonlyArray<unknown>, columns: string[]) {
  const row: FileQueryItem = {};
  for (let index = 0; index < columns.length; index++) {
    row[columns[index]] = toCellValue(values[index]);
  }
  return row;
}

function toCellValue(value: unknown): FileQueryItem[string] {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  return String(value);
}

function createSheetSample(sheet: XlsxSheet) {
  const rows = sheet.data
    .filter((row) => !isEmptyXlsxRow(row))
    .slice(0, 5)
    .map(normalizeXlsxRow);
  return JSON.stringify({ sheet: sheet.name, rows }).slice(0, 2_000);
}

function createAbortError() {
  return new DOMException("Operation aborted", "AbortError");
}

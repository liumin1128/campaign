import { decodeFileCursor, encodeFileCursor } from "./cursor";
import { limitResultItems, truncateLine } from "./result-limits";
import type {
  FileAgentLimits,
  FileReadChunk,
  FileReadRequest,
  FileReadResult,
  FileResultEnvelope,
  FileSearchMatch,
  FileSearchRequest,
  GenericFileDescriptor,
} from "./types";
import {
  getXlsxSheet,
  isEmptyXlsxRow,
  normalizeXlsxRow,
  type XlsxWorkbook,
} from "./xlsx-workbook";

const MAX_READ_ROWS = 100;

type XlsxArgs = {
  workbook: XlsxWorkbook;
  descriptor: GenericFileDescriptor;
  limits: FileAgentLimits;
  isCancelled: () => boolean;
};

export async function readXlsxFileChunk(
  args: XlsxArgs & { request: FileReadRequest },
): Promise<FileReadResult> {
  const sheet = getXlsxSheet(args.workbook, args.request.sheet);
  const sheetIndex = args.workbook.sheets.indexOf(sheet);
  const cursor = decodeFileCursor(args.request.cursor);
  if (cursor && cursor.type !== "sheet-row") {
    throw new Error("Read cursor type does not match XLSX reading");
  }
  if (cursor && cursor.sheetIndex !== sheetIndex) {
    throw new Error("Read cursor belongs to a different worksheet");
  }

  const startRow = cursor?.row ?? 1;
  if (sheet.data.length > 0 && startRow > sheet.data.length) {
    throw new Error(`Row ${startRow} is beyond the end of worksheet ${sheet.name}`);
  }
  const requestedBytes = Math.floor(
    args.request.maxBytes ?? args.limits.readChunkBytes,
  );
  const maxBytes = Math.min(
    args.limits.maxToolResultBytes,
    Math.max(1_024, requestedBytes),
  );
  const maxRowChars = Math.min(
    args.limits.readChunkBytes,
    16 * 1024,
    Math.max(256, Math.floor(maxBytes / 2)),
  );
  const items: FileReadChunk[] = [];
  let scannedRow = startRow - 1;

  for (let index = startRow - 1; index < sheet.data.length; index++) {
    if (args.isCancelled()) throw createAbortError();
    scannedRow = index + 1;
    const row = sheet.data[index];
    if (isEmptyXlsxRow(row)) continue;
    items.push({
      location: `${sheet.name}!row ${scannedRow}`,
      text: truncateLine(
        JSON.stringify(normalizeXlsxRow(row)),
        maxRowChars,
      ),
      row: scannedRow,
      sheet: sheet.name,
    });
    if (items.length >= MAX_READ_ROWS) break;
  }

  const nextRow = findNextPopulatedRow(sheet.data, scannedRow + 1);
  const nextCursor =
    nextRow === undefined
      ? undefined
      : encodeFileCursor({ type: "sheet-row", sheetIndex, row: nextRow });

  return limitResultItems({
    summary: `Read ${items.length} rows from worksheet ${sheet.name} in ${args.descriptor.name}.`,
    items,
    maxBytes,
    nextCursor,
    cursorAfterItem: (item) =>
      encodeFileCursor({
        type: "sheet-row",
        sheetIndex,
        row: (item.row ?? scannedRow) + 1,
      }),
  });
}

export async function searchXlsxFile(
  args: XlsxArgs & { request: FileSearchRequest },
): Promise<FileResultEnvelope<FileSearchMatch>> {
  const query = args.request.query.trim();
  if (!query) throw new Error("Search query is required");
  if (query.length > 1_000) throw new Error("Search query is too long");

  const matcher = createMatcher(
    query,
    args.request.mode ?? "literal",
    args.request.ignoreCase ?? true,
  );
  const requestedLimit = Math.max(
    1,
    Math.floor(args.request.limit ?? args.limits.maxMatches),
  );
  const limit = Math.min(requestedLimit, args.limits.maxMatches);
  const selectedSheets = args.request.sheet
    ? [getXlsxSheet(args.workbook, args.request.sheet)]
    : args.workbook.sheets;
  const selectedIndexes = selectedSheets.map((sheet) =>
    args.workbook.sheets.indexOf(sheet),
  );
  const cursor = decodeFileCursor(args.request.cursor);
  if (cursor && cursor.type !== "sheet-row") {
    throw new Error("Search cursor type does not match XLSX search");
  }
  if (cursor && !selectedIndexes.includes(cursor.sheetIndex)) {
    throw new Error("Search cursor belongs to a different worksheet selection");
  }

  const matches: FileSearchMatch[] = [];
  let lastSheetIndex = cursor?.sheetIndex ?? selectedIndexes[0] ?? 0;
  let scannedRow = (cursor?.row ?? 1) - 1;

  for (const sheet of selectedSheets) {
    const sheetIndex = args.workbook.sheets.indexOf(sheet);
    if (cursor && sheetIndex < cursor.sheetIndex) continue;
    const startRow = cursor && sheetIndex === cursor.sheetIndex ? cursor.row : 1;

    for (let index = startRow - 1; index < sheet.data.length; index++) {
      if (args.isCancelled()) throw createAbortError();
      lastSheetIndex = sheetIndex;
      scannedRow = index + 1;
      const row = sheet.data[index];
      if (isEmptyXlsxRow(row)) continue;
      const text = JSON.stringify(normalizeXlsxRow(row));
      if (!matcher(text)) continue;
      matches.push({
        location: `${sheet.name}!row ${scannedRow}`,
        line: scannedRow,
        sheet: sheet.name,
        text: truncateLine(text, args.limits.maxLineChars),
      });
      if (matches.length >= limit) break;
    }
    if (matches.length >= limit) break;
  }

  const nextPosition =
    matches.length >= limit
      ? findNextSearchPosition(
          args.workbook,
          selectedIndexes,
          lastSheetIndex,
          scannedRow + 1,
        )
      : undefined;
  const nextCursor = nextPosition
    ? encodeFileCursor({ type: "sheet-row", ...nextPosition })
    : undefined;

  return limitResultItems({
    summary: `Found ${matches.length} bounded matches in ${args.descriptor.name}.`,
    items: matches,
    maxBytes: args.limits.maxToolResultBytes,
    nextCursor,
    cursorAfterItem: (item) => {
      const sheetIndex = args.workbook.sheets.findIndex(
        (sheet) => sheet.name === item.sheet,
      );
      return encodeFileCursor({
        type: "sheet-row",
        sheetIndex,
        row: (item.line ?? 0) + 1,
      });
    },
    warnings:
      requestedLimit > limit
        ? [`Search limit was capped at ${args.limits.maxMatches} matches.`]
        : [],
  });
}

function findNextPopulatedRow(
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  startRow: number,
) {
  for (let index = Math.max(0, startRow - 1); index < rows.length; index++) {
    if (!isEmptyXlsxRow(rows[index])) return index + 1;
  }
  return undefined;
}

function findNextSearchPosition(
  workbook: XlsxWorkbook,
  selectedIndexes: number[],
  currentSheetIndex: number,
  startRow: number,
) {
  const currentSelectionIndex = selectedIndexes.indexOf(currentSheetIndex);
  if (currentSelectionIndex < 0) return undefined;

  for (
    let selectionIndex = currentSelectionIndex;
    selectionIndex < selectedIndexes.length;
    selectionIndex++
  ) {
    const sheetIndex = selectedIndexes[selectionIndex];
    const sheet = workbook.sheets[sheetIndex];
    const row = findNextPopulatedRow(
      sheet.data,
      selectionIndex === currentSelectionIndex ? startRow : 1,
    );
    if (row !== undefined) return { sheetIndex, row };
  }
  return undefined;
}

function createMatcher(
  query: string,
  mode: "literal" | "regex",
  ignoreCase: boolean,
) {
  if (mode === "regex") {
    let pattern: RegExp;
    try {
      pattern = new RegExp(query, ignoreCase ? "i" : "");
    } catch (error) {
      throw new Error(
        `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return (text: string) => pattern.test(text);
  }

  const needle = ignoreCase ? query.toLocaleLowerCase() : query;
  return (text: string) =>
    (ignoreCase ? text.toLocaleLowerCase() : text).includes(needle);
}

function createAbortError() {
  return new DOMException("Operation aborted", "AbortError");
}

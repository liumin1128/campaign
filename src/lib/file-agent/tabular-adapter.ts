import type {
  FileAgentLimits,
  FileQueryItem,
  GenericFileDescriptor,
} from "./types";
import { iterateTextLines } from "./text-adapter";
import {
  iterateXlsxRows,
  type XlsxWorkbook,
} from "./xlsx-workbook";

export async function* iterateTabularRows(args: {
  file: File;
  descriptor: GenericFileDescriptor;
  limits: FileAgentLimits;
  isCancelled: () => boolean;
  workbook?: XlsxWorkbook;
  sheet?: string;
}): AsyncGenerator<{ rowNumber: number; row: FileQueryItem }> {
  switch (args.descriptor.kind) {
    case "csv":
    case "tsv":
      yield* iterateDelimitedRows(
        args.file,
        args.descriptor.kind === "tsv" ? "\t" : ",",
        args.descriptor.encoding ?? "utf-8",
        args.isCancelled,
        Math.min(args.limits.maxStructuredParseBytes, 2 * 1024 * 1024),
      );
      return;
    case "jsonl":
      yield* iterateJsonLines(args.file, args.descriptor.encoding ?? "utf-8", args.isCancelled);
      return;
    case "json":
      yield* iterateJsonDocument(args);
      return;
    case "xlsx":
      if (!args.workbook) throw new Error("XLSX workbook has not been parsed");
      yield* iterateXlsxRows({
        workbook: args.workbook,
        sheet: args.sheet,
        isCancelled: args.isCancelled,
      });
      return;
    default:
      throw new Error(`File type ${args.descriptor.kind} does not support structured queries`);
  }
}

async function* iterateDelimitedRows(
  file: File,
  delimiter: string,
  encoding: string,
  isCancelled: () => boolean,
  maxFieldChars: number,
) {
  let headers: string[] | undefined;
  let rowNumber = 0;

  for await (const record of iterateDelimitedRecords(
    file,
    delimiter,
    encoding,
    isCancelled,
    maxFieldChars,
  )) {
    if (record.every((value) => value.trim() === "")) continue;
    if (!headers) {
      headers = normalizeHeaders(record);
      continue;
    }
    rowNumber += 1;
    const row: FileQueryItem = {};
    for (let index = 0; index < headers.length; index++) {
      row[headers[index]] = record[index] ?? "";
    }
    yield { rowNumber, row };
  }
}

async function* iterateDelimitedRecords(
  file: File,
  delimiter: string,
  encoding: string,
  isCancelled: () => boolean,
  maxFieldChars: number,
): AsyncGenerator<string[]> {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder(encoding);
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let pendingQuote = false;
  let skipLineFeed = false;

  try {
    while (true) {
      if (isCancelled()) throw createAbortError();
      const { value, done } = await reader.read();
      const chunk = decoder.decode(value, { stream: !done });

      for (const character of chunk) {
        if (field.length > maxFieldChars) {
          throw new Error(
            `A delimited field exceeds ${maxFieldChars} characters. Preprocess or split the file before structured queries.`,
          );
        }
        if (skipLineFeed) {
          skipLineFeed = false;
          if (character === "\n") continue;
        }

        if (pendingQuote) {
          if (character === '"') {
            field += '"';
            pendingQuote = false;
            continue;
          }
          pendingQuote = false;
          inQuotes = false;
        }

        if (inQuotes) {
          if (character === '"') pendingQuote = true;
          else field += character;
          continue;
        }

        if (character === '"') {
          inQuotes = true;
        } else if (character === delimiter) {
          record.push(field);
          field = "";
        } else if (character === "\n" || character === "\r") {
          record.push(field);
          field = "";
          yield record;
          record = [];
          skipLineFeed = character === "\r";
        } else {
          field += character;
        }
      }

      if (done) break;
    }

    if (pendingQuote) inQuotes = false;
    if (inQuotes) throw new Error("Delimited text contains an unclosed quoted field");
    if (field.length > 0 || record.length > 0) {
      record.push(field);
      yield record;
    }
  } finally {
    reader.releaseLock();
  }
}

async function* iterateJsonLines(
  file: File,
  encoding: string,
  isCancelled: () => boolean,
) {
  let rowNumber = 0;
  for await (const entry of iterateTextLines(file, encoding, 1, isCancelled)) {
    if (!entry.text.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(entry.text);
    } catch {
      throw new Error(`Invalid JSON on line ${entry.line}`);
    }
    rowNumber += 1;
    yield { rowNumber, row: toQueryRow(value) };
  }
}

async function* iterateJsonDocument(args: {
  file: File;
  descriptor: GenericFileDescriptor;
  limits: FileAgentLimits;
  isCancelled: () => boolean;
}) {
  if (args.file.size > args.limits.maxStructuredParseBytes) {
    throw new Error(
      `JSON is too large for structural queries (${args.file.size} bytes). Use search_file/read_file_chunk or convert it to JSONL.`,
    );
  }
  if (args.isCancelled()) throw createAbortError();
  const parsed = JSON.parse(await args.file.text()) as unknown;
  const values = Array.isArray(parsed) ? parsed : [parsed];
  for (let index = 0; index < values.length; index++) {
    if (args.isCancelled()) throw createAbortError();
    yield { rowNumber: index + 1, row: toQueryRow(values[index]) };
  }
}

function normalizeHeaders(raw: string[]) {
  const counts = new Map<string, number>();
  return raw.map((value, index) => {
    const base = value.replace(/^\uFEFF/, "").trim() || `column_${index + 1}`;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

function toQueryRow(value: unknown): FileQueryItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { value: toScalar(value) };
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, toScalar(item)]),
  );
}

function toScalar(value: unknown): FileQueryItem[string] {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return typeof value === "string" && value.length > 2 * 1024 * 1024
      ? `${value.slice(0, 2 * 1024 * 1024)}... [truncated internally]`
      : value;
  }
  const serialized = JSON.stringify(value) ?? String(value);
  return serialized.length > 2 * 1024 * 1024
    ? `${serialized.slice(0, 2 * 1024 * 1024)}... [truncated internally]`
    : serialized;
}

function createAbortError() {
  return new DOMException("Operation aborted", "AbortError");
}

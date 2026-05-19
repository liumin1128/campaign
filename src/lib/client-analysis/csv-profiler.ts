import {
  SAMPLE_ROW_LIMIT,
  SAMPLE_VALUE_LIMIT,
  type CsvColumnProfile,
  type CsvColumnType,
  type CsvDataQuality,
  type CsvProfile,
  type CsvProfileOptions,
  type CsvRow,
  type CsvSemanticType,
} from "./csv-types";

interface ParsedCsv {
  headers: string[];
  rows: CsvRow[];
  dataQuality: CsvDataQuality;
}

type ColumnAccumulator = {
  missingCount: number;
  sampleValues: string[];
  uniqueValues: Set<string>;
  numberCount: number;
  dateCount: number;
  booleanCount: number;
  stringCount: number;
  minNumber?: number;
  maxNumber?: number;
  sumNumber: number;
  minDate?: string;
  maxDate?: string;
};

const FIELD_HINTS: Record<Exclude<CsvSemanticType, "unknown">, string[]> = {
  origin: ["origin", "orig", "from", "dep", "departure", "source"],
  destination: ["destination", "dest", "to", "arr", "arrival", "target"],
  route: ["route", "od", "o_d", "city_pair", "market", "lane"],
  date: ["date", "month", "week", "year", "travel_date", "booking_date"],
  revenue: ["revenue", "sales", "amount", "fare", "income", "gmv"],
  demand: [
    "passenger",
    "passengers",
    "pax",
    "booking",
    "bookings",
    "ticket",
    "tickets",
    "demand",
  ],
  yield: ["yield", "unit_revenue", "avg_fare", "average_fare", "rask"],
  cabin: ["cabin", "class", "rbd", "fare_class", "booking_class"],
  dimension: ["segment", "channel", "country", "region", "category", "type"],
  metric: ["count", "rate", "ratio", "score", "index", "metric"],
  id: ["id", "uuid", "key", "code", "number", "no"],
};

export async function profileCsvFile(
  file: File,
  options?: CsvProfileOptions,
): Promise<{ profile: CsvProfile; rows: CsvRow[]; headers: string[] }> {
  const raw = await file.text();
  const parsed = parseCsv(raw);
  const profile = createCsvProfile(file, parsed, options);

  return { profile, rows: parsed.rows, headers: parsed.headers };
}

export function parseCsv(raw: string): ParsedCsv {
  const dataQuality: CsvDataQuality = {
    emptyRowCount: 0,
    inconsistentRowCount: 0,
    duplicateHeaderCount: 0,
    totalMissingCells: 0,
    warnings: [],
  };

  const records = parseCsvRecords(raw);
  const firstNonEmptyIndex = records.findIndex((record) =>
    record.some((value) => value.trim() !== ""),
  );

  if (firstNonEmptyIndex < 0) {
    throw new Error("CSV 文件为空");
  }

  dataQuality.emptyRowCount = records
    .slice(0, firstNonEmptyIndex)
    .filter((record) => record.every((value) => value.trim() === "")).length;

  const headerResult = normalizeHeaders(records[firstNonEmptyIndex]);
  const headers = headerResult.headers;
  dataQuality.duplicateHeaderCount = headerResult.duplicateCount;

  if (headers.length === 0) {
    throw new Error("CSV 表头为空");
  }

  const rows: CsvRow[] = [];
  for (const record of records.slice(firstNonEmptyIndex + 1)) {
    if (record.every((value) => value.trim() === "")) {
      dataQuality.emptyRowCount += 1;
      continue;
    }

    if (record.length !== headers.length) {
      dataQuality.inconsistentRowCount += 1;
    }

    const row: CsvRow = {};
    for (let index = 0; index < headers.length; index++) {
      const value = record[index]?.trim() ?? "";
      if (!value) {
        dataQuality.totalMissingCells += 1;
      }
      row[headers[index]] = value;
    }
    rows.push(row);
  }

  if (dataQuality.duplicateHeaderCount > 0) {
    dataQuality.warnings.push(
      `检测到 ${dataQuality.duplicateHeaderCount} 个重复表头，已自动重命名。`,
    );
  }

  if (dataQuality.inconsistentRowCount > 0) {
    dataQuality.warnings.push(
      `检测到 ${dataQuality.inconsistentRowCount} 行列数不一致，已按表头对齐解析。`,
    );
  }

  return { headers, rows, dataQuality };
}

export function parseCsvRecords(raw: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < raw.length; index++) {
    const char = raw[index];
    const nextChar = raw[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      record.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error("CSV 引号未闭合，无法解析");
  }

  if (field.length > 0 || record.length > 0 || raw.endsWith(",")) {
    record.push(field);
    records.push(record);
  }

  return records;
}

export function createCsvProfile(
  file: Pick<File, "name" | "size">,
  parsed: ParsedCsv,
  options?: CsvProfileOptions,
): CsvProfile {
  const sampleRowLimit = options?.sampleRowLimit ?? SAMPLE_ROW_LIMIT;
  const sampleValueLimit = options?.sampleValueLimit ?? SAMPLE_VALUE_LIMIT;
  const accumulators = new Map<string, ColumnAccumulator>();

  for (const header of parsed.headers) {
    accumulators.set(header, {
      missingCount: 0,
      sampleValues: [],
      uniqueValues: new Set<string>(),
      numberCount: 0,
      dateCount: 0,
      booleanCount: 0,
      stringCount: 0,
      sumNumber: 0,
    });
  }

  for (const row of parsed.rows) {
    for (const header of parsed.headers) {
      const value = row[header]?.trim() ?? "";
      const accumulator = accumulators.get(header)!;

      if (!value) {
        accumulator.missingCount += 1;
        continue;
      }

      if (accumulator.sampleValues.length < sampleValueLimit) {
        accumulator.sampleValues.push(value);
      }
      accumulator.uniqueValues.add(value);

      const numericValue = parseNumber(value);
      if (numericValue !== null) {
        accumulator.numberCount += 1;
        accumulator.sumNumber += numericValue;
        accumulator.minNumber =
          accumulator.minNumber === undefined
            ? numericValue
            : Math.min(accumulator.minNumber, numericValue);
        accumulator.maxNumber =
          accumulator.maxNumber === undefined
            ? numericValue
            : Math.max(accumulator.maxNumber, numericValue);
        continue;
      }

      if (isBooleanLike(value)) {
        accumulator.booleanCount += 1;
        continue;
      }

      const dateValue = parseDate(value);
      if (dateValue) {
        const isoDate = dateValue.toISOString().slice(0, 10);
        accumulator.dateCount += 1;
        accumulator.minDate =
          accumulator.minDate === undefined || isoDate < accumulator.minDate
            ? isoDate
            : accumulator.minDate;
        accumulator.maxDate =
          accumulator.maxDate === undefined || isoDate > accumulator.maxDate
            ? isoDate
            : accumulator.maxDate;
        continue;
      }

      accumulator.stringCount += 1;
    }
  }

  const columns: CsvColumnProfile[] = parsed.headers.map((header) => {
    const accumulator = accumulators.get(header)!;
    const nonMissingCount = parsed.rows.length - accumulator.missingCount;
    const type = inferColumnType(accumulator, nonMissingCount);
    const profile: CsvColumnProfile = {
      name: header,
      type,
      semanticType: inferSemanticType(header, type),
      missingCount: accumulator.missingCount,
      missingRate:
        parsed.rows.length === 0
          ? 0
          : accumulator.missingCount / parsed.rows.length,
      sampleValues: accumulator.sampleValues,
      uniqueSampleCount: accumulator.uniqueValues.size,
    };

    if (type === "number") {
      profile.min = accumulator.minNumber;
      profile.max = accumulator.maxNumber;
      profile.avg =
        accumulator.numberCount > 0
          ? accumulator.sumNumber / accumulator.numberCount
          : undefined;
    } else if (type === "date") {
      profile.min = accumulator.minDate;
      profile.max = accumulator.maxDate;
    }

    return profile;
  });

  return {
    fileName: file.name,
    fileSize: file.size,
    rowCount: parsed.rows.length,
    columnCount: parsed.headers.length,
    columns,
    sampleRows: parsed.rows.slice(0, sampleRowLimit),
    dataQuality: parsed.dataQuality,
  };
}

export function parseNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/[%,$¥€£\s]/g, "")
    .replace(/^\((.*)\)$/, "-$1");

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = /^\d{8}$/.test(trimmed)
    ? `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`
    : trimmed;
  const time = Date.parse(normalized);

  if (!Number.isFinite(time)) {
    return null;
  }

  return new Date(time);
}

function normalizeHeaders(rawHeaders: string[]) {
  const seen = new Map<string, number>();
  let duplicateCount = 0;

  const headers = rawHeaders
    .map((header, index) => {
      const base = header.trim() || `column_${index + 1}`;
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);

      if (count === 0) {
        return base;
      }

      duplicateCount += 1;
      return `${base}_${count + 1}`;
    })
    .filter(Boolean);

  return { headers, duplicateCount };
}

function inferColumnType(
  accumulator: ColumnAccumulator,
  nonMissingCount: number,
): CsvColumnType {
  if (nonMissingCount === 0) {
    return "unknown";
  }

  const threshold = Math.max(1, Math.ceil(nonMissingCount * 0.75));
  if (accumulator.numberCount >= threshold) return "number";
  if (accumulator.dateCount >= threshold) return "date";
  if (accumulator.booleanCount >= threshold) return "boolean";
  return "string";
}

function inferSemanticType(
  header: string,
  type: CsvColumnType,
): CsvSemanticType {
  const normalized = header.toLowerCase().replace(/[^a-z0-9]+/g, "_");

  for (const [semanticType, hints] of Object.entries(FIELD_HINTS)) {
    if (
      hints.some(
        (hint) =>
          normalized === hint ||
          normalized.startsWith(`${hint}_`) ||
          normalized.endsWith(`_${hint}`) ||
          normalized.includes(`_${hint}_`),
      )
    ) {
      return semanticType as CsvSemanticType;
    }
  }

  if (type === "number") return "metric";
  if (type === "date") return "date";
  return "dimension";
}

function isBooleanLike(value: string): boolean {
  return /^(true|false|yes|no|y|n|0|1)$/i.test(value.trim());
}

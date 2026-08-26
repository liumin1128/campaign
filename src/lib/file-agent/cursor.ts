export type FileCursor =
  | { type: "byte"; offset: number }
  | { type: "line"; line: number };

const PREFIX = "f1:";

export function encodeFileCursor(cursor: FileCursor) {
  return PREFIX + encodeURIComponent(JSON.stringify(cursor));
}

export function decodeFileCursor(value: string | undefined): FileCursor | undefined {
  if (!value) return undefined;
  if (!value.startsWith(PREFIX)) throw new Error("Invalid file cursor");

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(value.slice(PREFIX.length)));
  } catch {
    throw new Error("Invalid file cursor");
  }
  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    throw new Error("Invalid file cursor");
  }

  if (parsed.type === "byte" && isNonNegativeInteger(parsed.offset)) {
    return { type: "byte", offset: parsed.offset };
  }
  if (parsed.type === "line" && isPositiveInteger(parsed.line)) {
    return { type: "line", line: parsed.line };
  }
  throw new Error("Invalid file cursor");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

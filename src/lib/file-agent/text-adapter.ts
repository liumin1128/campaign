import { decodeFileCursor, encodeFileCursor } from "./cursor";
import { limitResultItems, truncateLine } from "./result-limits";
import type {
  FileAgentLimits,
  FileReadRequest,
  FileReadResult,
  FileSearchMatch,
  FileSearchRequest,
  FileResultEnvelope,
  GenericFileDescriptor,
} from "./types";

const MAX_BUFFERED_LINE_CHARS = 2 * 1024 * 1024;

export async function inspectTextFile(
  file: File,
  descriptor: GenericFileDescriptor,
): Promise<GenericFileDescriptor> {
  const sample = descriptor.sample ?? "";
  const structure = { ...descriptor.structure };

  if (descriptor.kind === "csv" || descriptor.kind === "tsv") {
    structure.columns = parseDelimitedHeader(
      sample.split(/\r?\n/, 1)[0] ?? "",
      descriptor.kind === "tsv" ? "\t" : ",",
    );
  } else if (descriptor.kind === "json") {
    const first = sample.trimStart()[0];
    structure.rootType = first === "[" ? "array" : first === "{" ? "object" : "scalar";
  }

  return {
    ...descriptor,
    summary: `${descriptor.name}: ${descriptor.kind} text, ${file.size} bytes${structure.columns?.length ? `, ${structure.columns.length} columns` : ""}`,
    structure,
  };
}

export async function searchTextFile(args: {
  file: File;
  descriptor: GenericFileDescriptor;
  request: FileSearchRequest;
  limits: FileAgentLimits;
  isCancelled: () => boolean;
}): Promise<FileResultEnvelope<FileSearchMatch>> {
  const query = args.request.query.trim();
  if (!query) throw new Error("Search query is required");
  if (query.length > 1_000) throw new Error("Search query is too long");

  const cursor = decodeFileCursor(args.request.cursor);
  if (cursor && cursor.type !== "line") throw new Error("Search cursor type does not match text search");
  const startLine = cursor?.type === "line" ? cursor.line : 1;
  const requestedLimit = Math.max(1, Math.floor(args.request.limit ?? args.limits.maxMatches));
  const limit = Math.min(requestedLimit, args.limits.maxMatches);
  const matcher = createMatcher(query, args.request.mode ?? "literal", args.request.ignoreCase ?? true);
  const matches: FileSearchMatch[] = [];
  let scannedThrough = startLine - 1;

  for await (const entry of iterateTextLines(
    args.file,
    args.descriptor.encoding ?? "utf-8",
    startLine,
    args.isCancelled,
  )) {
    scannedThrough = entry.line;
    if (!matcher(entry.text)) continue;
    matches.push({
      location: `line ${entry.line}`,
      line: entry.line,
      text: truncateLine(entry.text, args.limits.maxLineChars),
    });
    if (matches.length >= limit) break;
  }

  const hasMore = matches.length >= limit && scannedThrough < Number.MAX_SAFE_INTEGER;
  const nextCursor = hasMore
    ? encodeFileCursor({ type: "line", line: scannedThrough + 1 })
    : undefined;
  return limitResultItems({
    summary: `Found ${matches.length} bounded matches in ${args.descriptor.name}.`,
    items: matches,
    maxBytes: args.limits.maxToolResultBytes,
    nextCursor,
    cursorAfterItem: (item) =>
      encodeFileCursor({ type: "line", line: (item.line ?? scannedThrough) + 1 }),
    warnings:
      requestedLimit > limit
        ? [`Search limit was capped at ${args.limits.maxMatches} matches.`]
        : [],
  });
}

export async function readTextFileChunk(args: {
  file: File;
  descriptor: GenericFileDescriptor;
  request: FileReadRequest;
  limits: FileAgentLimits;
  isCancelled: () => boolean;
}): Promise<FileReadResult> {
  const cursor = decodeFileCursor(args.request.cursor);
  if (cursor && cursor.type !== "byte") throw new Error("Read cursor type does not match text reading");
  const offset = cursor?.type === "byte" ? cursor.offset : 0;
  if (offset >= args.file.size) throw new Error(`Read offset ${offset} is beyond the end of the file`);
  if (args.isCancelled()) throw createAbortError();

  const requestedBytes = Math.floor(args.request.maxBytes ?? args.limits.readChunkBytes);
  const maxBytes = Math.max(1_024, Math.min(requestedBytes, args.limits.readChunkBytes));
  let end = alignEnd(
    offset,
    Math.min(args.file.size, offset + maxBytes),
    args.descriptor.encoding,
  );
  let bytes = new Uint8Array(await args.file.slice(offset, end).arrayBuffer());
  if ((args.descriptor.encoding ?? "utf-8") === "utf-8" && end < args.file.size) {
    const safeLength = getUtf8SafeLength(bytes);
    if (safeLength > 0 && safeLength < bytes.length) {
      bytes = bytes.slice(0, safeLength);
      end = offset + safeLength;
    }
  }
  if (args.isCancelled()) throw createAbortError();
  const text = stripBom(new TextDecoder(args.descriptor.encoding ?? "utf-8").decode(bytes), offset);
  const nextCursor = end < args.file.size ? encodeFileCursor({ type: "byte", offset: end }) : undefined;

  return {
    ...limitResultItems({
      summary: `Read bytes ${offset}-${end - 1} from ${args.descriptor.name}.`,
      items: [{ location: `bytes ${offset}-${end - 1}`, text, start: offset, end }],
      maxBytes: args.limits.maxToolResultBytes,
      nextCursor,
    }),
  };
}

export async function* iterateTextLines(
  file: File,
  encoding: string,
  startLine = 1,
  isCancelled: () => boolean = () => false,
): AsyncGenerator<{ line: number; text: string }> {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder(encoding);
  let buffer = "";
  let line = 1;

  try {
    while (true) {
      if (isCancelled()) throw createAbortError();
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > MAX_BUFFERED_LINE_CHARS && !buffer.includes("\n")) {
        throw new Error(
          `Line ${line} exceeds the ${MAX_BUFFERED_LINE_CHARS} character search limit. Use read_file_chunk with byte cursors instead.`,
        );
      }

      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const text = stripTrailingCarriageReturn(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (line >= startLine) yield { line, text: line === 1 ? stripBom(text, 0) : text };
        line += 1;
        newline = buffer.indexOf("\n");
      }

      if (done) break;
    }

    if (buffer.length > 0 && line >= startLine) {
      yield { line, text: line === 1 ? stripBom(buffer, 0) : buffer };
    }
  } finally {
    reader.releaseLock();
  }
}

function createMatcher(query: string, mode: "literal" | "regex", ignoreCase: boolean) {
  if (mode === "regex") {
    let pattern: RegExp;
    try {
      pattern = new RegExp(query, ignoreCase ? "i" : "");
    } catch (error) {
      throw new Error(`Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`);
    }
    return (text: string) => pattern.test(text);
  }

  const needle = ignoreCase ? query.toLocaleLowerCase() : query;
  return (text: string) => (ignoreCase ? text.toLocaleLowerCase() : text).includes(needle);
}

function parseDelimitedHeader(line: string, delimiter: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values.filter(Boolean);
}

function alignEnd(offset: number, end: number, encoding?: string) {
  return encoding?.startsWith("utf-16") && (end - offset) % 2 !== 0 ? end - 1 : end;
}

function getUtf8SafeLength(bytes: Uint8Array) {
  if (bytes.length === 0) return 0;
  let leadIndex = bytes.length - 1;
  while (leadIndex >= 0 && (bytes[leadIndex] & 0xc0) === 0x80) leadIndex -= 1;
  if (leadIndex < 0) return 0;

  const lead = bytes[leadIndex];
  const expectedLength =
    lead < 0x80 ? 1 : lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
  return leadIndex + expectedLength <= bytes.length ? bytes.length : leadIndex;
}

function stripBom(value: string, offset: number) {
  return offset === 0 ? value.replace(/^\uFEFF/, "") : value;
}

function stripTrailingCarriageReturn(value: string) {
  return value.endsWith("\r") ? value.slice(0, -1) : value;
}

function createAbortError() {
  return new DOMException("Operation aborted", "AbortError");
}

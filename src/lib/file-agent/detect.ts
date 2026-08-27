import type {
  FileCapability,
  GenericFileDescriptor,
  GenericFileKind,
} from "./types";

const SAMPLE_BYTES = 64 * 1024;

export async function detectGenericFile(
  fileId: string,
  file: File,
): Promise<GenericFileDescriptor> {
  const bytes = new Uint8Array(await file.slice(0, SAMPLE_BYTES).arrayBuffer());
  const extension = getExtension(file.name);
  const magicKind = detectMagic(bytes);
  const text = decodeTextSample(bytes);
  const kind = magicKind ?? detectByExtensionAndContent(extension, file.type, text);
  const encoding = isTextKind(kind) ? detectEncoding(bytes) : undefined;
  const capabilities = capabilitiesForKind(kind);
  const warnings: string[] = [];

  if (kind === "binary") {
    warnings.push("Unsupported binary format. Convert it to UTF-8 text, CSV, TSV, JSON, or JSONL before upload.");
  } else if (["pdf", "docx", "image", "zip"].includes(kind)) {
    warnings.push(`The ${kind} format is not parsed in this release. Convert it to text or a supported structured text format.`);
  }

  return {
    id: fileId,
    name: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    extension,
    kind,
    confidence: magicKind ? 1 : extension ? 0.8 : text === null ? 0.5 : 0.65,
    capabilities,
    encoding,
    summary: `${file.name}: ${kind}, ${file.size} bytes`,
    sample: text?.slice(0, 2_000),
    structure: {},
    warnings,
  };
}

function detectMagic(bytes: Uint8Array): GenericFileKind | undefined {
  if (startsWithAscii(bytes, "%PDF-")) return "pdf";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image";
  if (startsWithAscii(bytes, "GIF8")) return "image";
  if (startsWithAscii(bytes, "RIFF") && asciiAt(bytes, 8, "WEBP")) return "image";
  if (startsWithAscii(bytes, "BM")) return "image";
  return undefined;
}

function detectByExtensionAndContent(
  extension: string,
  mimeType: string,
  text: string | null,
): GenericFileKind {
  if (
    extension === "xlsx" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "xlsx";
  }
  if (extension === "docx") return "docx";
  if (extension === "pdf") return "pdf";
  if (extension === "zip" || mimeType === "application/zip") return "zip";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(extension)) return "image";
  if (extension === "csv") return "csv";
  if (extension === "tsv") return "tsv";
  if (extension === "jsonl" || extension === "ndjson") return "jsonl";
  if (extension === "json") return "json";
  if (text === null) return "binary";

  const trimmed = text.trimStart();
  if (looksLikeJsonLines(text)) return "jsonl";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  const delimiter = detectDelimiter(text);
  if (delimiter === "\t") return "tsv";
  if (delimiter === ",") return "csv";
  return "text";
}

function capabilitiesForKind(kind: GenericFileKind): FileCapability[] {
  switch (kind) {
    case "image":
    case "pdf":
    case "docx":
    case "binary":
      return ["inspect"];
    case "zip":
      return ["inspect"];
    case "csv":
    case "tsv":
    case "json":
    case "jsonl":
    case "xlsx":
      return ["inspect", "search", "read", "query"];
    default:
      return ["inspect", "search", "read"];
  }
}

function decodeTextSample(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return "";
  const nullCount = bytes.reduce((count, byte) => count + (byte === 0 ? 1 : 0), 0);
  if (nullCount / bytes.length > 0.15 && !looksUtf16(bytes)) return null;

  try {
    const decoded = new TextDecoder(detectEncoding(bytes), { fatal: true }).decode(bytes, {
      stream: true,
    });
    return isLikelyText(decoded) ? decoded : null;
  } catch {
    try {
      const decoded = new TextDecoder("windows-1252").decode(bytes);
      return isLikelyText(decoded) ? decoded : null;
    } catch {
      return null;
    }
  }
}

function isLikelyText(value: string) {
  if (!value) return true;
  let controlCharacters = 0;
  for (const character of value.slice(0, 8_192)) {
    const code = character.charCodeAt(0);
    if (code < 32 && character !== "\n" && character !== "\r" && character !== "\t") {
      controlCharacters += 1;
    }
  }
  return controlCharacters / Math.min(value.length, 8_192) < 0.02;
}

export function detectEncoding(bytes: Uint8Array) {
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) return "utf-8";
  if (startsWith(bytes, [0xff, 0xfe])) return "utf-16le";
  if (startsWith(bytes, [0xfe, 0xff])) return "utf-16be";
  if (looksUtf16(bytes)) {
    const evenNulls = countNulls(bytes, 0);
    const oddNulls = countNulls(bytes, 1);
    return oddNulls > evenNulls ? "utf-16le" : "utf-16be";
  }
  return "utf-8";
}

function looksUtf16(bytes: Uint8Array) {
  if (bytes.length < 4) return false;
  const evenNulls = countNulls(bytes, 0);
  const oddNulls = countNulls(bytes, 1);
  return Math.max(evenNulls, oddNulls) > bytes.length * 0.15;
}

function countNulls(bytes: Uint8Array, parity: 0 | 1) {
  let count = 0;
  for (let index = parity; index < bytes.length; index += 2) {
    if (bytes[index] === 0) count += 1;
  }
  return count;
}

function looksLikeJsonLines(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 5);
  return (
    lines.length >= 2 &&
    lines.every((line) => {
      try {
        JSON.parse(line);
        return true;
      } catch {
        return false;
      }
    })
  );
}

function detectDelimiter(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 8);
  if (lines.length < 2) return undefined;
  for (const delimiter of ["\t", ","] as const) {
    const counts = lines.map((line) => line.split(delimiter).length);
    if (counts[0] > 1 && counts.every((count) => count === counts[0])) return delimiter;
  }
  return undefined;
}

function isTextKind(kind: GenericFileKind) {
  return ["text", "csv", "tsv", "json", "jsonl"].includes(kind);
}

function getExtension(name: string) {
  const index = name.lastIndexOf(".");
  return index > -1 ? name.slice(index + 1).toLowerCase() : "";
}

function startsWith(bytes: Uint8Array, expected: number[]) {
  return expected.every((value, index) => bytes[index] === value);
}

function startsWithAscii(bytes: Uint8Array, value: string) {
  return asciiAt(bytes, 0, value);
}

function asciiAt(bytes: Uint8Array, offset: number, value: string) {
  if (bytes.length < offset + value.length) return false;
  return [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

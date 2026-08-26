export type GenericFileKind =
  | "text"
  | "csv"
  | "tsv"
  | "json"
  | "jsonl"
  | "xlsx"
  | "pdf"
  | "docx"
  | "image"
  | "zip"
  | "binary";

export type FileCapability =
  | "inspect"
  | "search"
  | "read"
  | "query";

export interface GenericFileStructure {
  columns?: string[];
  lineCount?: number;
  rootType?: "object" | "array" | "scalar";
}

export interface GenericFileDescriptor {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  extension: string;
  kind: GenericFileKind;
  confidence: number;
  capabilities: FileCapability[];
  encoding?: string;
  summary: string;
  sample?: string;
  structure: GenericFileStructure;
  warnings: string[];
}

export interface FileResultEnvelope<T> {
  summary: string;
  items: T[];
  returned: number;
  total?: number;
  truncated: boolean;
  nextCursor?: string;
  warnings: string[];
}

export type FileSearchMode = "literal" | "regex";

export interface FileSearchRequest {
  query: string;
  mode?: FileSearchMode;
  ignoreCase?: boolean;
  cursor?: string;
  limit?: number;
}

export interface FileSearchMatch {
  location: string;
  text: string;
  line?: number;
}

export interface FileReadRequest {
  cursor?: string;
  maxBytes?: number;
}

export interface FileReadChunk {
  location: string;
  text: string;
  start?: number;
  end?: number;
}

export type FileReadResult = FileResultEnvelope<FileReadChunk>;

export type GenericFilterOperator =
  | "eq"
  | "contains"
  | "gte"
  | "lte"
  | "between"
  | "notEmpty";

export interface GenericFileFilter {
  field: string;
  op: GenericFilterOperator;
  value?: string | number | [string | number, string | number];
}

export type GenericMetricOperation = "sum" | "avg" | "min" | "max" | "count";

export interface GenericFileMetric {
  name: string;
  field: string;
  operation: GenericMetricOperation;
}

export interface FileQueryRequest {
  operation: "profile" | "count" | "distinct" | "stats" | "filter" | "aggregate" | "top";
  column?: string;
  columns?: string[];
  filters?: GenericFileFilter[];
  groupBy?: string[];
  metrics?: GenericFileMetric[];
  sortBy?: string;
  direction?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}

export interface FileQueryItem {
  [key: string]: string | number | boolean | null;
}

export interface FileQueryResult extends FileResultEnvelope<FileQueryItem> {
  stats?: Record<string, string | number | null>;
}

export interface FileAgentLimits {
  maxFileBytes: number;
  maxToolResultBytes: number;
  maxMatches: number;
  maxLineChars: number;
  readChunkBytes: number;
  maxStructuredParseBytes: number;
}

export type FileWorkerRequest =
  | { id: string; type: "register"; fileId: string; file: File; limits: FileAgentLimits }
  | { id: string; type: "inspect" }
  | { id: string; type: "search"; request: FileSearchRequest }
  | { id: string; type: "read"; request: FileReadRequest }
  | { id: string; type: "query"; request: FileQueryRequest }
  | { id: string; type: "cancel"; targetId: string };

export type FileWorkerResponse =
  | { id: string; ok: true; type: "registered" | "inspect"; descriptor: GenericFileDescriptor }
  | { id: string; ok: true; type: "search"; result: FileResultEnvelope<FileSearchMatch> }
  | { id: string; ok: true; type: "read"; result: FileReadResult }
  | { id: string; ok: true; type: "query"; result: FileQueryResult }
  | { id: string; ok: false; error: string };

export interface GenericFileContext {
  id: string;
  descriptor: GenericFileDescriptor;
}

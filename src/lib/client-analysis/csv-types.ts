export type CsvScalar = string | number | boolean | null;

export type CsvRow = Record<string, string>;

export type CsvColumnType =
  | "string"
  | "number"
  | "date"
  | "boolean"
  | "unknown";

export type CsvSemanticType =
  | "route"
  | "origin"
  | "destination"
  | "date"
  | "revenue"
  | "demand"
  | "yield"
  | "cabin"
  | "dimension"
  | "metric"
  | "id"
  | "unknown";

export interface CsvParseMetadata {
  encoding: string;
  delimiter: string;
  delimiterName: string;
  confidence: number;
}

export interface CsvDataQuality {
  parseMetadata?: CsvParseMetadata;
  emptyRowCount: number;
  inconsistentRowCount: number;
  duplicateHeaderCount: number;
  totalMissingCells: number;
  warnings: string[];
}

export interface CsvColumnProfile {
  name: string;
  type: CsvColumnType;
  semanticType?: CsvSemanticType;
  missingCount: number;
  missingRate: number;
  sampleValues: string[];
  uniqueSampleCount: number;
  min?: number | string;
  max?: number | string;
  avg?: number;
}

export interface CsvProfile {
  fileName: string;
  fileSize: number;
  rowCount: number;
  columnCount: number;
  columns: CsvColumnProfile[];
  sampleRows: CsvRow[];
  dataQuality: CsvDataQuality;
}

export interface CsvProfileSummary {
  fileName: string;
  fileSize: number;
  rowCount: number;
  columnCount: number;
  columns: Array<Pick<CsvColumnProfile, "name" | "type" | "semanticType">>;
  dataQuality: CsvDataQuality;
}

export type FilterOperator = "eq" | "contains" | "between" | "gte" | "lte";

export type MetricAggregator = "sum" | "avg" | "min" | "max" | "count";

export interface FilterRule {
  field: string;
  op: FilterOperator;
  value: string | number | [string | number, string | number];
}

export interface MetricRule {
  name: string;
  field: string;
  agg: MetricAggregator;
}

export interface RankingRule {
  sortBy: string;
  direction: "asc" | "desc";
  limit: number;
}

export interface AnalysisPlan {
  goal: string;
  requiredFields: string[];
  filters: FilterRule[];
  groupBy: string[];
  metrics: MetricRule[];
  ranking?: RankingRule;
}

export interface AnalysisResult {
  plan: AnalysisPlan;
  rowCount: number;
  matchedRowCount: number;
  totalGroupCount: number;
  resultRows: Array<Record<string, string | number | null>>;
  dataQuality: CsvDataQuality;
  warnings: string[];
}

export type CsvDataQuery =
  | {
      type: "rows";
      rowNumbers?: number[];
      startRow?: number;
      limit?: number;
      columns?: string[];
    }
  | {
      type: "columns";
      columns: string[];
      startRow?: number;
      limit?: number;
    }
  | {
      type: "filterRows";
      filters: FilterRule[];
      columns?: string[];
      limit?: number;
    }
  | {
      type: "distinctValues";
      column: string;
      limit?: number;
    }
  | {
      type: "columnStats";
      column: string;
    }
  | {
      type: "aggregate";
      plan: AnalysisPlan;
    };

export interface CsvDataQueryResult {
  query: CsvDataQuery;
  rowCount: number;
  matchedRowCount?: number;
  rows?: Array<Record<string, string | number>>;
  values?: string[];
  stats?: Record<string, string | number | null>;
  aggregateResult?: AnalysisResult;
  warnings: string[];
}

export type CsvAnalysisStatus =
  | "profiling"
  | "profiled"
  | "planning"
  | "executing"
  | "summarizing"
  | "completed"
  | "failed";

export interface CsvAnalysisState {
  id: string;
  status: CsvAnalysisStatus;
  progress?: number;
  profile?: CsvProfile;
  profileSummary?: CsvProfileSummary;
  plan?: AnalysisPlan;
  result?: AnalysisResult;
  queryResults?: CsvDataQueryResult[];
  summary?: string;
  error?: string;
  notes?: string[];
}

export type CsvWorkerRequest =
  | { id: string; type: "profile"; file: File; options?: CsvProfileOptions }
  | { id: string; type: "executePlan"; plan: AnalysisPlan }
  | { id: string; type: "executeQuery"; query: CsvDataQuery };

export type CsvWorkerResponse =
  | { id: string; type: "profileProgress"; progress: number }
  | { id: string; type: "profileComplete"; profile: CsvProfile }
  | { id: string; type: "executeProgress"; progress: number }
  | { id: string; type: "executeComplete"; result: AnalysisResult }
  | { id: string; type: "queryComplete"; result: CsvDataQueryResult }
  | { id: string; type: "error"; error: string };

export interface CsvProfileOptions {
  sampleRowLimit?: number;
  sampleValueLimit?: number;
}

export const SMALL_ATTACHMENT_MAX_BYTES = 200 * 1024;
export const LARGE_CSV_MAX_BYTES = 50 * 1024 * 1024;
export const MAX_GROUP_BY_FIELDS = 3;
export const MAX_RESULT_ROWS = 100;
export const DEFAULT_RESULT_LIMIT = 20;
export const SAMPLE_ROW_LIMIT = 20;
export const SAMPLE_VALUE_LIMIT = 10;
export const MAX_QUERY_RESULT_ROWS = 50;
export const MAX_QUERY_COLUMNS = 20;
export const MAX_QUERY_DISTINCT_VALUES = 100;
export const MAX_QUERY_ITERATIONS = 6;

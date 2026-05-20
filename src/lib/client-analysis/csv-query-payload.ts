import {
  MAX_QUERY_DISTINCT_VALUES,
  MAX_QUERY_RESULT_ROWS,
  type AnalysisResult,
  type CsvColumnProfile,
  type CsvDataQueryResult,
  type CsvProfile,
} from "./csv-types";

const MAX_PROFILE_COLUMNS_FOR_QUERY = 160;
const MAX_PROFILE_SAMPLE_VALUES_FOR_QUERY = 3;
const MAX_PROFILE_SAMPLE_ROWS_FOR_QUERY = 3;
const MAX_PREVIOUS_RESULTS_FOR_QUERY = 64;
const MAX_PREVIOUS_RESULT_ROWS_FOR_QUERY = MAX_QUERY_RESULT_ROWS;
const MAX_RELATED_FILES_FOR_QUERY = 8;
const MAX_RELATED_STAGE_SUMMARIES_FOR_QUERY = 6;
const MAX_RELATED_SUMMARY_CHARS_FOR_QUERY = 1200;

type QueryColumnProfile = Pick<
  CsvColumnProfile,
  "name" | "type" | "semanticType" | "min" | "max" | "avg"
> & {
  missingRate?: number;
  sampleValues?: string[];
};

export interface CsvQueryProfileContext {
  fileName: string;
  fileSize: number;
  rowCount: number;
  columnCount: number;
  columns: QueryColumnProfile[];
  sampleRows: CsvProfile["sampleRows"];
  dataQuality: {
    parseMetadata: CsvProfile["dataQuality"]["parseMetadata"];
    emptyRowCount: number;
    inconsistentRowCount: number;
    duplicateHeaderCount: number;
    totalMissingCells: number;
    warnings: string[];
  };
}

export interface CsvQueryResultContext {
  query: CsvDataQueryResult["query"];
  rowCount: number;
  matchedRowCount?: number;
  rows?: CsvDataQueryResult["rows"];
  values?: string[];
  stats?: CsvDataQueryResult["stats"];
  aggregateResult?: Pick<
    AnalysisResult,
    "rowCount" | "matchedRowCount" | "totalGroupCount" | "warnings"
  > & {
    resultRows: AnalysisResult["resultRows"];
  };
  warnings: string[];
}

export interface CsvRelatedFileContext {
  name: string;
  profile: CsvQueryProfileContext;
  stageSummaries?: string[];
  summary?: string;
}

type RelatedFileInput = {
  name: string;
  profile: CsvProfile | CsvQueryProfileContext;
  stageSummaries?: string[];
  summary?: string;
};

export function compactProfileForQuery(
  profile: CsvProfile | CsvQueryProfileContext,
): CsvQueryProfileContext {
  return {
    fileName: profile.fileName,
    fileSize: profile.fileSize,
    rowCount: profile.rowCount,
    columnCount: profile.columnCount,
    columns: profile.columns
      .slice(0, MAX_PROFILE_COLUMNS_FOR_QUERY)
      .map((column) => ({
        name: column.name,
        type: column.type,
        semanticType: column.semanticType,
        missingRate:
          typeof column.missingRate === "number"
            ? Number(column.missingRate.toFixed(4))
            : undefined,
        sampleValues: column.sampleValues?.slice(
          0,
          MAX_PROFILE_SAMPLE_VALUES_FOR_QUERY,
        ),
        min: column.min,
        max: column.max,
        avg:
          typeof column.avg === "number"
            ? Number(column.avg.toFixed(4))
            : undefined,
      })),
    sampleRows: profile.sampleRows.slice(0, MAX_PROFILE_SAMPLE_ROWS_FOR_QUERY),
    dataQuality: compactDataQuality(profile.dataQuality),
  };
}

export function compactPreviousResultsForQuery(
  results: Array<CsvDataQueryResult | CsvQueryResultContext>,
): CsvQueryResultContext[] {
  return results.slice(-MAX_PREVIOUS_RESULTS_FOR_QUERY).map((result) => ({
    query: result.query,
    rowCount: result.rowCount,
    matchedRowCount: result.matchedRowCount,
    rows: result.rows?.slice(
      0,
      Math.min(MAX_PREVIOUS_RESULT_ROWS_FOR_QUERY, MAX_QUERY_RESULT_ROWS),
    ),
    values: result.values?.slice(0, MAX_QUERY_DISTINCT_VALUES),
    stats: result.stats,
    aggregateResult: result.aggregateResult
      ? {
          rowCount: result.aggregateResult.rowCount,
          matchedRowCount: result.aggregateResult.matchedRowCount,
          totalGroupCount: result.aggregateResult.totalGroupCount,
          resultRows: result.aggregateResult.resultRows.slice(
            0,
            Math.min(MAX_PREVIOUS_RESULT_ROWS_FOR_QUERY, MAX_QUERY_RESULT_ROWS),
          ),
          warnings: result.aggregateResult.warnings,
        }
      : undefined,
    warnings: result.warnings,
  }));
}

export function compactRelatedFilesForQuery(
  files: RelatedFileInput[],
): CsvRelatedFileContext[] {
  return files.slice(0, MAX_RELATED_FILES_FOR_QUERY).map((file) => ({
    name: file.name,
    profile: compactProfileForQuery(file.profile),
    stageSummaries: compactStageSummaries(file.stageSummaries ?? []),
    summary: compactText(file.summary, MAX_RELATED_SUMMARY_CHARS_FOR_QUERY),
  }));
}

function compactDataQuality(
  dataQuality: CsvProfile["dataQuality"],
): CsvQueryProfileContext["dataQuality"] {
  return {
    parseMetadata: dataQuality.parseMetadata,
    emptyRowCount: dataQuality.emptyRowCount,
    inconsistentRowCount: dataQuality.inconsistentRowCount,
    duplicateHeaderCount: dataQuality.duplicateHeaderCount,
    totalMissingCells: dataQuality.totalMissingCells,
    warnings: dataQuality.warnings,
  };
}

function compactStageSummaries(summaries: string[]) {
  return summaries
    .flatMap((summary) => {
      const normalized = summary.replace(/\s+/g, " ").trim();
      return normalized ? [normalized.slice(0, 800)] : [];
    })
    .slice(-MAX_RELATED_STAGE_SUMMARIES_FOR_QUERY);
}

function compactText(value: string | undefined, maxChars: number) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxChars) : undefined;
}

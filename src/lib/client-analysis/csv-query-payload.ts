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
const MAX_PROFILE_SAMPLE_ROWS_FOR_QUERY = 1;
const MAX_PREVIOUS_RESULTS_FOR_QUERY = 8;
const MAX_PREVIOUS_RESULT_ROWS_FOR_QUERY = 20;

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
    "rowCount" | "matchedRowCount" | "warnings"
  > & {
    resultRows: AnalysisResult["resultRows"];
  };
  warnings: string[];
}

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

import type {
  AnalysisPlan,
  AnalysisResult,
  CsvProfile,
  CsvProfileSummary,
} from "./csv-types";

export function summarizeProfile(profile: CsvProfile): CsvProfileSummary {
  return {
    fileName: profile.fileName,
    fileSize: profile.fileSize,
    rowCount: profile.rowCount,
    columnCount: profile.columnCount,
    columns: profile.columns.map((column) => ({
      name: column.name,
      type: column.type,
      semanticType: column.semanticType,
    })),
    dataQuality: profile.dataQuality,
  };
}

export function buildAnalysisAttachmentContent(args: {
  profileSummary: CsvProfileSummary;
  plan?: AnalysisPlan;
  result?: AnalysisResult;
  summary?: string;
}): string {
  const { profileSummary, plan, result, summary } = args;
  const lines = [
    `[CSV 本地分析结果：${profileSummary.fileName}]`,
    `文件大小：${formatBytes(profileSummary.fileSize)}`,
    `行数：${profileSummary.rowCount}`,
    `列数：${profileSummary.columnCount}`,
    `解析：${describeParseMetadata(profileSummary.dataQuality.parseMetadata)}`,
    `字段：${profileSummary.columns
      .slice(0, 24)
      .map((column) => `${column.name}(${column.type})`)
      .join(", ")}`,
  ];

  if (plan) {
    lines.push(`分析计划：${describePlan(plan)}`);
  }

  if (result) {
    lines.push(
      `聚合结果：匹配 ${result.matchedRowCount}/${result.rowCount} 行，共 ${result.totalGroupCount} 组，返回 ${result.resultRows.length} 行。`,
    );
    lines.push(`结果预览：${JSON.stringify(result.resultRows.slice(0, 10))}`);
  }

  if (summary) {
    lines.push(`分析结论：${summary}`);
  }

  lines.push(
    "隐私说明：原始 CSV 文件保留在浏览器本地，发送给模型的只有字段画像、分析计划和聚合结果。",
  );

  return lines.join("\n");
}

export function describePlan(plan: AnalysisPlan): string {
  const groupText = plan.groupBy.length > 0 ? plan.groupBy.join(", ") : "全表";
  const metricText = plan.metrics
    .map((metric) => `${metric.agg}(${metric.field}) as ${metric.name}`)
    .join(", ");
  const filterText =
    plan.filters.length > 0
      ? `；筛选 ${plan.filters
          .map((filter) => `${filter.field} ${filter.op} ${JSON.stringify(filter.value)}`)
          .join(", ")}`
      : "";
  const rankingText = plan.ranking
    ? `；按 ${plan.ranking.sortBy} ${plan.ranking.direction} 取前 ${plan.ranking.limit}`
    : "";

  return `按 ${groupText} 分组，计算 ${metricText}${filterText}${rankingText}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function describeParseMetadata(
  metadata: CsvProfileSummary["dataQuality"]["parseMetadata"],
) {
  if (!metadata) {
    return "未记录";
  }

  return `${metadata.encoding} / ${metadata.delimiterName}，置信度 ${Math.round(metadata.confidence * 100)}%`;
}

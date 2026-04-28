import { NextRequest } from "next/server";

export const runtime = "nodejs";

type DateRange = {
  start_date: string;
  end_date: string;
};

type AvailableFile = {
  download_url: string;
  description: string;
  mime_type?: string;
  version?: number;
  persist_across_jobs?: boolean;
  file_size_bytes?: number;
};

type UploadContext = {
  url?: string;
  fields?: Record<string, string>;
};

type AgentS3Context = {
  tool_name?: string;
  job_path?: string;
  bucket_name?: string;
  region?: string;
  upload?: UploadContext;
  available_files?: Record<string, AvailableFile>;
};

type AnalyzeSalesCsvRequest = {
  analysis_brief?: string;
  planning_window?: DateRange;
  travel_window?: DateRange;
  currency?: string;
  campaign_type?: string;
  long_haul_rules?: {
    min_stage_length_km?: number;
    include_stopover_routes?: boolean;
    maximum_candidate_routes?: number;
  };
  scoring_weights?: {
    revenue_decline_weight?: number;
    passenger_decline_weight?: number;
    yield_gap_weight?: number;
    booking_conversion_weight?: number;
  };
  required_columns?: string[];
  output_artifacts?: {
    include_route_scoring_csv?: boolean;
    include_summary_json?: boolean;
  };
  agentsl_s3_context?: AgentS3Context;
};

type CsvRow = Record<string, string>;

type RouteAggregate = {
  rank?: number;
  origin: string;
  destination: string;
  via?: string;
  totalRevenue: number;
  totalPassengers: number;
  weightedYieldTotal: number;
  yieldWeight: number;
  firstHalfRevenue: number;
  secondHalfRevenue: number;
  firstHalfPassengers: number;
  secondHalfPassengers: number;
  firstHalfConversion: number;
  secondHalfConversion: number;
  firstHalfConversionWeight: number;
  secondHalfConversionWeight: number;
  rowCount: number;
  stageLengthKm?: number;
  score?: number;
  reason?: string;
  metrics?: {
    revenue_change_pct?: number;
    passenger_change_pct?: number;
    yield_change_pct?: number;
    booking_conversion_change_pct?: number;
    average_fare?: number;
    confidence_score?: number;
  };
};

const DEFAULT_REQUIRED_COLUMNS = [
  "origin",
  "destination",
  "booking_date",
  "travel_date",
  "passengers",
  "revenue",
  "yield",
];

export async function POST(req: NextRequest) {
  let body: AnalyzeSalesCsvRequest;

  try {
    body = (await req.json()) as AnalyzeSalesCsvRequest;
  } catch {
    return Response.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const validationError = validateRequest(body);
  if (validationError) {
    return Response.json(validationError, { status: 400 });
  }

  const warnings: string[] = [];
  const missingColumns = new Set<string>();
  let droppedRows = 0;

  try {
    const csvFiles = getCsvFiles(body.agentsl_s3_context?.available_files ?? {});
    const rowsByFile = await Promise.all(
      csvFiles.map(async ([filename, file]) => ({
        filename,
        rows: await downloadAndParseCsv(filename, file.download_url),
      })),
    );

    const requiredColumns =
      body.required_columns && body.required_columns.length > 0
        ? body.required_columns
        : DEFAULT_REQUIRED_COLUMNS;

    const midpoint = getMidpoint(body.planning_window!);
    const routeMap = new Map<string, RouteAggregate>();

    for (const { filename, rows } of rowsByFile) {
      if (rows.length === 0) {
        warnings.push(`${filename} is empty and was skipped.`);
        continue;
      }

      const normalizedHeaders = new Set(Object.keys(rows[0]));
      for (const column of requiredColumns) {
        const normalizedColumn = normalizeHeader(column);
        if (!normalizedHeaders.has(normalizedColumn)) {
          missingColumns.add(column);
        }
      }

      for (const row of rows) {
        const normalized = normalizeRow(row);
        const origin = normalized.origin;
        const destination = normalized.destination;
        if (!origin || !destination) {
          droppedRows += 1;
          continue;
        }

        const revenue = parseNumber(normalized.revenue);
        const passengers = parseNumber(normalized.passengers);
        const yieldValue = parseNumber(normalized.yield);
        const conversionValue =
          parseNumber(normalized.booking_conversion_rate) ??
          parseNumber(normalized.conversion_rate);
        const stageLengthKm =
          parseNumber(normalized.stage_length_km) ??
          parseNumber(normalized.distance_km) ??
          parseNumber(normalized.route_distance_km);
        const via = normalized.via || normalized.stopover || undefined;
        const travelDate = parseDate(normalized.travel_date);

        if (revenue === null || passengers === null || yieldValue === null) {
          droppedRows += 1;
          continue;
        }

        const routeKey = [origin, destination, via ?? ""].join("|");
        const aggregate =
          routeMap.get(routeKey) ??
          createRouteAggregate({ origin, destination, via, stageLengthKm });

        aggregate.totalRevenue += revenue;
        aggregate.totalPassengers += passengers;
        aggregate.weightedYieldTotal += yieldValue * Math.max(passengers, 1);
        aggregate.yieldWeight += Math.max(passengers, 1);
        aggregate.rowCount += 1;
        aggregate.stageLengthKm ??= stageLengthKm ?? undefined;

        const inSecondHalf = travelDate ? travelDate.getTime() >= midpoint : false;
        if (inSecondHalf) {
          aggregate.secondHalfRevenue += revenue;
          aggregate.secondHalfPassengers += passengers;
          if (conversionValue !== null) {
            aggregate.secondHalfConversion += conversionValue * Math.max(passengers, 1);
            aggregate.secondHalfConversionWeight += Math.max(passengers, 1);
          }
        } else {
          aggregate.firstHalfRevenue += revenue;
          aggregate.firstHalfPassengers += passengers;
          if (conversionValue !== null) {
            aggregate.firstHalfConversion += conversionValue * Math.max(passengers, 1);
            aggregate.firstHalfConversionWeight += Math.max(passengers, 1);
          }
        }

        routeMap.set(routeKey, aggregate);
      }
    }

    const aggregates = Array.from(routeMap.values());
    if (aggregates.length === 0) {
      return Response.json(
        {
          error: "No analyzable CSV rows were found.",
          details: [
            missingColumns.size > 0
              ? `Missing required columns: ${Array.from(missingColumns).join(", ")}`
              : "Uploaded CSV rows were empty or missing core values.",
          ],
        },
        { status: 400 },
      );
    }

    const scoredRoutes = scoreRoutes(aggregates, body, warnings);
    const maximumCandidateRoutes = body.long_haul_rules?.maximum_candidate_routes ?? 10;
    const candidateRoutes = scoredRoutes.slice(0, maximumCandidateRoutes);
    const topFindings = candidateRoutes.slice(0, 3).map((route) => ({
      title: `${route.origin}-${route.destination} opportunity`,
      statement:
        route.reason ??
        `${route.origin}-${route.destination} surfaced as a campaign candidate based on route-level sales performance.`,
      evidence: buildEvidence(route),
    }));

    const fileMetadata = await buildOutputArtifacts(
      candidateRoutes,
      body,
      body.agentsl_s3_context?.upload,
      warnings,
    );

    return Response.json({
      analysis_summary: {
        campaign_type: body.campaign_type ?? "long_haul_promotion",
        planning_window: body.planning_window,
        travel_window: body.travel_window,
        files_processed: rowsByFile.length,
        routes_analyzed: aggregates.length,
        notes: buildSummaryNotes(body, warnings),
      },
      candidate_routes: candidateRoutes.map(toCandidateRoute),
      key_findings: topFindings,
      data_quality: {
        missing_columns: Array.from(missingColumns),
        dropped_rows: droppedRows,
        warnings,
      },
      file_metadata: fileMetadata,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("analyze-sales-csv failed", error);

    return Response.json(
      {
        error: message,
        trace_id: crypto.randomUUID(),
      },
      { status: 500 },
    );
  }
}

function validateRequest(body: AnalyzeSalesCsvRequest) {
  const details: string[] = [];

  if (!body.analysis_brief || body.analysis_brief.trim().length < 20) {
    details.push("analysis_brief must be at least 20 characters.");
  }

  if (!isValidDateRange(body.planning_window)) {
    details.push("planning_window.start_date and planning_window.end_date are required.");
  }

  if (!isValidDateRange(body.travel_window)) {
    details.push("travel_window.start_date and travel_window.end_date are required.");
  }

  if (!body.currency || body.currency.trim().length !== 3) {
    details.push("currency must be a 3-letter ISO code.");
  }

  const availableFiles = body.agentsl_s3_context?.available_files;
  if (!availableFiles || Object.keys(availableFiles).length === 0) {
    details.push("agentsl_s3_context.available_files must contain at least one file.");
  }

  if (details.length === 0) {
    return null;
  }

  return {
    error: "Validation error or unsupported input file format",
    details,
  };
}

function isValidDateRange(range?: DateRange): range is DateRange {
  return Boolean(range?.start_date && range?.end_date);
}

function getCsvFiles(availableFiles: Record<string, AvailableFile>) {
  return Object.entries(availableFiles).filter(([filename, file]) => {
    return file.mime_type === "text/csv" || filename.toLowerCase().endsWith(".csv");
  });
}

async function downloadAndParseCsv(filename: string, downloadUrl: string) {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ${filename}: HTTP ${response.status}`);
  }

  const text = await response.text();
  return parseCsv(text);
}

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: CsvRow = {};

    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() ?? "";
    });

    return row;
  });
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeRow(row: CsvRow) {
  const normalized: CsvRow = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeHeader(key)] = value;
  }
  return normalized;
}

function parseNumber(value?: string) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/,/g, "").trim();
  if (normalized.length === 0) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value?: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getMidpoint(range: DateRange) {
  const start = new Date(range.start_date).getTime();
  const end = new Date(range.end_date).getTime();
  return start + Math.floor((end - start) / 2);
}

function createRouteAggregate(route: {
  origin: string;
  destination: string;
  via?: string;
  stageLengthKm?: number | null;
}): RouteAggregate {
  return {
    origin: route.origin,
    destination: route.destination,
    via: route.via,
    stageLengthKm: route.stageLengthKm ?? undefined,
    totalRevenue: 0,
    totalPassengers: 0,
    weightedYieldTotal: 0,
    yieldWeight: 0,
    firstHalfRevenue: 0,
    secondHalfRevenue: 0,
    firstHalfPassengers: 0,
    secondHalfPassengers: 0,
    firstHalfConversion: 0,
    secondHalfConversion: 0,
    firstHalfConversionWeight: 0,
    secondHalfConversionWeight: 0,
    rowCount: 0,
  };
}

function scoreRoutes(
  routes: RouteAggregate[],
  body: AnalyzeSalesCsvRequest,
  warnings: string[],
) {
  const weights = {
    revenue: body.scoring_weights?.revenue_decline_weight ?? 0.35,
    passengers: body.scoring_weights?.passenger_decline_weight ?? 0.3,
    yield: body.scoring_weights?.yield_gap_weight ?? 0.2,
    conversion: body.scoring_weights?.booking_conversion_weight ?? 0.15,
  };
  const minStageLengthKm = body.long_haul_rules?.min_stage_length_km ?? 3500;
  const includeStopoverRoutes = body.long_haul_rules?.include_stopover_routes ?? false;

  const hasStageLengthData = routes.some((route) => typeof route.stageLengthKm === "number");
  if (!hasStageLengthData) {
    warnings.push(
      "No stage length or distance column was found. Long-haul filtering was skipped.",
    );
  }

  return routes
    .filter((route) => {
      if (!includeStopoverRoutes && route.via) {
        return false;
      }

      if (!hasStageLengthData) {
        return true;
      }

      return (route.stageLengthKm ?? 0) >= minStageLengthKm;
    })
    .map((route) => {
      const averageYield =
        route.yieldWeight > 0 ? route.weightedYieldTotal / route.yieldWeight : undefined;
      const averageFare =
        route.totalPassengers > 0 ? route.totalRevenue / route.totalPassengers : undefined;
      const firstHalfYield =
        route.firstHalfPassengers > 0 ? route.firstHalfRevenue / route.firstHalfPassengers : undefined;
      const secondHalfYield =
        route.secondHalfPassengers > 0 ? route.secondHalfRevenue / route.secondHalfPassengers : undefined;
      const firstHalfConversion =
        route.firstHalfConversionWeight > 0
          ? route.firstHalfConversion / route.firstHalfConversionWeight
          : undefined;
      const secondHalfConversion =
        route.secondHalfConversionWeight > 0
          ? route.secondHalfConversion / route.secondHalfConversionWeight
          : undefined;

      const revenueChangePct = percentageChange(route.firstHalfRevenue, route.secondHalfRevenue);
      const passengerChangePct = percentageChange(
        route.firstHalfPassengers,
        route.secondHalfPassengers,
      );
      const yieldChangePct = percentageChange(firstHalfYield, secondHalfYield);
      const bookingConversionChangePct = percentageChange(
        firstHalfConversion,
        secondHalfConversion,
      );

      const score =
        declineScore(revenueChangePct) * weights.revenue +
        declineScore(passengerChangePct) * weights.passengers +
        declineScore(yieldChangePct) * weights.yield +
        declineScore(bookingConversionChangePct) * weights.conversion;

      const confidenceScore = buildConfidenceScore(route, hasStageLengthData);
      const reason = buildReason({
        revenueChangePct,
        passengerChangePct,
        yieldChangePct,
        bookingConversionChangePct,
        confidenceScore,
      });

      return {
        ...route,
        score,
        reason,
        metrics: {
          revenue_change_pct: revenueChangePct,
          passenger_change_pct: passengerChangePct,
          yield_change_pct: yieldChangePct,
          booking_conversion_change_pct: bookingConversionChangePct,
          average_fare: averageFare,
          confidence_score: confidenceScore,
        },
        weightedYieldTotal: averageYield ?? route.weightedYieldTotal,
      };
    })
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .map((route, index) => ({
      ...route,
      rank: index + 1,
    }));
}

function percentageChange(previous?: number, current?: number) {
  if (
    previous === undefined ||
    previous === null ||
    current === undefined ||
    current === null ||
    previous === 0
  ) {
    return 0;
  }

  return ((current - previous) / previous) * 100;
}

function declineScore(value?: number) {
  if (value === undefined || value === null) {
    return 0;
  }

  return Math.max(0, Math.min(1, (-value) / 25));
}

function buildConfidenceScore(route: RouteAggregate, hasStageLengthData: boolean) {
  let score = 0.35;

  if (route.rowCount >= 4) {
    score += 0.2;
  }
  if (route.totalPassengers > 0) {
    score += 0.15;
  }
  if (route.firstHalfRevenue > 0 && route.secondHalfRevenue > 0) {
    score += 0.15;
  }
  if (hasStageLengthData && typeof route.stageLengthKm === "number") {
    score += 0.15;
  }

  return Number(score.toFixed(2));
}

function buildReason(metrics: {
  revenueChangePct?: number;
  passengerChangePct?: number;
  yieldChangePct?: number;
  bookingConversionChangePct?: number;
  confidenceScore?: number;
}) {
  const reasons: string[] = [];

  if ((metrics.revenueChangePct ?? 0) < 0) {
    reasons.push(`revenue softened ${formatPct(metrics.revenueChangePct)} across the planning window`);
  }
  if ((metrics.passengerChangePct ?? 0) < 0) {
    reasons.push(`passenger volume declined ${formatPct(metrics.passengerChangePct)}`);
  }
  if ((metrics.yieldChangePct ?? 0) > -5) {
    reasons.push("yield remained relatively recoverable");
  }
  if ((metrics.bookingConversionChangePct ?? 0) < 0) {
    reasons.push(`booking conversion weakened ${formatPct(metrics.bookingConversionChangePct)}`);
  }

  if (reasons.length === 0) {
    reasons.push("route-level commercial signals were stable but still ranked highest in the available dataset");
  }

  return `${capitalize(reasons[0])}; confidence ${metrics.confidenceScore ?? 0}.`;
}

function formatPct(value?: number) {
  if (value === undefined || value === null) {
    return "0.0%";
  }
  return `${Math.abs(value).toFixed(1)}%`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildEvidence(route: RouteAggregate) {
  const evidence: string[] = [];

  if (route.metrics?.revenue_change_pct !== undefined) {
    evidence.push(`Revenue change: ${route.metrics.revenue_change_pct.toFixed(1)}%.`);
  }
  if (route.metrics?.passenger_change_pct !== undefined) {
    evidence.push(`Passenger change: ${route.metrics.passenger_change_pct.toFixed(1)}%.`);
  }
  if (route.metrics?.average_fare !== undefined) {
    evidence.push(`Average fare: ${route.metrics.average_fare.toFixed(2)}.`);
  }
  if (route.metrics?.confidence_score !== undefined) {
    evidence.push(`Confidence score: ${route.metrics.confidence_score.toFixed(2)}.`);
  }

  return evidence;
}

function buildSummaryNotes(body: AnalyzeSalesCsvRequest, warnings: string[]) {
  const notes = [
    `Campaign brief: ${body.analysis_brief?.trim() ?? "not provided"}`,
    `Long-haul threshold: ${body.long_haul_rules?.min_stage_length_km ?? 3500} km.`,
  ];

  return notes.concat(warnings).slice(0, 10);
}

function toCandidateRoute(route: RouteAggregate) {
  return {
    rank: route.rank,
    origin: route.origin,
    destination: route.destination,
    ...(route.via ? { via: route.via } : {}),
    reason: route.reason,
    metrics: route.metrics,
  };
}

async function buildOutputArtifacts(
  candidateRoutes: RouteAggregate[],
  body: AnalyzeSalesCsvRequest,
  upload?: UploadContext,
  warnings?: string[],
) {
  const fileMetadata: Array<{
    filename: string;
    description: string;
    persist_across_jobs: boolean;
    mime_type: string;
  }> = [];

  if (!body.output_artifacts?.include_route_scoring_csv) {
    return fileMetadata;
  }

  if (!upload?.url || !upload.fields) {
    warnings?.push("Upload context was missing, so route scoring CSV was not generated.");
    return fileMetadata;
  }

  const csvContent = [
    [
      "rank",
      "origin",
      "destination",
      "via",
      "reason",
      "revenue_change_pct",
      "passenger_change_pct",
      "yield_change_pct",
      "booking_conversion_change_pct",
      "average_fare",
      "confidence_score",
    ].join(","),
    ...candidateRoutes.map((route) =>
      [
        route.rank,
        route.origin,
        route.destination,
        route.via ?? "",
        csvEscape(route.reason ?? ""),
        route.metrics?.revenue_change_pct?.toFixed(2) ?? "",
        route.metrics?.passenger_change_pct?.toFixed(2) ?? "",
        route.metrics?.yield_change_pct?.toFixed(2) ?? "",
        route.metrics?.booking_conversion_change_pct?.toFixed(2) ?? "",
        route.metrics?.average_fare?.toFixed(2) ?? "",
        route.metrics?.confidence_score?.toFixed(2) ?? "",
      ].join(","),
    ),
  ].join("\n");

  const filename = "route_scoring.csv";
  await uploadArtifact(upload, filename, csvContent, "text/csv");

  fileMetadata.push({
    filename,
    description: "Ranked route scoring output for campaign screening",
    persist_across_jobs: true,
    mime_type: "text/csv",
  });

  if (body.output_artifacts?.include_summary_json) {
    const summaryFilename = "analysis_summary.json";
    await uploadArtifact(
      upload,
      summaryFilename,
      JSON.stringify(candidateRoutes.map(toCandidateRoute), null, 2),
      "application/json",
    );

    fileMetadata.push({
      filename: summaryFilename,
      description: "Structured route candidate output for downstream campaign agents",
      persist_across_jobs: true,
      mime_type: "application/json",
    });
  }

  return fileMetadata;
}

function csvEscape(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

async function uploadArtifact(
  upload: UploadContext,
  filename: string,
  content: string,
  mimeType: string,
) {
  const formData = new FormData();
  const fields = upload.fields ?? {};

  for (const [key, value] of Object.entries(fields)) {
    if (key === "key") {
      formData.append(key, value.replace("${filename}", filename));
    } else {
      formData.append(key, value);
    }
  }

  formData.append("file", new Blob([content], { type: mimeType }), filename);

  const response = await fetch(upload.url ?? "", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload ${filename}: HTTP ${response.status}`);
  }
}
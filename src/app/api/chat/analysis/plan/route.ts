import { getDeepSeekApiKey } from "@/lib/env";
import { validateAnalysisPlan } from "@/lib/client-analysis/csv-plan-validator";
import type { CsvProfile } from "@/lib/client-analysis/csv-types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEEPSEEK_BASE = "https://api.deepseek.com";

interface PlanRequest {
  question?: string;
  profile?: CsvProfile;
  domain?: "campaign" | "general";
}

export async function POST(request: Request) {
  try {
    const apiKey = getDeepSeekApiKey();
    const body = (await request.json()) as PlanRequest;

    if (!body.question?.trim()) {
      return Response.json(
        { ok: false, error: "question is required" },
        { status: 400 },
      );
    }

    if (!body.profile) {
      return Response.json(
        { ok: false, error: "profile is required" },
        { status: 400 },
      );
    }

    const plannerResult = await requestPlanFromModel({
      apiKey,
      question: body.question,
      profile: compactProfile(body.profile),
      domain: body.domain ?? "campaign",
    });
    const validation = validateAnalysisPlan(plannerResult.plan, body.profile);

    return Response.json({
      ok: true,
      plan: validation.plan,
      notes: [...plannerResult.notes, ...validation.warnings],
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}

async function requestPlanFromModel(args: {
  apiKey: string;
  question: string;
  profile: unknown;
  domain: "campaign" | "general";
}): Promise<{ plan: unknown; notes: string[] }> {
  const resp = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-pro",
      thinking: { type: "disabled" },
      messages: [
        {
          role: "system",
          content: buildPlannerSystemPrompt(args.domain),
        },
        {
          role: "user",
          content: JSON.stringify({
            question: args.question,
            profile: args.profile,
          }),
        },
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DeepSeek planner request failed: ${errText}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  const parsed = extractJsonObject(content);

  if (!parsed) {
    throw new Error("Planner did not return valid JSON.");
  }

  const record =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;

  return {
    plan: record?.plan ?? parsed,
    notes: extractNotes(parsed),
  };
}

function buildPlannerSystemPrompt(domain: "campaign" | "general") {
  return `You are a CSV analysis planner. Return JSON only, no markdown.

Create an executable AnalysisPlan DSL for browser-side CSV aggregation.
Never request raw CSV rows. Use only fields that exist in the provided profile.

Allowed shape:
{
  "plan": {
    "goal": "short_goal",
    "requiredFields": ["field"],
    "filters": [{"field":"field","op":"eq|contains|between|gte|lte","value":"value"}],
    "groupBy": ["field"],
    "metrics": [{"name":"metric_name","field":"field","agg":"sum|avg|min|max|count"}],
    "ranking": {"sortBy":"metric_or_group_field","direction":"asc|desc","limit":20}
  },
  "notes": ["short note"]
}

Rules:
- groupBy can contain at most 3 fields.
- ranking.limit must be between 1 and 100.
- Prefer numeric fields for sum/avg/min/max, count can use any field.
- If the question is vague, choose a useful top-N aggregate.
- If key fields are missing, return the closest executable plan and explain in notes.
- Domain is ${domain}; in campaign analysis prefer route/origin/destination, revenue, passengers/demand, yield, cabin, date when present.`;
}

function compactProfile(profile: CsvProfile) {
  return {
    fileName: profile.fileName,
    fileSize: profile.fileSize,
    rowCount: profile.rowCount,
    columnCount: profile.columnCount,
    columns: profile.columns.slice(0, 120).map((column) => ({
      name: column.name,
      type: column.type,
      semanticType: column.semanticType,
      missingRate: Number(column.missingRate.toFixed(4)),
      sampleValues: column.sampleValues.slice(0, 6),
      min: column.min,
      max: column.max,
      avg:
        typeof column.avg === "number"
          ? Number(column.avg.toFixed(4))
          : undefined,
    })),
    sampleRows: profile.sampleRows.slice(0, 5),
    dataQuality: profile.dataQuality,
  };
}

function extractJsonObject(content: unknown): unknown | null {
  if (typeof content !== "string") {
    return null;
  }

  const direct = tryParseJson(content);
  if (direct) {
    return direct;
  }

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    const parsed = tryParseJson(fenced);
    if (parsed) return parsed;
  }

  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return tryParseJson(content.slice(start, end + 1));
  }

  return null;
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractNotes(rawPlan: unknown): string[] {
  if (
    typeof rawPlan === "object" &&
    rawPlan !== null &&
    "notes" in rawPlan &&
    Array.isArray((rawPlan as { notes?: unknown }).notes)
  ) {
    return (rawPlan as { notes: unknown[] }).notes.flatMap((note) =>
      typeof note === "string" ? [note] : [],
    );
  }

  return [];
}

import { getDeepSeekApiKey } from "@/lib/env";
import type {
  AnalysisPlan,
  AnalysisResult,
  CsvProfileSummary,
} from "@/lib/client-analysis/csv-types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEEPSEEK_BASE = "https://api.deepseek.com";

interface SummarizeRequest {
  question?: string;
  profileSummary?: CsvProfileSummary;
  plan?: AnalysisPlan;
  result?: AnalysisResult;
  domain?: "campaign" | "general";
}

export async function POST(request: Request) {
  try {
    const apiKey = getDeepSeekApiKey();
    const body = (await request.json()) as SummarizeRequest;

    if (!body.question?.trim()) {
      return Response.json(
        { ok: false, error: "question is required" },
        { status: 400 },
      );
    }

    if (!body.profileSummary || !body.plan || !body.result) {
      return Response.json(
        { ok: false, error: "profileSummary, plan and result are required" },
        { status: 400 },
      );
    }

    const summary = await summarizeWithModel({
      apiKey,
      question: body.question,
      profileSummary: body.profileSummary,
      plan: body.plan,
      result: compactResult(body.result),
      domain: body.domain ?? "campaign",
    });

    return Response.json({ ok: true, summary });
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

async function summarizeWithModel(args: {
  apiKey: string;
  question: string;
  profileSummary: CsvProfileSummary;
  plan: AnalysisPlan;
  result: unknown;
  domain: "campaign" | "general";
}) {
  const resp = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-pro",
      thinking: { type: "enabled", reasoning_effort: "medium" },
      messages: [
        {
          role: "system",
          content: buildSummarizerSystemPrompt(args.domain),
        },
        {
          role: "user",
          content: JSON.stringify({
            question: args.question,
            profileSummary: args.profileSummary,
            plan: args.plan,
            result: args.result,
          }),
        },
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DeepSeek summarizer request failed: ${errText}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Summarizer returned empty content.");
  }

  return content.trim();
}

function buildSummarizerSystemPrompt(domain: "campaign" | "general") {
  return `You summarize browser-side CSV aggregation results for a chat user.

Important boundaries:
- You did not see the raw CSV rows.
- You can only use the provided profile summary, analysis plan, and aggregation result.
- Do not invent fields, rows, route names, values, or trends not present in the result.
- Explain the analysis scope and any data-quality limitations.
- Reply in the same language as the user's question.

For campaign domain, structure the answer with concise recommendations, evidence, risks, and next actions.
Domain: ${domain}.`;
}

function compactResult(result: AnalysisResult) {
  return {
    plan: result.plan,
    rowCount: result.rowCount,
    matchedRowCount: result.matchedRowCount,
    totalGroupCount: result.totalGroupCount,
    resultRows: result.resultRows.slice(0, 100),
    dataQuality: result.dataQuality,
    warnings: result.warnings,
  };
}

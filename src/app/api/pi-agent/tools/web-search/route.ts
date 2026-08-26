import { searchWeb } from "@/lib/search";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_QUERY_LENGTH = 500;
const MAX_RESULTS = 5;
const MAX_CONTENT_LENGTH = 2_500;

type SearchTopic = "general" | "news";
type SearchTimeRange = "day" | "week" | "month" | "year";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const value = (await request.json()) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Request body must be an object");
    }
    body = value as Record<string, unknown>;
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query || query.length > MAX_QUERY_LENGTH) {
    return Response.json(
      { error: `query must contain 1-${MAX_QUERY_LENGTH} characters` },
      { status: 400 },
    );
  }

  const topic: SearchTopic = body.topic === "news" ? "news" : "general";
  const timeRange = parseTimeRange(body.timeRange);

  try {
    const result = await searchWeb(query, {
      topic,
      timeRange,
      maxResults: MAX_RESULTS,
      includeAnswer: true,
      includeRawContent: "markdown",
      searchDepth: "advanced",
    });

    return Response.json({
      ok: true,
      query,
      answer: result.answer,
      verificationSummary: result.verificationSummary,
      results: result.results.map((item) => ({
        title: item.title,
        url: item.url,
        publishedDate: item.publishedDate,
        credibility: item.credibility,
        content: (item.rawContent || item.content).slice(0, MAX_CONTENT_LENGTH),
      })),
      creditsUsed: result.creditsUsed,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Web search failed" },
      { status: 502 },
    );
  }
}

function parseTimeRange(value: unknown): SearchTimeRange | undefined {
  return value === "day" ||
    value === "week" ||
    value === "month" ||
    value === "year"
    ? value
    : undefined;
}

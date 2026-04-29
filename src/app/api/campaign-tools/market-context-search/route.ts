import { NextRequest } from "next/server";
import { tavily } from "@tavily/core";
import { getTavilyApiKey } from "@/lib/env";

export const runtime = "nodejs";

// ---------- Types ----------

type DateRange = {
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
};

type RouteInput = {
  origin?: string;
  destination?: string;
  via?: string;
  priority?: number;
};

/** 搜索上下文的类型 */
type ContextType = "holiday" | "semester" | "news" | "event" | "custom";

type ContextSearchRequest = {
  /** 可选的航线列表，用于生成航线相关上下文搜索 */
  routes?: RouteInput[];
  /** 出行/活动时间窗口 */
  travel_window?: DateRange;
  /** 要搜索的上下文类型，默认全部 */
  context_types?: ContextType[];
  /** 自定义搜索词（会与自动生成的搜索词合并） */
  custom_queries?: string[];
  /** 是否包含 LLM 生成的回答摘要，默认 true */
  include_answer?: boolean;
  /** 每个上下文类型返回的最大结果数，默认 5 */
  max_results_per_query?: number;
};

type ContextSearchResult = {
  context_type: ContextType;
  query: string;
  answer?: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    published_date?: string;
    favicon?: string;
  }>;
};

type ContextSearchResponse = {
  ok: true;
  results: ContextSearchResult[];
  search_credits_used: number;
  summary?: string;
  warnings: string[];
};

// ---------- 搜索词生成 ----------

/** 根据请求参数生成 Tavily 搜索词列表 */
function buildSearchQueries(body: ContextSearchRequest): Array<{
  query: string;
  topic: "general" | "news";
  context_type: ContextType;
  time_range?: "day" | "week" | "month" | "year";
  start_date?: string;
  end_date?: string;
  country?: string;
}> {
  const queries: Array<{
    query: string;
    topic: "general" | "news";
    context_type: ContextType;
    time_range?: "day" | "week" | "month" | "year";
    start_date?: string;
    end_date?: string;
    country?: string;
  }> = [];

  const types = body.context_types ?? ["holiday", "semester", "news", "event"];
  const window = body.travel_window;
  const year = window
    ? new Date(window.start_date).getFullYear().toString()
    : new Date().getFullYear().toString();

  // 根据航线信息构建地域描述
  const locations = (body.routes ?? [])
    .map((r) => [r.origin, r.destination].filter(Boolean))
    .flat();
  const locationHint =
    locations.length > 0 ? [...new Set(locations)].join(" ") : undefined;

  for (const type of types) {
    switch (type) {
      case "holiday": {
        queries.push({
          context_type: "holiday",
          topic: "general",
          query: `${year}年 法定节假日 放假安排 调休`,
          country: "china",
        });
        if (locationHint) {
          queries.push({
            context_type: "holiday",
            topic: "general",
            query: `${locationHint} ${year} 节假日 假期`,
          });
        }
        break;
      }
      case "semester": {
        queries.push({
          context_type: "semester",
          topic: "general",
          query: `${year}年 学校校历 学期安排 寒暑假`,
          country: "china",
        });
        break;
      }
      case "news": {
        queries.push({
          context_type: "news",
          topic: "news",
          query: locationHint
            ? `${locationHint} 最新新闻 行业动态`
            : "旅游 航空 出行 最新新闻",
          time_range: window ? undefined : "week",
          start_date: window?.start_date,
          end_date: window?.end_date,
        });
        break;
      }
      case "event": {
        queries.push({
          context_type: "event",
          topic: "news",
          query: locationHint
            ? `${locationHint} 大型活动 展会 赛事 公告`
            : "大型活动 展会 体育赛事 演唱会 公告",
          time_range: window ? undefined : "month",
          start_date: window?.start_date,
          end_date: window?.end_date,
        });
        break;
      }
    }
  }

  // 自定义搜索词
  for (const q of body.custom_queries ?? []) {
    queries.push({
      context_type: "custom",
      topic:
        q.toLowerCase().includes("新闻") || q.toLowerCase().includes("最新")
          ? "news"
          : "general",
      query: q,
    });
  }

  return queries;
}

// ---------- Handler ----------

export async function POST(req: NextRequest) {
  let body: ContextSearchRequest;

  try {
    body = (await req.json()) as ContextSearchRequest;
  } catch {
    return Response.json(
      { ok: false, error: "Invalid JSON request body" },
      { status: 400 },
    );
  }

  if (!body.context_types && !body.custom_queries) {
    // 默认搜索所有类型
    body.context_types = ["holiday", "semester", "news", "event"];
  }

  const apiKey = getTavilyApiKey();
  const client = tavily({ apiKey });

  const searchQueries = buildSearchQueries(body);
  if (searchQueries.length === 0) {
    return Response.json(
      {
        ok: false,
        error: "No search queries could be generated from the request",
      },
      { status: 400 },
    );
  }

  // 限制并发，避免打到 rate limit
  const concurrency = 3;
  const results: ContextSearchResult[] = [];
  const warnings: string[] = [];
  let totalCredits = 0;

  for (let i = 0; i < searchQueries.length; i += concurrency) {
    const batch = searchQueries.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (sq) => {
        try {
          const resp = await client.search(sq.query, {
            topic: sq.topic,
            searchDepth: "basic",
            maxResults: body.max_results_per_query ?? 5,
            includeAnswer: body.include_answer ?? true,
            timeRange: sq.time_range,
            startDate: sq.start_date,
            endDate: sq.end_date,
            country: sq.country === "china" ? "china" : undefined,
            includeFavicon: true,
          });

          totalCredits += resp.usage?.credits ?? 0;

          return {
            context_type: sq.context_type,
            query: sq.query,
            answer: resp.answer,
            results: resp.results.map((r) => ({
              title: r.title,
              url: r.url,
              content: r.content,
              score: r.score,
              published_date: r.publishedDate,
              favicon: r.favicon,
            })),
          } satisfies ContextSearchResult;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(`Search query "${sq.query}" failed: ${msg}`);
          return null;
        }
      }),
    );

    for (const settled of batchResults) {
      if (settled.status === "fulfilled" && settled.value) {
        results.push(settled.value);
      }
    }
  }

  // 生成摘要
  let summary: string | undefined;
  if (results.length > 0) {
    const answers = results
      .map((r) => r.answer)
      .filter((a): a is string => !!a);
    if (answers.length > 0) {
      summary = answers.join("\n\n");
    }
  }

  if (totalCredits > 0) {
    warnings.push(`Tavily API credits used: ${totalCredits}`);
  }

  return Response.json({
    ok: true,
    results,
    search_credits_used: totalCredits,
    ...(summary ? { summary } : {}),
    warnings,
  } satisfies ContextSearchResponse);
}

import { tavily } from "@tavily/core";
import { getTavilyApiKey } from "@/lib/env";

/** 搜索结果条目 */
export interface SearchResultItem {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

/** 搜索结果 */
export interface SearchResponse {
  answer?: string;
  results: SearchResultItem[];
  creditsUsed: number;
}

/**
 * 使用 Tavily 搜索互联网，返回结构化结果。
 * 由 AI 在需要实时信息时自主调用。
 */
export async function searchWeb(
  query: string,
  options?: {
    topic?: "general" | "news";
    maxResults?: number;
    includeAnswer?: boolean;
    timeRange?: "day" | "week" | "month" | "year";
    country?: string;
  },
): Promise<SearchResponse> {
  const apiKey = getTavilyApiKey();
  const client = tavily({ apiKey });

  const resp = await client.search(query, {
    topic: options?.topic ?? "general",
    searchDepth: "basic",
    maxResults: options?.maxResults ?? 5,
    includeAnswer: options?.includeAnswer ?? true,
    timeRange: options?.timeRange,
    country: options?.country,
    includeFavicon: true,
  });

  return {
    answer: resp.answer,
    results: resp.results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
      publishedDate: r.publishedDate,
    })),
    creditsUsed: resp.usage?.credits ?? 0,
  };
}

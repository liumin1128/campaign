import { tavily } from "@tavily/core";
import { getTavilyApiKey } from "@/lib/env";

export type CredibilityLevel = "high" | "medium" | "low";

export interface CredibilityAssessment {
  level: CredibilityLevel;
  reasons: string[];
}

/** 搜索结果条目 */
export interface SearchResultItem {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
  credibility: CredibilityAssessment;
}

/** 搜索结果 */
export interface SearchResponse {
  answer?: string;
  results: SearchResultItem[];
  creditsUsed: number;
  verificationSummary: string;
}

const OFFICIAL_DOMAIN_PATTERNS = [
  /(^|\.)gov\.cn$/i,
  /(^|\.)edu\.cn$/i,
  /(^|\.)gov$/i,
  /(^|\.)edu$/i,
  /(^|\.)org$/i,
  /(^|\.)iata\.org$/i,
  /(^|\.)icao\.int$/i,
];

const SECONDARY_DOMAIN_PATTERNS = [
  /(^|\.)com\.cn$/i,
  /(^|\.)org\.cn$/i,
  /(^|\.)net\.cn$/i,
];

function getHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function hasRecentPublishedDate(publishedDate?: string): boolean {
  if (!publishedDate) return false;

  const date = new Date(publishedDate);
  if (Number.isNaN(date.getTime())) return false;

  const twoYearsMs = 1000 * 60 * 60 * 24 * 365 * 2;
  return Date.now() - date.getTime() <= twoYearsMs;
}

export function assessSearchResultCredibility(input: {
  url: string;
  score?: number;
  publishedDate?: string;
}): CredibilityAssessment {
  const reasons: string[] = [];
  const hostname = getHostname(input.url);
  const score = input.score ?? 0;
  let points = 0;

  if (
    hostname &&
    OFFICIAL_DOMAIN_PATTERNS.some((pattern) => pattern.test(hostname))
  ) {
    points += 2;
    reasons.push("官方/机构域名");
  } else if (
    hostname &&
    SECONDARY_DOMAIN_PATTERNS.some((pattern) => pattern.test(hostname))
  ) {
    points += 1;
    reasons.push("较稳定的组织域名");
  } else if (hostname) {
    reasons.push(`普通来源域名: ${hostname}`);
  } else {
    reasons.push("URL 无法解析");
  }

  if (score >= 0.85) {
    points += 1;
    reasons.push("搜索相关性高");
  } else if (score < 0.5) {
    points -= 1;
    reasons.push("搜索相关性偏低");
  }

  if (hasRecentPublishedDate(input.publishedDate)) {
    points += 1;
    reasons.push("发布时间较新");
  } else if (input.publishedDate) {
    reasons.push("发布时间较旧或无法确认时效");
  } else {
    reasons.push("缺少发布时间");
  }

  if (points >= 3) return { level: "high", reasons };
  if (points >= 1) return { level: "medium", reasons };
  return { level: "low", reasons };
}

export function buildVerificationSummary(
  results: Array<{ url: string; credibility: CredibilityAssessment }>,
): string {
  if (results.length === 0) {
    return "未找到可用于事实核验的搜索结果。";
  }

  const sourceHosts = new Set(
    results
      .map((item) => getHostname(item.url))
      .filter((host): host is string => !!host),
  );
  const highCount = results.filter(
    (item) => item.credibility.level === "high",
  ).length;
  const mediumCount = results.filter(
    (item) => item.credibility.level === "medium",
  ).length;

  const crossChecked = sourceHosts.size >= 2;
  const confidence =
    highCount > 0 && crossChecked
      ? "高"
      : highCount + mediumCount >= 2
        ? "中"
        : "低";

  return `事实核验置信度: ${confidence}；独立来源数: ${sourceHosts.size}；高可信来源: ${highCount}；中可信来源: ${mediumCount}。${crossChecked ? "具备多来源交叉参考。" : "缺少多来源交叉验证，回答需保守表述。"}`;
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

  const results = resp.results.map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    score: r.score,
    publishedDate: r.publishedDate,
    credibility: assessSearchResultCredibility({
      url: r.url,
      score: r.score,
      publishedDate: r.publishedDate,
    }),
  }));

  return {
    answer: resp.answer,
    results,
    creditsUsed: resp.usage?.credits ?? 0,
    verificationSummary: buildVerificationSummary(results),
  };
}

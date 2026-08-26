export interface PiTaskRoute {
  requestsWebSearch: boolean;
  referencesCsvContext: boolean;
}

const WEB_SEARCH_PATTERNS = [
  /联网/i,
  /互联网/i,
  /上网/i,
  /web\s*search/i,
  /(?:搜索|检索|查找).{0,16}(?:新闻|热点|事件|资讯|政策|活动|赛事|节假日)/i,
  /(?:热点新闻|最新新闻|时事新闻)/i,
];

const CSV_CONTEXT_PATTERNS = [
  /\bcsv\b/i,
  /(?:上传|已上传|前面|上述|这些|该).{0,10}(?:文件|数据|表格|分析)/i,
  /(?:继续|重新).{0,8}(?:分析|查询|读取)(?:文件|数据|表格)?/i,
  /(?:基于|结合).{0,16}(?:文件|数据|表格|分析结果)/i,
];

export function classifyPiTask(prompt: string): PiTaskRoute {
  return {
    requestsWebSearch: WEB_SEARCH_PATTERNS.some((pattern) => pattern.test(prompt)),
    referencesCsvContext: CSV_CONTEXT_PATTERNS.some((pattern) =>
      pattern.test(prompt),
    ),
  };
}

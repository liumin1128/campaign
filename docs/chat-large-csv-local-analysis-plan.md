# Chat 大 CSV 本地分析架构实施计划

## 1. 背景

当前 Chat 模块支持上传 CSV/TXT/MD/JSON 文件，并在前端通过 `FileReader.readAsText` 读取文件内容。CSV 会被转换成 Markdown 表格后拼入用户消息上下文，再提交给 `/api/chat` 由 LLM 处理。

该方案适合小文件，但不适合约 20MB 甚至更大的 CSV：

- CSV 原文或 Markdown 表格会显著膨胀，容易超过 LLM 上下文限制。
- 大文本进入 Zustand/sessionStorage，可能导致浏览器存储和渲染压力。
- 大 JSON body 发往 `/api/chat`，后端和网络传输压力较大。
- LLM 不擅长精确执行全量统计、分组聚合、排序筛选等计算任务。
- 企业数据场景中，上传原始 CSV 也可能带来隐私与合规顾虑。

因此需要将“大 CSV 直接入模”改为“本地预处理 + LLM 规划/解释”的架构。

## 2. 目标

实现一套适合 Chat 模块的大 CSV 分析流程：

```text
CSV 原始文件留在浏览器
  ↓
前端 Web Worker 解析 CSV 并生成 profile
  ↓
后端 LLM Planner 根据用户问题和 profile 生成分析计划
  ↓
前端校验计划并执行聚合分析
  ↓
后端 LLM Summarizer 基于聚合结果生成业务结论
  ↓
Chat 展示分析结果并支持后续追问
```

核心目标：

1. 原始 CSV 不上传后端。
2. 原始 CSV 不进入 LLM prompt。
3. 原始 CSV 不进入 Zustand/sessionStorage。
4. LLM 只负责理解需求、生成分析计划、解释结果。
5. 前端程序负责确定性解析、统计、聚合和排序。
6. 第一版支持约 20MB CSV 的本地分析。

## 3. 非目标

第一版暂不实现：

- 后端文件上传和对象存储。
- 后台异步任务队列。
- 多人共享同一份 CSV 原始数据。
- 刷新页面后自动恢复原始文件分析能力。
- 完整 SQL 查询引擎。
- 高级可视化报表。
- 复杂机器学习预测。

这些可以作为后续增强。

## 4. 总体架构

### 4.1 模块划分

```text
前端 Chat UI
  - 文件选择
  - 分析状态展示
  - 分析结果卡片
  - 用户追问入口

前端本地分析模块
  - Web Worker CSV 解析
  - CSV Profile 生成
  - 分析计划校验
  - 分析计划执行
  - 聚合结果生成

Next.js 后端 LLM 网关
  - /api/chat/analysis/plan
  - /api/chat/analysis/summarize

LLM
  - Planner：根据用户问题和字段画像生成 JSON DSL
  - Summarizer：根据聚合结果生成业务解释
```

### 4.2 数据流

```text
1. 用户选择 CSV 文件
2. Chat 前端判断文件大小
3. 大 CSV 进入本地分析流程
4. Web Worker 读取并解析 CSV
5. Worker 生成 CsvProfile
6. 前端将 CsvProfile + 用户问题发送给 /api/chat/analysis/plan
7. 后端调用 LLM 返回 AnalysisPlan JSON
8. 前端校验 AnalysisPlan
9. Worker 按 AnalysisPlan 执行聚合
10. 前端将 AnalysisResult + 用户问题发送给 /api/chat/analysis/summarize
11. 后端调用 LLM 返回自然语言分析结论
12. Chat 将结论作为 assistant message 展示
```

## 5. 关键设计原则

### 5.1 原始 CSV 不离开浏览器

后端只接收：

- 文件 profile。
- 字段列表。
- 样例值。
- 数据质量摘要。
- 聚合结果。
- 用户问题。

后端不接收：

- 原始 CSV 文件。
- 全量 rows。
- 全量 CSV 文本。

### 5.2 使用 Web Worker 避免 UI 卡顿

20MB CSV 解析和聚合不能在 React 主线程执行。必须放入 Web Worker。

主线程负责 UI 与状态管理，Worker 负责耗时计算。

### 5.3 使用结构化 DSL 表达分析计划

LLM 不返回自然语言计划，而是返回可校验、可执行的 JSON DSL。

示例：

```json
{
  "goal": "identify_campaign_candidate_routes",
  "requiredFields": ["origin", "destination", "revenue", "passengers"],
  "filters": [],
  "groupBy": ["origin", "destination"],
  "metrics": [
    { "name": "total_revenue", "field": "revenue", "agg": "sum" },
    { "name": "total_passengers", "field": "passengers", "agg": "sum" }
  ],
  "ranking": {
    "sortBy": "total_revenue",
    "direction": "desc",
    "limit": 20
  }
}
```

### 5.4 不信任 LLM 输出

LLM 生成的 plan 必须经过前端校验：

- 字段必须存在。
- 聚合函数必须在白名单内。
- filter 操作符必须在白名单内。
- groupBy 字段数必须受限。
- limit 必须受限。
- 不合法计划要修复或 fallback。

### 5.5 第一版优先简单可用

第一版以 20MB CSV 为主要目标，可先选择“Worker 内存保留 rows”的方式。后续如需支持更大文件，再改成“按 plan 二次扫描 CSV，边读边聚合”。

## 6. 目录与文件规划

### 6.1 新增前端本地分析模块

```text
src/lib/client-analysis/
  csv-types.ts
  csv-worker.ts
  csv-worker-client.ts
  csv-profiler.ts
  csv-plan-validator.ts
  csv-plan-executor.ts
  csv-analysis-prompts.ts
```

职责：

| 文件 | 职责 |
|---|---|
| `csv-types.ts` | 定义 CsvProfile、AnalysisPlan、AnalysisResult 等类型 |
| `csv-worker.ts` | Worker 入口，接收 profile/execute 命令 |
| `csv-worker-client.ts` | 主线程封装 Worker 调用 |
| `csv-profiler.ts` | 生成字段画像、样例、数据质量统计 |
| `csv-plan-validator.ts` | 校验 LLM 返回的计划 |
| `csv-plan-executor.ts` | 执行 filter/groupBy/aggregate/ranking |
| `csv-analysis-prompts.ts` | 构造给 LLM 的 planner/summarizer 输入摘要 |

### 6.2 新增后端 API

```text
src/app/api/chat/analysis/plan/route.ts
src/app/api/chat/analysis/summarize/route.ts
```

职责：

| API | 职责 |
|---|---|
| `/api/chat/analysis/plan` | 接收用户问题和 CsvProfile，调用 LLM 返回 AnalysisPlan |
| `/api/chat/analysis/summarize` | 接收用户问题、plan、result，调用 LLM 返回分析结论 |

### 6.3 修改现有 Chat 模块

可能涉及：

```text
src/components/chat/types.ts
src/components/chat/utils.ts
src/components/chat/chat-input.tsx
src/hooks/use-chat.ts
```

修改点：

- `FileAttachment` 增加 `csv-analysis` 类型。
- 大 CSV 不再 `readAsText` 后拼入 content。
- 文件选择后进入本地分析流程。
- Chat 附件卡片展示分析状态。
- 发送消息时只带 profile/result summary，不带原始 CSV。

## 7. 类型设计

### 7.1 CsvProfile

```ts
export interface CsvProfile {
  fileName: string;
  fileSize: number;
  rowCount: number;
  columnCount: number;
  columns: CsvColumnProfile[];
  sampleRows: CsvRow[];
  dataQuality: CsvDataQuality;
}
```

### 7.2 CsvColumnProfile

```ts
export interface CsvColumnProfile {
  name: string;
  type: "string" | "number" | "date" | "boolean" | "unknown";
  semanticType?:
    | "route"
    | "origin"
    | "destination"
    | "date"
    | "revenue"
    | "demand"
    | "yield"
    | "cabin"
    | "dimension"
    | "metric"
    | "id"
    | "unknown";
  missingCount: number;
  missingRate: number;
  sampleValues: string[];
  uniqueSampleCount: number;
  min?: number | string;
  max?: number | string;
  avg?: number;
}
```

### 7.3 AnalysisPlan

```ts
export interface AnalysisPlan {
  goal: string;
  requiredFields: string[];
  filters: FilterRule[];
  groupBy: string[];
  metrics: MetricRule[];
  ranking?: RankingRule;
}

export interface FilterRule {
  field: string;
  op: "eq" | "contains" | "between" | "gte" | "lte";
  value: string | number | [string | number, string | number];
}

export interface MetricRule {
  name: string;
  field: string;
  agg: "sum" | "avg" | "min" | "max" | "count";
}

export interface RankingRule {
  sortBy: string;
  direction: "asc" | "desc";
  limit: number;
}
```

### 7.4 AnalysisResult

```ts
export interface AnalysisResult {
  plan: AnalysisPlan;
  rowCount: number;
  matchedRowCount: number;
  resultRows: Array<Record<string, string | number | null>>;
  dataQuality: CsvDataQuality;
  warnings: string[];
}
```

### 7.5 FileAttachment 扩展

```ts
export interface FileAttachment {
  name: string;
  type: "csv" | "text" | "csv-analysis";
  content?: string;
  size?: number;
  analysis?: {
    status: "profiling" | "planning" | "executing" | "summarizing" | "completed" | "failed";
    profile?: CsvProfile;
    plan?: AnalysisPlan;
    result?: AnalysisResult;
    summary?: string;
    error?: string;
  };
}
```

## 8. 文件大小分流策略

建议阈值：

```text
<= 200KB
  沿用当前小文件逻辑，可直接读取文本并作为附件内容。

200KB ~ 50MB
  使用本地 CSV 分析流程。

> 50MB
  第一版提示暂不支持，后续可升级为流式扫描或服务端异步任务。
```

原因：

- 200KB 以下直接进入聊天上下文风险较低。
- 20MB 是本方案第一阶段重点支持范围。
- 50MB 以上在浏览器内存中解析为 JS object 后风险较高。

## 9. Web Worker 设计

### 9.1 Worker 请求

```ts
export type CsvWorkerRequest =
  | { type: "profile"; file: File; options?: CsvProfileOptions }
  | { type: "executePlan"; plan: AnalysisPlan };
```

### 9.2 Worker 响应

```ts
export type CsvWorkerResponse =
  | { type: "profileProgress"; progress: number }
  | { type: "profileComplete"; profile: CsvProfile }
  | { type: "executeProgress"; progress: number }
  | { type: "executeComplete"; result: AnalysisResult }
  | { type: "error"; error: string };
```

### 9.3 Worker 状态

第一版可在 Worker 内保留 rows：

```ts
interface WorkerState {
  fileName?: string;
  headers: string[];
  rows: CsvRow[];
  profile?: CsvProfile;
}
```

后续升级方向：

- 不保留 rows。
- 持有 File 引用。
- 每次 executePlan 重新扫描文件。
- 边读边聚合，减少内存占用。

## 10. CSV 解析策略

### 10.1 第一版解析能力

需要支持：

- 逗号分隔。
- 首行为表头。
- 双引号包裹字段。
- 双引号内逗号。
- 双引号转义。
- 空值。

### 10.2 可选依赖

可选使用成熟库：

- `papaparse`：浏览器侧成熟，支持 Worker/流式解析。

如果不引入依赖，也可以先实现简易解析器，但要注意 CSV 引号规则。考虑稳定性，建议使用成熟库。

## 11. 字段语义识别

前端 profile 阶段先通过规则识别字段语义，辅助 LLM 规划。

示例规则：

```ts
const FIELD_HINTS = {
  origin: ["origin", "from", "dep", "departure"],
  destination: ["destination", "to", "arr", "arrival"],
  route: ["route", "od", "city_pair", "market"],
  revenue: ["revenue", "sales", "amount", "fare"],
  demand: ["passenger", "pax", "booking", "ticket"],
  yield: ["yield", "unit_revenue"],
  date: ["date", "month", "week", "travel_date", "booking_date"],
  cabin: ["cabin", "class", "rbd"]
};
```

该识别结果不作为最终结论，只作为 planner 输入。

## 12. LLM Planner API 设计

### 12.1 Request

```ts
interface PlanRequest {
  question: string;
  profile: CsvProfile;
  domain?: "campaign" | "general";
}
```

### 12.2 Response

```ts
interface PlanResponse {
  plan: AnalysisPlan;
  notes?: string[];
}
```

### 12.3 Planner Prompt 要求

必须要求模型：

- 只输出 JSON。
- 只能使用 profile 中存在的字段。
- 只能使用允许的操作符和聚合函数。
- 优先选择与用户问题相关的字段。
- 如果字段不足，要返回可执行的替代计划，并在 notes 中说明。
- limit 不超过系统上限。

## 13. Plan 校验与 fallback

### 13.1 白名单

```ts
const ALLOWED_AGGS = ["sum", "avg", "min", "max", "count"];
const ALLOWED_OPS = ["eq", "contains", "between", "gte", "lte"];
const MAX_GROUP_BY_FIELDS = 3;
const MAX_RESULT_ROWS = 100;
```

### 13.2 校验规则

- `requiredFields` 必须存在于 CSV 表头中。
- `filters[].field` 必须存在。
- `filters[].op` 必须在白名单。
- `groupBy` 字段必须存在。
- `metrics[].field` 必须存在。
- `metrics[].agg` 必须在白名单。
- `ranking.sortBy` 必须是 groupBy 字段或 metric name。
- `ranking.limit` 必须大于 0 且不超过 `MAX_RESULT_ROWS`。

### 13.3 fallback 策略

如果 LLM plan 不合法：

1. 尝试移除非法字段、非法 filter、非法 metric。
2. 如果修复后仍不可执行，则使用默认计划。
3. 默认计划优先选择：
   - 分类字段作为 groupBy。
   - 数值字段作为 metrics。
   - count 作为保底 metric。

Campaign 默认计划：

- groupBy：origin + destination 或 route。
- metrics：revenue sum、passengers sum、yield avg。
- ranking：按 revenue 或 passengers desc top 20。

## 14. Plan Executor 设计

第一版支持：

- filter：`eq`、`contains`、`between`、`gte`、`lte`。
- groupBy：最多 3 个字段。
- metrics：`sum`、`avg`、`min`、`max`、`count`。
- ranking：单字段排序 + limit。

执行流程：

```text
for each row:
  1. 应用 filters
  2. 生成 group key
  3. 初始化 group aggregate
  4. 更新 metric 中间值

聚合完成后：
  1. 计算 avg
  2. 转换为 resultRows
  3. 排序
  4. 截断 limit
  5. 返回 AnalysisResult
```

## 15. LLM Summarizer API 设计

### 15.1 Request

```ts
interface SummarizeRequest {
  question: string;
  profileSummary: Pick<CsvProfile, "fileName" | "rowCount" | "columnCount" | "dataQuality">;
  plan: AnalysisPlan;
  result: AnalysisResult;
  domain?: "campaign" | "general";
}
```

### 15.2 Response

```ts
interface SummarizeResponse {
  summary: string;
}
```

### 15.3 Summarizer 要求

- 只能基于 result 和 profile 回答。
- 不得声称看过原始全量 CSV。
- 需要说明分析口径。
- 需要指出数据质量限制。
- Campaign 场景下输出推荐、理由、风险、下一步行动。

## 16. Chat UI 交互设计

### 16.1 文件选择后状态

大 CSV 附件展示状态：

```text
正在读取字段...
正在生成分析计划...
正在执行聚合...
正在生成结论...
分析完成
分析失败
```

### 16.2 分析结果卡片

展示：

- 文件名。
- 文件大小。
- 行数 / 列数。
- 识别出的关键字段。
- 分析状态。
- LLM 总结摘要。

### 16.3 消息内容

当用户发送消息时，不拼接原始 CSV，只拼接：

```text
[CSV 本地分析结果：sales.csv]
行数：238912
列数：18
分析计划：按 origin,destination 聚合 revenue/passengers/yield
聚合结果摘要：...
LLM 总结：...
```

## 17. 多轮追问设计

第一版可以在当前页面生命周期内支持多轮追问。

流程：

```text
用户追问
  ↓
使用已有 CsvProfile + 新问题请求新 plan
  ↓
Worker 基于已有 rows 执行新 plan
  ↓
Summarizer 输出新结论
```

限制：

- 页面刷新后 File/Worker 状态丢失。
- 刷新后需要用户重新选择 CSV。

后续增强：

- 使用 File System Access API 请求用户授权后恢复文件句柄。
- 或引入服务端存储模式。

## 18. 错误处理

需要覆盖：

- 文件类型不支持。
- 文件过大。
- CSV 解析失败。
- 表头为空。
- 行字段数量不一致。
- 无可用数值字段。
- LLM plan 不是合法 JSON。
- LLM plan 引用不存在字段。
- executor 结果为空。
- summarizer 调用失败。

UI 不应静默失败，需要展示明确提示。

## 19. 性能与安全

### 19.1 性能

- 解析放 Worker。
- 限制 sampleRows 数量，例如最多 20 行。
- 限制 sampleValues 数量，例如每列最多 10 个。
- 限制 resultRows，例如最多 100 行。
- 避免将 rows 放入 React state。
- 避免将 profile/result 大对象持久化到 sessionStorage。

### 19.2 隐私

- 默认不上传原始 CSV。
- 后端日志不要打印 profile/result 全量内容。
- 前端提示用户：仅字段画像和聚合结果会发送给模型。

### 19.3 安全

- Planner 输出必须校验。
- 后端 prompt 不接受原始 CSV。
- API request body 需要大小限制意识，避免过大的 resultRows。

## 20. 测试计划

### 20.1 单元测试

优先测试纯函数：

- CSV 行解析。
- 字段类型推断。
- 字段语义识别。
- plan 校验。
- filter 执行。
- groupBy 聚合。
- ranking 排序。
- fallback plan 生成。

### 20.2 手工测试

准备 CSV：

1. 小 CSV：几十行。
2. 中 CSV：几千行。
3. 大 CSV：约 20MB。
4. 异常 CSV：缺字段、空值、非法日期、带引号逗号。

验证：

- UI 不明显卡顿。
- profile 正确。
- LLM plan 可执行。
- 聚合结果合理。
- LLM 总结不编造原始数据。
- 原始 CSV 未进入 Network 请求。

### 20.3 验证原始文件未上传

在浏览器 Network 面板检查：

- `/api/chat/analysis/plan` 只包含 profile。
- `/api/chat/analysis/summarize` 只包含 result。
- 没有请求包含 CSV 原文。

## 21. 分阶段实施计划

### Phase 1：基础能力闭环

目标：完成大 CSV 本地分析主链路。

任务：

1. 新增 `src/lib/client-analysis/csv-types.ts`。
2. 新增 CSV profile 生成逻辑。
3. 新增 Worker 与 Worker client。
4. 新增 Planner API。
5. 新增 Summarizer API。
6. 新增 plan validator。
7. 新增 plan executor。
8. Chat 文件上传逻辑接入大文件分流。
9. Chat 展示分析状态和结果。

验收：

- 20MB CSV 可完成 profile、plan、execute、summarize。
- 原始 CSV 不上传。
- Chat 能展示最终分析结论。

### Phase 2：Campaign 业务增强

目标：提高活动营销场景分析质量。

任务：

1. 增强字段语义识别。
2. 增加 campaign 默认 fallback plan。
3. 支持 route/origin/destination/cabin/date/revenue/passengers/yield 等字段。
4. 增加候选航线评分逻辑。
5. Summarizer 输出推荐航线、理由、风险、下一步行动。

验收：

- 对 airline sales CSV 能输出 campaign candidate routes。
- 结果包含数据证据和分析口径。

### Phase 3：多轮追问

目标：用户能基于同一 CSV 连续提问。

任务：

1. Worker 保留当前 CSV rows/profile。
2. 新问题触发新 planner。
3. Worker 执行新 plan。
4. Chat 将新结果作为后续消息展示。

验收：

- 用户可追问“按 cabin class 再分析”。
- 不需要重新选择文件。

### Phase 4：大文件与生产增强

目标：支持更大文件和更稳定体验。

任务：

1. 从内存 rows 模式升级为按需扫描模式。
2. 支持进度百分比。
3. 支持取消分析。
4. 支持更严格的 body/result size 限制。
5. 评估是否引入服务端异步任务模式。

验收：

- 50MB 级别 CSV 体验可接受。
- 取消与失败恢复可靠。

## 22. 风险与应对

| 风险 | 应对 |
|---|---|
| Worker 解析 20MB CSV 内存占用高 | 第一版限制 50MB，后续改为边读边聚合 |
| LLM 返回非法 JSON | 使用 JSON 抽取、校验、fallback plan |
| 用户问题需要原始明细 | 返回“当前仅支持聚合分析”，引导用户选择更具体维度 |
| 聚合结果仍过大 | 限制 resultRows，默认 top 100 |
| 字段语义识别错误 | 允许 LLM 基于 sample 修正，UI 后续可支持用户手动映射字段 |
| 页面刷新丢失文件 | 第一版接受限制，后续引入文件句柄或服务端存储 |

## 23. 后续可选增强

- 用户手动字段映射面板。
- 分析计划预览与确认。
- 图表展示 Top routes / trend。
- 支持 Excel。
- 支持多个 CSV 合并分析。
- 支持导出分析报告。
- 支持将分析结果转 campaign proposal。
- 支持服务端异步模式作为高级选项。

## 24. 推荐结论

第一版建议优先实现 **Browser-side Data Agent**：

```text
Browser CSV Executor + Server LLM Planner/Summarizer
```

该方案最适合当前 Chat 模块：

- 改动范围可控。
- 不上传原始 CSV。
- 避免 LLM 上下文爆炸。
- 适合 20MB 级 CSV。
- 后续可平滑升级为服务端异步分析。

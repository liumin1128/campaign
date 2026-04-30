import type { Language, AgentOption, Message } from "./types";
import { GLOBAL_EMPHASIS, SEARCH_WEB_SYSTEM_PROMPT } from "./system-prompts";

// ============= 文案翻译 =============

const translations = {
  zh: {
    // Agent 名称/描述
    agent_none_name: "无",
    agent_none_desc: "不使用专属代理，直接与通用 AI 对话",
    agent_data_analysis_name: "数据分析",
    agent_data_analysis_desc: "销售数据分析和商业洞察提取",
    agent_market_analysis_name: "市场分析",
    agent_market_analysis_desc: "市场竞争、定价基准分析、实时市场情报",
    agent_campaign_planning_name: "营销策划",
    agent_campaign_planning_desc: "营销活动策划与提案生成",

    // 欢迎语
    welcome_message: "有什么可以帮助你的？",

    // Chat 页面
    page_title: "AI Chat",
    page_desc: "与 AI 助手进行对话 · 支持流式输出",

    // 输入框
    chat_input_placeholder: "输入消息，Shift+Enter 换行...",
    chat_input_loading_placeholder: "AI 正在回复...",
    upload_file_title: "上传文件（支持 CSV）",
    stop_title: "停止生成",
    send_hint: "回车发送 · 支持 CSV 文件上传解析",
    loading_hint: "正在生成回复，点击停止按钮中断",

    // 会话列表
    session_title: "对话",
    session_new: "新建",
    session_empty: "暂无对话",
    session_empty_preview: "（空）",
    session_waiting: "等待回复…",
    session_count: "{n} 条",
    session_new_title: "新对话",

    // Agent 选择器
    agent_label: "Agent:",

    // 思考过程
    reasoning_title: "思考过程",
    reasoning_collapsed: "（过长已折叠）",

    // 文件类型
    file_type_csv: "CSV",
    file_type_text: "文本",

    // 语言切换 tooltip
    lang_switch_to_zh: "切换到中文回复",
    lang_switch_to_en: "切换到英文回复",

    // 引用消息
    quote_title: "引用此消息",
    quote_from: "来自: {session}",
    quote_you: "你",
    quote_assistant: "AI",
    quote_remove: "移除引用",
    quote_show_full: "点击查看完整内容",

    // 错误提示
    stopped: "（已停止生成）",
    error_stream: "❌ 无法读取响应流",
    error_network_prefix: "❌ 网络错误: ",
  },
  en: {
    agent_none_name: "None",
    agent_none_desc:
      "Chat directly with the general AI without a dedicated agent",
    agent_data_analysis_name: "Data Analysis",
    agent_data_analysis_desc:
      "Sales data analysis and business insight extraction",
    agent_market_analysis_name: "Market Analysis",
    agent_market_analysis_desc:
      "Market competition, pricing benchmark, real-time market intelligence",
    agent_campaign_planning_name: "Campaign Planning",
    agent_campaign_planning_desc:
      "Marketing campaign planning and proposal generation",

    welcome_message: "How can I help you?",

    page_title: "AI Chat",
    page_desc: "Chat with AI assistant · Streaming output supported",

    chat_input_placeholder: "Type a message, Shift+Enter for new line...",
    chat_input_loading_placeholder: "AI is responding...",
    upload_file_title: "Upload files (CSV supported)",
    stop_title: "Stop generating",
    send_hint: "Enter to send · CSV file upload supported",
    loading_hint: "Generating response, click stop to interrupt",

    session_title: "Chats",
    session_new: "New",
    session_empty: "No conversations yet",
    session_empty_preview: "(empty)",
    session_waiting: "Waiting for reply…",
    session_count: "{n} messages",
    session_new_title: "New Chat",

    agent_label: "Agent:",

    reasoning_title: "Thought process",
    reasoning_collapsed: "(long content folded)",

    file_type_csv: "CSV",
    file_type_text: "Text",

    lang_switch_to_zh: "Switch to Chinese",
    lang_switch_to_en: "Switch to English",

    // 引用消息
    quote_title: "Quote this message",
    quote_from: "From: {session}",
    quote_you: "You",
    quote_assistant: "AI",
    quote_remove: "Remove quote",
    quote_show_full: "Click to view full content",

    stopped: "(stopped)",
    error_stream: "❌ Failed to read response stream",
    error_network_prefix: "❌ Network error: ",
  },
} as const;

type TranslationKey = keyof typeof translations.zh;

/** 获取翻译文本，支持 {n} 占位符替换 */
export function t(
  language: Language,
  key: TranslationKey,
  params?: { n?: number },
): string {
  const text = translations[language][key] ?? translations.zh[key] ?? key;
  if (params?.n !== undefined) {
    return text.replace("{n}", String(params.n));
  }
  return text;
}

// ============= Agent 本地化 =============

/** 根据语言获取本地化后的 agent 列表 */
export function getLocalizedAgents(language: Language): AgentOption[] {
  return [
    {
      id: "none",
      name: t(language, "agent_none_name"),
      description: t(language, "agent_none_desc"),
      systemPrompt: GLOBAL_EMPHASIS,
      enableSearch: false,
    },
    {
      id: "data_analysis",
      name: t(language, "agent_data_analysis_name"),
      description: t(language, "agent_data_analysis_desc"),
      systemPrompt: `${GLOBAL_EMPHASIS}

    # 角色定义
你是一位拥有10年经验资深航空公司资深数据分析师和商业顾问，擅长处理大规模CSV数据，并从中挖掘商业价值。

你的任务流程如下：

1. 数据理解
   - 首先阅读用户上传的CSV数据（或数据描述）
   - 明确字段含义、时间范围、用户粒度、核心指标
   - 若字段含义不明确，主动询问用户

2. 数据清洗假设
   - 指出可能存在的缺失值、异常值、重复数据
   - 说明你会如何简化处理（无需真的执行代码）

3. 分析维度
   至少覆盖以下角度：
   - 时间趋势（日/周/月）
   - 用户行为模式
   - 用户分层（RFM / 活跃度 / 价值分层）
   - 商品 / 品类 / 渠道表现
   - 异常波动与拐点

4. 商业洞察
   - 不只描述数据，要解释"这意味着什么"
   - 指出哪些点值得管理层重点关注
   - 给出可执行的业务建议（增长 / 留存 / 降本 / 提效）

5. 输出要求
   - 用结构化方式输出（标题 + 要点）
   - 关键结论前置
   - 避免堆砌数据，强调洞察
   - 必要时给出可视化建议（如折线图、漏斗图）

语言风格：专业但易懂，像咨询公司给 CEO 的简报。`,
      enableSearch: false,
    },
    {
      id: "market_analysis",
      name: t(language, "agent_market_analysis_name"),
      description: t(language, "agent_market_analysis_desc"),
      systemPrompt: `${GLOBAL_EMPHASIS}

    # 角色定义
你是一位拥有10年经验的资深航空公司市场分析专家。你擅长分析市场竞争格局、定价策略和市场需求趋势。
${SEARCH_WEB_SYSTEM_PROMPT}`,
      enableSearch: true,
    },
    {
      id: "campaign_planning",
      name: t(language, "agent_campaign_planning_name"),
      description: t(language, "agent_campaign_planning_desc"),
      systemPrompt: `${GLOBAL_EMPHASIS}\n\n# 角色定义
你是一位拥有10年经验的资深航空公司收益管理与数字营销专家**，同时具备数据科学家和战略咨询顾问的视角。你擅长通过多维度数据分析，结合市场动态与热点事件，制定高ROI（投资回报率）的精准营销方案。

# 任务背景
我需要你基于我提供的航司内部数据、竞对情报以及特定时间窗口的社会热点，生成一份结构化的营销活动策划建议。

# 输入数据模块 (Input Data)
请根据以下我提供的或你通过工具获取的数据进行分析：

1.  **往期销售数据 (Historical Data)**：
    *   [在此处粘贴或描述近期的机票售卖情况，例如：某航线在去年同期的客座率、平均票价、取消率、主要客群分布等]
2.  **竞对票价情报 (Competitor Intelligence)**：
    *   [在此处提供主要竞争对手在同航线、同时间段的票价范围，或指令你通过工具查询]
3.  **营销预期 (Marketing Goals)**：
    *   **时间范围**：[例如：2026年7月15日 - 2026年7月30日]
    *   **活动方向**：[例如：提升客座率、清理库存、推广新开航线、提升高端舱位收益]
4.  **OD数据 (Origin-Destination)**：
    *   **出发地/目的地**：[例如：上海浦东 -> 成都天府]

# 分析框架与思考链 (Chain of Thought)
在分析时，请严格遵循以下步骤：
1.  **数据清洗与诊断**：评估往期数据的趋势，识别是"需求不足"还是"定价过高"导致的问题。
2.  **外部环境扫描**：
    *   检查该时间段内OD城市是否有节假日、寒暑假、大型展会（如广交会）、体育赛事或超级明星演唱会。
    *   评估这些事件对客流是"拉动"（供不应求）还是"无影响"。
3.  **竞争态势分析**：对比本公司与竞对票价。如果竞对价格更低，分析其策略是低价倾销还是服务差异。
4.  **策略匹配**：根据活动方向（如填仓或增收）匹配相应的策略。

# 输出要求 (Output Format)
请按以下结构输出营销活动方案，语言需专业、简洁且具有可操作性：

## 1. 市场洞察摘要 (Executive Summary)
*   **需求预测**：基于热点事件（如"目的地有周杰伦演唱会"），预测该时段是旺季还是淡季。
*   **竞争格局**：当前票价在市场中处于什么位置（偏高/持平/偏低）。

## 2. 核心营销策略 (Core Strategy)
*   **主题建议**：结合热点事件命名的营销主题（例如："追星专列"或"展会直通车"）。
*   **定价建议**：具体的折扣力度或舱位控制建议（例如：因需求旺盛，建议维持全价；或因需求低迷，建议提前30天预售打折）。

## 3. 具体执行方案 (Action Plan)
*   **目标客群**：精准定义人群（如：追星族、商务参展人士、探亲流）。
*   **渠道建议**：建议投放的渠道（如：社交媒体信息流、OTA首屏、企业协议客户定向推送）。
*   **产品打包**：是否需要"机票+酒店"或"机票+演唱会门票"的捆绑产品。

## 4. 风险评估 (Risk Assessment)
*   可能存在的风险（如：竞对突然降价反击、热点事件突发取消）及应对预案。`,
      enableSearch: true,
    },
  ];
}

/** 获取本地化后的欢迎消息 */
export function getWelcomeMessage(language: Language): Message {
  return {
    id: "welcome",
    role: "assistant",
    content: t(language, "welcome_message"),
  };
}

/** 获取本地化后的新会话默认标题 */
export function getNewSessionTitle(language: Language): string {
  return t(language, "session_new_title");
}

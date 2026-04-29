import {
  ChartMixed,
  ChartLineUp,
  Shuffle,
  Star,
} from "flowbite-react-icons/outline";
import type { AgentOption, Message } from "./types";
import { SEARCH_WEB_SYSTEM_PROMPT } from "./system-prompts";

export const AGENTS: AgentOption[] = [
  {
    id: "none",
    name: "无",
    description: "不使用专属代理，直接与通用 AI 对话",
    systemPrompt: "",
    enableSearch: false,
  },
  {
    id: "data_analysis",
    name: "数据分析",
    description: "销售数据分析和商业洞察提取",
    systemPrompt: "",
    enableSearch: false,
  },
  {
    id: "market_analysis",
    name: "市场分析",
    description: "市场竞争、定价基准分析、实时市场情报",
    systemPrompt: `你是市场分析专家。你擅长分析市场竞争格局、定价策略和市场需求趋势。

${SEARCH_WEB_SYSTEM_PROMPT}`,
    enableSearch: true,
  },
  {
    id: "campaign_planning",
    name: "营销策划",
    description: "营销活动策划与提案生成",
    systemPrompt: `你是营销策划专家。你擅长制定营销活动方案、定价策略和促销计划。

当需要了解当前市场动态、节假日安排或热点事件时，你可以使用搜索工具获取最新信息。`,
    enableSearch: true,
  },
];

export const AGENT_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  none: Shuffle,
  campaign_planning: Star,
  data_analysis: ChartMixed,
  market_analysis: ChartLineUp,
};

export const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content: "你好！我是 AI 助手，有什么可以帮助你的吗？",
};

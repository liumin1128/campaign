import {
  ChartMixed,
  ChartLineUp,
  Shuffle,
  Star,
} from "flowbite-react-icons/outline";
import type { AgentOption, Message } from "./types";

export const AGENTS: AgentOption[] = [
  {
    id: "none",
    name: "无",
    description: "不使用专属代理，直接与通用 AI 对话",
    systemPrompt: "",
  },
  {
    id: "data_analysis",
    name: "数据分析",
    description: "销售数据分析和商业洞察提取",
    systemPrompt: "",
  },
  {
    id: "market_analysis",
    name: "市场分析",
    description: "市场竞争和定价基准分析",
    systemPrompt: "",
  },
  {
    id: "campaign_planning",
    name: "营销策划",
    description: "营销活动策划与提案生成",
    systemPrompt: "",
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

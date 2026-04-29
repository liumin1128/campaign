import {
  ChartMixed,
  ChartLineUp,
  Shuffle,
  Star,
} from "flowbite-react-icons/outline";

export const AGENT_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  none: Shuffle,
  campaign_planning: Star,
  data_analysis: ChartMixed,
  market_analysis: ChartLineUp,
};

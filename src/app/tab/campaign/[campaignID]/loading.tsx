import {
  CampaignHeaderSkeleton,
  CampaignTimelineSkeleton,
} from "@/components/campaign-task-list-skeleton";
import CampaignTaskListSkeleton from "@/components/campaign-task-list-skeleton";

export default function CampaignDetailLoading() {
  return (
    <div className="flex flex-col gap-5">
      <CampaignHeaderSkeleton />
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="min-w-0 flex-1">
          <CampaignTaskListSkeleton />
        </div>
        <div className="w-[320px] shrink-0">
          <CampaignTimelineSkeleton />
        </div>
      </div>
    </div>
  );
}

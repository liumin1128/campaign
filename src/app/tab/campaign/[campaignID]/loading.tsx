import { CampaignHeaderSkeleton } from "@/components/campaign-task-list-skeleton";
import CampaignTaskListSkeleton from "@/components/campaign-task-list-skeleton";

export default function CampaignDetailLoading() {
  return (
    <div className="flex flex-col gap-4">
      <CampaignHeaderSkeleton />
      <CampaignTaskListSkeleton />
    </div>
  );
}

import CampaignTaskList from "@/components/campaign-task-list";

type CampaignPageProps = {
  params: Promise<{
    campaignID: string;
  }>;
};

export default async function CampaignDetailPage({
  params,
}: CampaignPageProps) {
  const { campaignID } = await params;

  return (
    <div>
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-base font-semibold leading-6 text-gray-900">
              Campaign {campaignID}
            </h3>
            <div className="mt-2 text-sm text-gray-500">
              <p>Current campaign ID: {campaignID}</p>
            </div>
          </div>
        </div>
      </div>

      <CampaignTaskList campaignID={campaignID} />
    </div>
  );
}

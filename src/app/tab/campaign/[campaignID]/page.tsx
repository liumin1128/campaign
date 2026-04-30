import Link from "next/link";
import { ArrowLeft } from "flowbite-react-icons/outline";
import CampaignTaskList from "@/components/campaign-task-list";
import CampaignStepper from "@/components/campaign-stepper";
import CampaignProgressText from "@/components/campaign-progress-text";
import CampaignTimeline from "@/components/campaign-timeline";

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
    <div className="flex flex-col gap-5 px-4 py-10 sm:px-6 lg:px-8">
      {/* 页面顶部导航和信息 */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800">
        <div className="px-4 py-5 sm:px-6 sm:py-6">
          {/* 面包屑导航 */}
          <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <Link
              href="/tab"
              className="transition hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              所有活动
            </Link>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-slate-600 dark:text-slate-300">
              活动详情
            </span>
          </nav>

          {/* 标题区域 */}
          <div className="flex items-start gap-3">
            <Link
              href="/tab"
              className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-500 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
              aria-label="返回活动列表"
            >
              <ArrowLeft className="size-4" />
            </Link>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
                Campaign {campaignID}
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                活动 ID: {campaignID}
              </p>

              <CampaignStepper campaignID={campaignID} />
            </div>
          </div>
        </div>
      </div>

      {/* 两栏布局：左侧任务列表 + 右侧固定宽度时间线 */}
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="min-w-0 flex-1">
          <CampaignTaskList campaignID={campaignID} />
        </div>
        <div className="w-[320px] shrink-0">
          <CampaignTimeline campaignID={campaignID} />
        </div>
      </div>
    </div>
  );
}

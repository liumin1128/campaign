"use client";

import { useEffect } from "react";
import { CheckCircle } from "flowbite-react-icons/outline";
import {
  useCampaignTaskStore,
  type CampaignTask,
} from "@/store/campaign-task-store";
import CampaignTaskRow from "@/components/campaign-task-row";

const stepDefinitions = [
  { key: "Initial Idea", label: "Step 1: Initial Idea" },
  {
    key: "Proposal Justification",
    label: "Step 2: Proposal Justification",
  },
  { key: "Approval", label: "Step 3: Approval" },
  { key: "Execution", label: "Step 4: Execution" },
  { key: "Go Live & Monitor", label: "Step 5: Go Live & Monitor" },
] as const;

type StepStatus = "not-started" | "in-progress" | "completed";

function getStepStatus(tasks: CampaignTask[]): StepStatus {
  const completedCount = tasks.filter((task) => task.status === "done").length;

  if (completedCount === 0) {
    return "not-started";
  }

  if (completedCount === tasks.length) {
    return "completed";
  }

  return "in-progress";
}

function StepStatusIndicator({ status }: { status: StepStatus }) {
  if (status === "completed") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-4 ring-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/10">
        <CheckCircle className="size-4.5" />
      </span>
    );
  }

  if (status === "in-progress") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 ring-4 ring-indigo-50 dark:bg-indigo-500/15 dark:ring-indigo-500/10">
        <span className="h-2.5 w-2.5 rounded-full bg-indigo-600 dark:bg-indigo-300" />
      </span>
    );
  }

  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white ring-4 ring-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:ring-slate-800" />
  );
}

export default function CampaignTaskList({
  campaignID,
}: {
  campaignID: string;
}) {
  const tasks = useCampaignTaskStore((state) => state.tasks);
  const loading = useCampaignTaskStore((state) => state.loading);
  const error = useCampaignTaskStore((state) => state.error);
  const activeCampaignID = useCampaignTaskStore(
    (state) => state.activeCampaignID,
  );
  const loadTasks = useCampaignTaskStore((state) => state.loadTasks);

  const groupedTasks = stepDefinitions
    .map((stepDefinition) => {
      const stepTasks = tasks.filter(
        (task) => task.step === stepDefinition.key,
      );

      return {
        ...stepDefinition,
        tasks: stepTasks,
        status: getStepStatus(stepTasks),
      };
    })
    .filter((group) => group.tasks.length > 0);

  const uncategorizedTasks = tasks.filter(
    (task) =>
      !task.step ||
      !stepDefinitions.some(
        (stepDefinition) => stepDefinition.key === task.step,
      ),
  );

  useEffect(() => {
    void loadTasks(campaignID);
  }, [campaignID, loadTasks]);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-lg">
        <div className="border-b border-gray-200 px-4 py-4 sm:px-6 ">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold leading-6 text-gray-900 dark:text-slate-100">
                Tasks
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                Campaign {campaignID} currently has {tasks.length} task
                {tasks.length === 1 ? "" : "s"}.
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-slate-800 dark:text-slate-300">
              {activeCampaignID ?? campaignID}
            </span>
          </div>
        </div>

        <div className="">
          {loading ? (
            <div className="text-sm text-gray-500 dark:text-slate-400">
              Loading tasks...
            </div>
          ) : null}

          {!loading && error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          ) : null}

          {!loading && !error && tasks.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">
              No tasks found for this campaign.
            </div>
          ) : null}

          {!loading && !error && tasks.length > 0 ? (
            <div className="space-y-4">
              {groupedTasks.map((group) => (
                <section
                  key={group.key}
                  className="rounded-sm bg-white dark:bg-transparent"
                >
                  <div className="border-b border-gray-200 px-4 py-4 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <StepStatusIndicator status={group.status} />
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                          {group.label}
                        </h4>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-slate-800 dark:text-slate-300">
                        {group.tasks.length} task
                        {group.tasks.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-3 bg-gray-50 px-4 py-4 dark:bg-slate-950/30">
                    {group.tasks.map((task) => (
                      <CampaignTaskRow
                        key={task.id}
                        task={task}
                        campaignID={campaignID}
                      />
                    ))}
                  </ul>
                </section>
              ))}

              {uncategorizedTasks.length > 0 ? (
                <section className="rounded-xl border border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20">
                  <div className="border-b border-amber-200 px-4 py-4 dark:border-amber-900/60">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                        Uncategorized
                      </h4>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-slate-900 dark:text-amber-200">
                        {uncategorizedTasks.length} task
                        {uncategorizedTasks.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-3 px-4 py-4">
                    {uncategorizedTasks.map((task) => (
                      <CampaignTaskRow
                        key={task.id}
                        task={task}
                        campaignID={campaignID}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

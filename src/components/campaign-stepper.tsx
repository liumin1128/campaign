"use client";

import { useEffect } from "react";
import {
  useCampaignTaskStore,
  type CampaignTask,
} from "@/store/campaign-task-store";
import { CheckCircle } from "flowbite-react-icons/outline";

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

type StepKey = (typeof stepDefinitions)[number]["key"];

type StepStatus = "not-started" | "in-progress" | "completed";

function getStepStatus(tasks: CampaignTask[]): StepStatus {
  const completedCount = tasks.filter((t) => t.status === "done").length;

  if (completedCount === 0) return "not-started";
  if (completedCount === tasks.length) return "completed";
  return "in-progress";
}

const statusIcons = {
  completed: CheckCircle,
} as const;

function StepCircle({
  index,
  status,
  isCurrent,
}: {
  index: number;
  status: StepStatus;
  isCurrent: boolean;
}) {
  const Icon = statusIcons[status as keyof typeof statusIcons];

  if (status === "completed") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-4 ring-emerald-50 dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-500/12">
        <Icon className="size-4.5" />
      </span>
    );
  }

  if (isCurrent) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 ring-4 ring-indigo-50 dark:bg-indigo-500/20 dark:ring-indigo-500/12">
        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-300">
          {index}
        </span>
      </span>
    );
  }

  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white ring-4 ring-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:ring-slate-800">
      <span className="text-sm font-medium text-slate-400 dark:text-slate-500">
        {index}
      </span>
    </span>
  );
}

export default function CampaignStepper({
  campaignID,
}: {
  campaignID: string;
}) {
  const tasks = useCampaignTaskStore((state) => state.tasks);
  const loading = useCampaignTaskStore((state) => state.loading);
  const loadTasks = useCampaignTaskStore((state) => state.loadTasks);

  useEffect(() => {
    if (!tasks.length && !loading) {
      void loadTasks(campaignID);
    }
  }, [campaignID, loadTasks, tasks.length, loading]);

  const steps = stepDefinitions.map((def, index) => {
    const stepTasks = tasks.filter((t) => t.step === def.key);
    const status = getStepStatus(stepTasks);
    return { ...def, status, index: index + 1 };
  });

  const currentStepIndex = steps.findIndex(
    (s) => s.status === "in-progress" || s.status === "not-started",
  );
  const currentStepKey =
    currentStepIndex >= 0 ? steps[currentStepIndex].key : null;

  return (
    <div className="py-10 ">
      {/* 步骤条 */}
      <nav aria-label="Campaign progress">
        <ol className="flex items-center">
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1;
            const isCurrent = step.key === currentStepKey;
            const isNotStarted = step.status === "not-started" && !isCurrent;

            return (
              <li
                key={step.key}
                className={`flex items-center ${isLast ? "" : "flex-1"}`}
              >
                <div className="flex flex-col items-center gap-1.5">
                  <StepCircle
                    index={step.index}
                    status={step.status}
                    isCurrent={isCurrent}
                  />
                  <span
                    className={`text-center text-xs leading-tight ${
                      isCurrent
                        ? "font-semibold text-indigo-600 dark:text-indigo-300"
                        : isNotStarted
                          ? "text-slate-400 dark:text-slate-500"
                          : "font-medium text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {step.label.replace(/Step \d+:\s*/, "")}
                  </span>
                </div>

                {/* 连接线 */}
                {!isLast && (
                  <div
                    className={`mx-2 -mt-7 h-0.5 flex-1 self-center rounded-full ${
                      step.status === "completed"
                        ? "bg-emerald-400 dark:bg-emerald-500"
                        : "bg-slate-200 dark:bg-slate-700"
                    }`}
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}

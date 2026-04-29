"use client";

import { useEffect } from "react";
import {
  useCampaignTaskStore,
  type CampaignTask,
} from "@/store/campaign-task-store";

const stepDefinitions = [
  { key: "Initial Idea", label: "Step 1: Initial Idea" },
  { key: "Proposal Justification", label: "Step 2: Proposal Justification" },
  { key: "Approval", label: "Step 3: Approval" },
  { key: "Execution", label: "Step 4: Execution" },
  { key: "Go Live & Monitor", label: "Step 5: Go Live & Monitor" },
] as const;

function getStepStatus(
  tasks: CampaignTask[],
): "not-started" | "in-progress" | "completed" {
  const done = tasks.filter((t) => t.status === "done").length;
  if (done === 0) return "not-started";
  if (done === tasks.length) return "completed";
  return "in-progress";
}

export default function CampaignProgressText({
  campaignID,
}: {
  campaignID: string;
}) {
  const tasks = useCampaignTaskStore((s) => s.tasks);
  const loading = useCampaignTaskStore((s) => s.loading);
  const loadTasks = useCampaignTaskStore((s) => s.loadTasks);

  useEffect(() => {
    if (!tasks.length && !loading) {
      void loadTasks(campaignID);
    }
  }, [campaignID, loadTasks, tasks.length, loading]);

  if (loading) return null;

  const steps = stepDefinitions.map((def) => {
    const stepTasks = tasks.filter((t) => t.step === def.key);
    return { ...def, status: getStepStatus(stepTasks) };
  });

  const currentIdx = steps.findIndex(
    (s) => s.status === "in-progress" || s.status === "not-started",
  );

  if (currentIdx < 0) {
    return (
      <span className="text-sm text-emerald-600 dark:text-emerald-400">
        全部完成 ✓
      </span>
    );
  }

  return (
    <span className="text-sm text-slate-500 dark:text-slate-400">
      进度 {currentIdx + 1}/{steps.length}
      <span className="ml-1.5 text-slate-400 dark:text-slate-500">
        {steps[currentIdx]?.label.replace(/Step \d+:\s*/, "")}
      </span>
    </span>
  );
}

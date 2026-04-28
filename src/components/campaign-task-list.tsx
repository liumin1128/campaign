"use client";

import { useEffect } from "react";
import {
  useCampaignTaskStore,
  type CampaignTask,
} from "@/store/campaign-task-store";

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

function formatDate(dateText: string | null) {
  if (!dateText) {
    return "No deadline";
  }

  const date = new Date(dateText);

  if (Number.isNaN(date.getTime())) {
    return dateText;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function TaskRow({
  task,
  campaignID,
}: {
  task: CampaignTask;
  campaignID: string;
}) {
  const updatingTaskIDs = useCampaignTaskStore(
    (state) => state.updatingTaskIDs,
  );
  const updateTaskStatus = useCampaignTaskStore(
    (state) => state.updateTaskStatus,
  );
  const isUpdating = updatingTaskIDs.includes(task.id);
  const isDone = task.status === "done";

  return (
    <li className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          checked={isDone}
          disabled={isUpdating}
          onChange={() => {
            void updateTaskStatus(
              campaignID,
              task.id,
              isDone ? "todo" : "done",
            );
          }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 text-sm text-gray-600 lg:flex-row lg:items-center lg:gap-4">
            <span
              className={
                isDone
                  ? "font-medium text-gray-400 line-through"
                  : "font-medium text-gray-900"
              }
            >
              {task.content}
            </span>

            {task.assignedTo ? (
              <span className="truncate rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                {task.assignedTo}
              </span>
            ) : null}

            <span className="text-xs text-gray-500">
              Deadline: {formatDate(task.deadline)}
            </span>

            <span className="text-xs text-gray-500">
              Created: {formatDate(task.created_at)}
            </span>

            {isUpdating ? (
              <span className="text-xs font-medium text-blue-600">
                Updating...
              </span>
            ) : null}
          </div>
        </div>
      </label>
    </li>
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
    .map((stepDefinition) => ({
      ...stepDefinition,
      tasks: tasks.filter((task) => task.step === stepDefinition.key),
    }))
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
      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold leading-6 text-gray-900">
                Tasks
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Campaign {campaignID} currently has {tasks.length} task
                {tasks.length === 1 ? "" : "s"}.
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              {activeCampaignID ?? campaignID}
            </span>
          </div>
        </div>

        <div className="px-4 py-5 sm:p-6">
          {loading ? (
            <div className="text-sm text-gray-500">Loading tasks...</div>
          ) : null}

          {!loading && error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {!loading && !error && tasks.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
              No tasks found for this campaign.
            </div>
          ) : null}

          {!loading && !error && tasks.length > 0 ? (
            <div className="space-y-4">
              {groupedTasks.map((group) => (
                <section
                  key={group.key}
                  className="rounded-xl border border-gray-200 bg-gray-50/70"
                >
                  <div className="border-b border-gray-200 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-gray-900">
                        {group.label}
                      </h4>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600">
                        {group.tasks.length} task
                        {group.tasks.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-3 px-4 py-4">
                    {group.tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        campaignID={campaignID}
                      />
                    ))}
                  </ul>
                </section>
              ))}

              {uncategorizedTasks.length > 0 ? (
                <section className="rounded-xl border border-amber-200 bg-amber-50/70">
                  <div className="border-b border-amber-200 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-amber-900">
                        Uncategorized
                      </h4>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-amber-700">
                        {uncategorizedTasks.length} task
                        {uncategorizedTasks.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-3 px-4 py-4">
                    {uncategorizedTasks.map((task) => (
                      <TaskRow
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

"use client";

import { Checkbox } from "flowbite-react";
import { CalendarMonth, Clock, User } from "flowbite-react-icons/outline";
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

function hasUpdatedTimestamp(
  createdAt: string | null,
  updatedAt: string | null,
) {
  if (!updatedAt) {
    return false;
  }

  if (!createdAt) {
    return true;
  }

  const createdTime = new Date(createdAt).getTime();
  const updatedTime = new Date(updatedAt).getTime();

  if (Number.isNaN(createdTime) || Number.isNaN(updatedTime)) {
    return updatedAt !== createdAt;
  }

  return updatedTime > createdTime;
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
  const showUpdatedAt = hasUpdatedTimestamp(task.created_at, task.updated_at);

  return (
    <li className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-indigo-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/60">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center">
          <Checkbox
            aria-label={isDone ? "Mark task as todo" : "Mark task as done"}
            checked={isDone}
            className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-900 dark:ring-offset-slate-900 dark:focus:ring-indigo-500"
            disabled={isUpdating}
            onChange={(event) => {
              void updateTaskStatus(
                campaignID,
                task.id,
                event.target.checked ? "done" : "todo",
              );
            }}
          />
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden">
          <span
            className={
              isDone
                ? "min-w-0 flex-1 truncate text-sm font-medium text-slate-400 line-through dark:text-slate-500"
                : "min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100"
            }
            title={task.content}
          >
            {task.content}
          </span>

          <div className="flex min-w-0 items-center justify-end gap-2 overflow-hidden text-xs text-slate-500 dark:text-slate-400">
            {task.assignedTo ? (
              <span className="inline-flex max-w-40 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <User className="size-3.5 text-slate-400 dark:text-slate-500" />
                <span className="truncate">{task.assignedTo}</span>
              </span>
            ) : null}

            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
              <CalendarMonth className="size-3.5" />
              <span>{formatDate(task.deadline)}</span>
            </span>

            <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap text-slate-400 dark:text-slate-500">
              <Clock className="size-3.5" />
              <span className="truncate">
                {showUpdatedAt
                  ? `Updated ${formatDate(task.updated_at)}`
                  : `Created ${formatDate(task.created_at)}`}
              </span>
            </span>

            {isUpdating ? (
              <span className="whitespace-nowrap rounded-full bg-indigo-100 px-2.5 py-1 font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
                Updating...
              </span>
            ) : null}
          </div>
        </div>
      </div>
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
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                        {group.label}
                      </h4>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-slate-800 dark:text-slate-300">
                        {group.tasks.length} task
                        {group.tasks.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-3 bg-gray-50 px-4 py-4 dark:bg-slate-950/30">
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

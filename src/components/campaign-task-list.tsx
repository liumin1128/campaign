"use client";

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

const taskCheckboxClassName =
  "group relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform duration-150 hover:scale-105 focus-within:scale-105";

const taskCheckboxIndicatorClassName =
  "pointer-events-none inline-flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] bg-white text-xs font-bold leading-none shadow-[0_0_0_4px_rgba(255,255,255,0.92),0_10px_24px_rgba(99,102,241,0.14)] transition-colors duration-150 focus-within:shadow-[0_0_0_5px_rgba(224,231,255,0.95),0_12px_28px_rgba(99,102,241,0.2)]";

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
    <li className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
      <div className="flex items-center gap-3">
        <label className={taskCheckboxClassName}>
          <input
            aria-label={isDone ? "Mark task as todo" : "Mark task as done"}
            checked={isDone}
            className="peer sr-only"
            disabled={isUpdating}
            type="checkbox"
            onChange={(event) => {
              void updateTaskStatus(
                campaignID,
                task.id,
                event.target.checked ? "done" : "todo",
              );
            }}
          />
          <span
            aria-hidden="true"
            className={`${taskCheckboxIndicatorClassName} ${
              isDone
                ? "border-indigo-400 bg-indigo-400 text-white"
                : "border-slate-300 bg-white text-transparent"
            } peer-disabled:cursor-not-allowed peer-disabled:opacity-60 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-500`}
          >
            ✓
          </span>
        </label>

        <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden">
          <span
            className={
              isDone
                ? "min-w-0 flex-1 truncate text-sm font-medium text-slate-400 line-through"
                : "min-w-0 flex-1 truncate text-sm font-medium text-slate-900"
            }
            title={task.content}
          >
            {task.content}
          </span>

          <div className="flex min-w-0 items-center justify-end gap-2 overflow-hidden text-xs text-slate-500">
            {task.assignedTo ? (
              <span className="inline-flex max-w-40 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600">
                <User className="size-3.5 text-slate-400" />
                <span className="truncate">{task.assignedTo}</span>
              </span>
            ) : null}

            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700">
              <CalendarMonth className="size-3.5" />
              <span>{formatDate(task.deadline)}</span>
            </span>

            <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap text-slate-400">
              <Clock className="size-3.5" />
              <span className="truncate">
                {showUpdatedAt
                  ? `Updated ${formatDate(task.updated_at)}`
                  : `Created ${formatDate(task.created_at)}`}
              </span>
            </span>

            {isUpdating ? (
              <span className="whitespace-nowrap rounded-full bg-indigo-100 px-2.5 py-1 font-semibold text-indigo-700">
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
      <div className="overflow-hidden rounded-lg shadow-sm">
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

        <div className="">
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
                <section key={group.key} className="rounded-sm bg-white">
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

                  <ul className="space-y-3 px-4 py-4  bg-gray-50">
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

"use client";

import { Checkbox } from "flowbite-react";
import { CalendarMonth, Clock, User } from "flowbite-react-icons/outline";
import {
  useCampaignTaskStore,
  type CampaignTask,
} from "@/store/campaign-task-store";

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

export default function CampaignTaskRow({
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

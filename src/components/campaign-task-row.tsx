"use client";

import { useState } from "react";
import { Badge, Checkbox, TextInput } from "flowbite-react";
import { CalendarMonth, User } from "flowbite-react-icons/outline";
import {
  useCampaignTaskStore,
  type CampaignTask,
} from "@/store/campaign-task-store";
import {
  TaskMarkdownEditor,
  TaskMarkdownPreview,
} from "@/components/task-markdown";
import { hasRichTextContent, normalizeRichTextValue } from "@/utils/rich-text";

function NoteEditIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
      className="size-4"
    >
      <path
        d="M3.3 12.7h2.2l6-6a1.6 1.6 0 1 0-2.2-2.2l-6 6v2.2Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.4 3.8l3.8 3.8" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
      className="size-4"
    >
      <path
        d="M3 4h10M6 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M4 4v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6.5 7v4M9.5 7v4" strokeLinecap="round" />
    </svg>
  );
}

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

type DeadlineBadgeLevel =
  | "brand"
  | "alternative"
  | "gray"
  | "danger"
  | "success"
  | "warning";

type DeadlineBadgePresentation = {
  level: DeadlineBadgeLevel;
  color: "info" | "gray" | "failure" | "success" | "warning";
  label: string;
  className?: string;
};

function parseDeadlineDate(dateText: string) {
  const matchedDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);

  if (matchedDate) {
    const [, year, month, day] = matchedDate;

    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsedDate = new Date(dateText);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate(),
  );
}

function getDeadlineBadgePresentation(
  deadline: string | null,
  isDone: boolean,
): DeadlineBadgePresentation {
  if (isDone) {
    return {
      level: "success",
      color: "success",
      label: formatDate(deadline),
    };
  }

  if (!deadline) {
    return {
      level: "alternative",
      color: "gray",
      label: "No deadline",
      className:
        "border border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
    };
  }

  const deadlineDate = parseDeadlineDate(deadline);

  if (!deadlineDate) {
    return {
      level: "brand",
      color: "info",
      label: deadline,
      className:
        "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200",
    };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const formattedDeadline = formatDate(deadline);

  if (deadlineDate.getTime() < today.getTime()) {
    return {
      level: "danger",
      color: "failure",
      label: formattedDeadline,
    };
  }

  if (deadlineDate.getTime() === today.getTime()) {
    return {
      level: "warning",
      color: "warning",
      label: formattedDeadline,
    };
  }

  return {
    level: "gray",
    color: "gray",
    label: formattedDeadline,
  };
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
  const updateTaskDetails = useCampaignTaskStore(
    (state) => state.updateTaskDetails,
  );
  const deleteTask = useCampaignTaskStore((state) => state.deleteTask);

  const isUpdating = updatingTaskIDs.includes(task.id);
  const isDone = task.status === "done";
  const deadlineBadge = getDeadlineBadgePresentation(task.deadline, isDone);

  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(task.content ?? "");
  const [draftDeadline, setDraftDeadline] = useState(task.deadline ?? "");
  const [draftAssignedTo, setDraftAssignedTo] = useState(task.assignedTo ?? "");
  const [draftText, setDraftText] = useState(task.text ?? "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const hasNotes = hasRichTextContent(task.text);

  const hasChanges =
    draftContent.trim() !== (task.content ?? "") ||
    draftDeadline !== (task.deadline ?? "") ||
    draftAssignedTo !== (task.assignedTo ?? "") ||
    normalizeRichTextValue(draftText) !== task.text;

  function resetDrafts() {
    setDraftContent(task.content ?? "");
    setDraftDeadline(task.deadline ?? "");
    setDraftAssignedTo(task.assignedTo ?? "");
    setDraftText(task.text ?? "");
  }

  function openEditor() {
    resetDrafts();
    setIsEditing(true);
  }

  function closeEditor() {
    resetDrafts();
    setIsEditing(false);
    setShowDeleteConfirm(false);
  }

  async function handleSave() {
    const didSave = await updateTaskDetails(campaignID, task.id, {
      content: draftContent.trim(),
      deadline: draftDeadline || null,
      assignedTo: draftAssignedTo.trim() || null,
      text: draftText,
    });

    if (didSave) {
      setIsEditing(false);
      setShowDeleteConfirm(false);
    }
  }

  async function handleDelete() {
    const didDelete = await deleteTask(campaignID, task.id);

    if (didDelete) {
      setIsEditing(false);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-indigo-200 hover:ring-1 hover:ring-indigo-200/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/60 dark:hover:ring-indigo-500/20">
      <div className="flex items-start gap-3">
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

        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex min-w-0 items-center gap-4 overflow-hidden">
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

            <div className="flex min-w-0 shrink-0 items-center justify-end gap-2 overflow-hidden text-xs text-slate-500 dark:text-slate-400">
              {task.assignedTo ? (
                <span className="inline-flex max-w-40 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <User className="size-3.5 text-slate-400 dark:text-slate-500" />
                  <span className="truncate">{task.assignedTo}</span>
                </span>
              ) : null}

              <Badge
                color={deadlineBadge.color}
                icon={CalendarMonth}
                size="sm"
                className={deadlineBadge.className}
                data-deadline-level={deadlineBadge.level}
              >
                {deadlineBadge.label}
              </Badge>

              <button
                type="button"
                aria-label={isEditing ? "关闭编辑面板" : "编辑任务"}
                title={isEditing ? "关闭编辑面板" : "编辑任务"}
                className={
                  isEditing
                    ? "inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 transition hover:bg-indigo-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500/15 dark:text-indigo-200 dark:hover:bg-indigo-500/25"
                    : "inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-500/60 dark:hover:text-indigo-200"
                }
                disabled={isUpdating}
                onClick={() => {
                  if (isEditing) {
                    closeEditor();
                  } else {
                    openEditor();
                  }
                }}
              >
                <NoteEditIcon />
              </button>

              {isUpdating ? (
                <span className="whitespace-nowrap rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
                  Updating...
                </span>
              ) : null}
            </div>
          </div>

          {hasNotes && !isEditing ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/50">
              <TaskMarkdownPreview source={task.text ?? ""} />
            </div>
          ) : null}

          {isEditing ? (
            <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-700 dark:bg-slate-950/50">
              {/* 任务内容 */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  任务内容
                </label>
                <TextInput
                  value={draftContent}
                  disabled={isUpdating}
                  onChange={(event) => {
                    setDraftContent(event.target.value);
                  }}
                  className="text-sm"
                />
              </div>

              {/* 截止日期 */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  截止日期
                </label>
                <TextInput
                  type="date"
                  value={draftDeadline}
                  disabled={isUpdating}
                  onChange={(event) => {
                    setDraftDeadline(event.target.value);
                  }}
                  className="text-sm"
                />
              </div>

              {/* 负责人 */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  负责人
                </label>
                <TextInput
                  value={draftAssignedTo}
                  disabled={isUpdating}
                  placeholder="输入负责人姓名"
                  onChange={(event) => {
                    setDraftAssignedTo(event.target.value);
                  }}
                  className="text-sm"
                />
              </div>

              {/* 备注 */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  备注
                </label>
                <TaskMarkdownEditor
                  value={draftText}
                  disabled={isUpdating}
                  onChange={setDraftText}
                />
              </div>

              {/* 时间信息 */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
                {task.created_at ? (
                  <span>创建时间: {formatDate(task.created_at)}</span>
                ) : null}
                {task.updated_at ? (
                  <span>更新时间: {formatDate(task.updated_at)}</span>
                ) : null}
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center justify-between gap-2">
                <div>
                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-600 dark:text-red-400">
                        确认删除？
                      </span>
                      <button
                        type="button"
                        className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isUpdating}
                        onClick={() => {
                          void handleDelete();
                        }}
                      >
                        确认删除
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900"
                        disabled={isUpdating}
                        onClick={() => {
                          setShowDeleteConfirm(false);
                        }}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:border-red-700 dark:hover:bg-red-950"
                      disabled={isUpdating}
                      onClick={() => {
                        setShowDeleteConfirm(true);
                      }}
                    >
                      <TrashIcon />
                      删除
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900"
                    disabled={isUpdating}
                    onClick={closeEditor}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300 dark:disabled:bg-indigo-900/60"
                    disabled={isUpdating || !hasChanges}
                    onClick={() => {
                      void handleSave();
                    }}
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

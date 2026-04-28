"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
} from "flowbite-react";
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Plus,
} from "flowbite-react-icons/outline";
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

type StepKey = (typeof stepDefinitions)[number]["key"];

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
  const contentInputRef = useRef<HTMLInputElement | null>(null);
  const tasks = useCampaignTaskStore((state) => state.tasks);
  const loading = useCampaignTaskStore((state) => state.loading);
  const error = useCampaignTaskStore((state) => state.error);
  const creatingTask = useCampaignTaskStore((state) => state.creatingTask);
  const loadTasks = useCampaignTaskStore((state) => state.loadTasks);
  const createTask = useCampaignTaskStore((state) => state.createTask);
  const [activeStepKey, setActiveStepKey] = useState<StepKey | null>(null);
  const [expandedState, setExpandedState] = useState<{
    campaignID: string | null;
    stepKeys: StepKey[];
  }>({
    campaignID: null,
    stepKeys: [],
  });
  const [taskContent, setTaskContent] = useState("");
  const [taskDeadline, setTaskDeadline] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const groupedTasks = stepDefinitions.map((stepDefinition) => {
    const stepTasks = tasks.filter((task) => task.step === stepDefinition.key);

    return {
      ...stepDefinition,
      tasks: stepTasks,
      status: getStepStatus(stepTasks),
    };
  });

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

  const firstIncompleteStepKey = !loading
    ? (groupedTasks.find((group) => group.status !== "completed")?.key ?? null)
    : null;

  const expandedStepKeys =
    expandedState.campaignID === campaignID
      ? expandedState.stepKeys
      : firstIncompleteStepKey
        ? [firstIncompleteStepKey]
        : [];

  function toggleStepExpansion(stepKey: StepKey) {
    setExpandedState((currentState) => {
      const currentKeys =
        currentState.campaignID === campaignID
          ? currentState.stepKeys
          : expandedStepKeys;

      return {
        campaignID,
        stepKeys: currentKeys.includes(stepKey)
          ? currentKeys.filter((key) => key !== stepKey)
          : [...currentKeys, stepKey],
      };
    });
  }

  function openCreateTaskModal(stepKey: StepKey) {
    setActiveStepKey(stepKey);
    setTaskContent("");
    setTaskDeadline("");
    setFormError(null);
  }

  function closeCreateTaskModal() {
    if (creatingTask) {
      return;
    }

    setActiveStepKey(null);
    setTaskContent("");
    setTaskDeadline("");
    setFormError(null);
  }

  async function handleCreateTask() {
    if (!activeStepKey) {
      return;
    }

    const trimmedContent = taskContent.trim();

    if (!trimmedContent) {
      setFormError("Task content is required");
      return;
    }

    setFormError(null);

    const didCreate = await createTask({
      campaignID,
      step: activeStepKey,
      content: trimmedContent,
      deadline: taskDeadline || null,
    });

    if (didCreate) {
      closeCreateTaskModal();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-lg">
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

          {!loading && !error ? (
            <div className="space-y-4">
              {tasks.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 px-4 py-4 text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">
                  No tasks found for this campaign yet. Use the add button on
                  any step to create the first one.
                </div>
              ) : null}

              {groupedTasks.map((group) => {
                const isExpanded = expandedStepKeys.includes(group.key);
                const StepToggleIcon = isExpanded ? ChevronDown : ChevronRight;

                return (
                  <section
                    key={group.key}
                    className="rounded-sm bg-white dark:bg-transparent"
                  >
                    <div className="border-b border-gray-200 px-4 py-4 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          className="flex items-center gap-3.5 rounded-md text-left transition hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 dark:hover:text-indigo-200"
                          aria-expanded={isExpanded}
                          aria-controls={`campaign-step-${group.key}`}
                          onClick={() => toggleStepExpansion(group.key)}
                        >
                          <StepToggleIcon className="size-4 text-slate-400 dark:text-slate-500" />
                          <StepStatusIndicator status={group.status} />
                          <h4 className="text-base font-semibold text-gray-900 dark:text-slate-100 sm:text-lg">
                            {group.label}
                          </h4>
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-slate-800 dark:text-slate-300">
                            {group.tasks.length} task
                            {group.tasks.length === 1 ? "" : "s"}
                          </span>
                          <button
                            type="button"
                            aria-label={`Add task to ${group.label}`}
                            title={`Add task to ${group.label}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/15"
                            onClick={() => openCreateTaskModal(group.key)}
                          >
                            <Plus className="size-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {isExpanded ? (
                      <ul
                        id={`campaign-step-${group.key}`}
                        className="space-y-3 bg-gray-50 px-4 py-4 dark:bg-slate-950/30"
                      >
                        {group.tasks.length > 0 ? (
                          group.tasks.map((task) => (
                            <CampaignTaskRow
                              key={task.id}
                              task={task}
                              campaignID={campaignID}
                            />
                          ))
                        ) : (
                          <li className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                            No tasks yet for this step.
                          </li>
                        )}
                      </ul>
                    ) : null}
                  </section>
                );
              })}

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

      <Modal
        dismissible
        show={activeStepKey !== null}
        size="lg"
        initialFocus={contentInputRef}
        onClose={closeCreateTaskModal}
      >
        <ModalHeader>Add task</ModalHeader>
        <ModalBody>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateTask();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="campaign-task-campaign" value="Campaign" />
                <TextInput
                  id="campaign-task-campaign"
                  readOnly
                  value={campaignID}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-task-step" value="Step" />
                <TextInput
                  id="campaign-task-step"
                  readOnly
                  value={activeStepKey ?? ""}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="campaign-task-content" value="Task content" />
              <TextInput
                id="campaign-task-content"
                ref={contentInputRef}
                placeholder="Input task content"
                value={taskContent}
                onChange={(event) => setTaskContent(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="campaign-task-deadline" value="Deadline" />
              <TextInput
                id="campaign-task-deadline"
                type="date"
                value={taskDeadline}
                onChange={(event) => setTaskDeadline(event.target.value)}
              />
            </div>

            {formError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                {formError}
              </p>
            ) : null}

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            ) : null}
          </form>
        </ModalBody>
        <ModalFooter>
          <Button
            color="light"
            disabled={creatingTask}
            onClick={closeCreateTaskModal}
          >
            Cancel
          </Button>
          <Button
            disabled={creatingTask}
            onClick={() => {
              void handleCreateTask();
            }}
          >
            {creatingTask ? "Creating..." : "Create task"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

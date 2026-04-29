import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useTeamsUserStore } from "@/store/teams-user-store";
import { normalizeRichTextValue } from "@/utils/rich-text";

export type CampaignTaskStatus = "todo" | "done";

export type CampaignTask = {
  id: number;
  campaign: string;
  content: string;
  text: string | null;
  assignedTo: string | null;
  step: string | null;
  deadline: string | null;
  status: CampaignTaskStatus;
  created_at: string | null;
  updated_at: string | null;
};

type CampaignTaskState = {
  tasks: CampaignTask[];
  loading: boolean;
  error: string | null;
  activeCampaignID: string | null;
  creatingTask: boolean;
  updatingTaskIDs: number[];
  loadTasks: (campaignID: string) => Promise<void>;
  createTask: (input: {
    campaignID: string;
    step: string;
    content: string;
    deadline: string | null;
  }) => Promise<boolean>;
  updateTaskStatus: (
    campaignID: string,
    taskID: number,
    status: CampaignTaskStatus,
  ) => Promise<void>;
  updateTaskText: (
    campaignID: string,
    taskID: number,
    text: string,
  ) => Promise<boolean>;
  updateTaskDetails: (
    campaignID: string,
    taskID: number,
    details: {
      content?: string;
      deadline?: string | null;
      assignedTo?: string | null;
      text?: string;
    },
  ) => Promise<boolean>;
  deleteTask: (campaignID: string, taskID: number) => Promise<boolean>;
  reset: () => void;
};

export const useCampaignTaskStore = create<CampaignTaskState>()(
  persist(
    (set, get) => ({
      tasks: [],
      loading: false,
      error: null,
      activeCampaignID: null,
      creatingTask: false,
      updatingTaskIDs: [],
      loadTasks: async (campaignID) => {
        if (!campaignID) {
          set({
            tasks: [],
            loading: false,
            error: "Missing campaign ID",
            activeCampaignID: null,
          });
          return;
        }

        const { activeCampaignID, loading } = get();

        if (loading && activeCampaignID === campaignID) {
          return;
        }

        set({
          tasks: activeCampaignID === campaignID ? get().tasks : [],
          loading: true,
          error: null,
          activeCampaignID: campaignID,
        });

        try {
          const response = await fetch(
            `/api/campaign/${encodeURIComponent(campaignID)}/tasks`,
            {
              method: "GET",
              cache: "no-store",
            },
          );

          const payload = (await response.json()) as {
            ok: boolean;
            error?: string;
            tasks?: CampaignTask[];
          };

          if (!response.ok || !payload.ok) {
            throw new Error(payload.error ?? "Failed to load campaign tasks");
          }

          set({
            tasks: payload.tasks ?? [],
            loading: false,
            error: null,
            activeCampaignID: campaignID,
          });
        } catch (error) {
          set({
            tasks: [],
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to load campaign tasks",
            activeCampaignID: campaignID,
          });
        }
      },
      createTask: async ({ campaignID, step, content, deadline }) => {
        const trimmedContent = content.trim();

        if (!campaignID || !step || !trimmedContent) {
          set({
            error: "Missing task fields",
          });
          return false;
        }

        set({
          error: null,
          creatingTask: true,
        });

        try {
          const response = await fetch(
            `/api/campaign/${encodeURIComponent(campaignID)}/tasks`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                content: trimmedContent,
                step,
                deadline,
              }),
            },
          );

          const payload = (await response.json()) as {
            ok: boolean;
            error?: string;
            task?: CampaignTask;
          };

          if (!response.ok || !payload.ok || !payload.task) {
            throw new Error(payload.error ?? "Failed to create task");
          }

          set((state) => ({
            creatingTask: false,
            error: null,
            tasks:
              state.activeCampaignID === campaignID
                ? [payload.task!, ...state.tasks]
                : state.tasks,
          }));

          return true;
        } catch (error) {
          set({
            creatingTask: false,
            error:
              error instanceof Error ? error.message : "Failed to create task",
          });

          return false;
        }
      },
      updateTaskStatus: async (campaignID, taskID, status) => {
        const previousTasks = get().tasks;
        const currentUser = useTeamsUserStore.getState().info;
        const sender =
          currentUser.displayName || currentUser.userPrincipalName || "开发者";
        const webhookUrl =
          typeof window !== "undefined"
            ? window.localStorage.getItem("teams_webhook_url")?.trim() ||
              undefined
            : undefined;

        set((state) => ({
          error: null,
          updatingTaskIDs: [...state.updatingTaskIDs, taskID],
          tasks: state.tasks.map((task) =>
            task.id === taskID ? { ...task, status } : task,
          ),
        }));

        try {
          const response = await fetch(
            `/api/campaign/${encodeURIComponent(campaignID)}/tasks`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                taskID,
                status,
                sender,
                webhookUrl,
              }),
            },
          );

          const payload = (await response.json()) as {
            ok: boolean;
            error?: string;
            task?: CampaignTask;
          };

          if (!response.ok || !payload.ok || !payload.task) {
            throw new Error(payload.error ?? "Failed to update task status");
          }

          const updatedTask = payload.task;

          set((state) => ({
            error: null,
            updatingTaskIDs: state.updatingTaskIDs.filter(
              (id) => id !== taskID,
            ),
            tasks: state.tasks.map((task) =>
              task.id === taskID ? updatedTask : task,
            ),
          }));
        } catch (error) {
          set((state) => ({
            error:
              error instanceof Error
                ? error.message
                : "Failed to update task status",
            updatingTaskIDs: state.updatingTaskIDs.filter(
              (id) => id !== taskID,
            ),
            tasks: previousTasks,
          }));
        }
      },
      updateTaskText: async (campaignID, taskID, text) => {
        const previousTasks = get().tasks;
        const normalizedText = normalizeRichTextValue(text);

        set((state) => ({
          error: null,
          updatingTaskIDs: [...state.updatingTaskIDs, taskID],
          tasks: state.tasks.map((task) =>
            task.id === taskID ? { ...task, text: normalizedText } : task,
          ),
        }));

        try {
          const response = await fetch(
            `/api/campaign/${encodeURIComponent(campaignID)}/tasks`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                taskID,
                text: normalizedText,
              }),
            },
          );

          const payload = (await response.json()) as {
            ok: boolean;
            error?: string;
            task?: CampaignTask;
          };

          if (!response.ok || !payload.ok || !payload.task) {
            throw new Error(payload.error ?? "Failed to update task text");
          }

          const updatedTask = payload.task;

          set((state) => ({
            error: null,
            updatingTaskIDs: state.updatingTaskIDs.filter(
              (id) => id !== taskID,
            ),
            tasks: state.tasks.map((task) =>
              task.id === taskID ? updatedTask : task,
            ),
          }));

          return true;
        } catch (error) {
          set((state) => ({
            error:
              error instanceof Error
                ? error.message
                : "Failed to update task text",
            updatingTaskIDs: state.updatingTaskIDs.filter(
              (id) => id !== taskID,
            ),
            tasks: previousTasks,
          }));

          return false;
        }
      },
      updateTaskDetails: async (campaignID, taskID, details) => {
        const previousTasks = get().tasks;

        set((state) => ({
          error: null,
          updatingTaskIDs: [...state.updatingTaskIDs, taskID],
          tasks: state.tasks.map((task) =>
            task.id === taskID
              ? {
                  ...task,
                  ...(details.content !== undefined && {
                    content: details.content,
                  }),
                  ...(details.deadline !== undefined && {
                    deadline: details.deadline,
                  }),
                  ...(details.assignedTo !== undefined && {
                    assignedTo: details.assignedTo,
                  }),
                  ...(details.text !== undefined && {
                    text: normalizeRichTextValue(details.text),
                  }),
                }
              : task,
          ),
        }));

        try {
          const body: Record<string, unknown> = { taskID };

          if (details.content !== undefined) {
            body.content = details.content;
          }
          if (details.deadline !== undefined) {
            body.deadline = details.deadline;
          }
          if (details.assignedTo !== undefined) {
            body.assignedTo = details.assignedTo;
          }
          if (details.text !== undefined) {
            body.text = details.text;
          }

          const response = await fetch(
            `/api/campaign/${encodeURIComponent(campaignID)}/tasks`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          );

          const payload = (await response.json()) as {
            ok: boolean;
            error?: string;
            task?: CampaignTask;
          };

          if (!response.ok || !payload.ok || !payload.task) {
            throw new Error(payload.error ?? "Failed to update task");
          }

          set((state) => ({
            error: null,
            updatingTaskIDs: state.updatingTaskIDs.filter(
              (id) => id !== taskID,
            ),
            tasks: state.tasks.map((task) =>
              task.id === taskID ? payload.task! : task,
            ),
          }));

          return true;
        } catch (error) {
          set((state) => ({
            error:
              error instanceof Error ? error.message : "Failed to update task",
            updatingTaskIDs: state.updatingTaskIDs.filter(
              (id) => id !== taskID,
            ),
            tasks: previousTasks,
          }));

          return false;
        }
      },
      deleteTask: async (campaignID, taskID) => {
        const previousTasks = get().tasks;

        set((state) => ({
          error: null,
          updatingTaskIDs: [...state.updatingTaskIDs, taskID],
          tasks: state.tasks.filter((task) => task.id !== taskID),
        }));

        try {
          const response = await fetch(
            `/api/campaign/${encodeURIComponent(campaignID)}/tasks`,
            {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ taskID }),
            },
          );

          const payload = (await response.json()) as {
            ok: boolean;
            error?: string;
          };

          if (!response.ok || !payload.ok) {
            throw new Error(payload.error ?? "Failed to delete task");
          }

          set((state) => ({
            error: null,
            updatingTaskIDs: state.updatingTaskIDs.filter(
              (id) => id !== taskID,
            ),
          }));

          return true;
        } catch (error) {
          set((state) => ({
            error:
              error instanceof Error ? error.message : "Failed to delete task",
            updatingTaskIDs: state.updatingTaskIDs.filter(
              (id) => id !== taskID,
            ),
            tasks: previousTasks,
          }));

          return false;
        }
      },
      reset: () =>
        set({
          tasks: [],
          loading: false,
          error: null,
          activeCampaignID: null,
          creatingTask: false,
          updatingTaskIDs: [],
        }),
    }),
    {
      name: "campaign-task-storage",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        tasks: state.tasks,
        activeCampaignID: state.activeCampaignID,
      }),
    },
  ),
);

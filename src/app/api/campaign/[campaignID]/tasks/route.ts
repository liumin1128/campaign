import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { getOptionalTeamsWebhookUrl } from "@/lib/env";
import { sendTeamsWebhookMessage } from "@/lib/teams-webhook";
import { normalizeRichTextValue } from "@/utils/rich-text";
import { logUserAction, computeDoneStatus } from "@/lib/action-log";

export const runtime = "nodejs";

const taskSelectFields =
  "id, campaign, content, text, assignedTo, step, deadline, status, created_at, updated_at";

type RouteContext = {
  params: Promise<{
    campaignID: string;
  }>;
};

type TaskStatus = "todo" | "done";

function normalizeDeadline(deadline: string | null | undefined) {
  if (!deadline) {
    return null;
  }

  const trimmedDeadline = deadline.trim();

  if (!trimmedDeadline) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDeadline)) {
    return { error: "Invalid deadline" };
  }

  const parsedDate = new Date(`${trimmedDeadline}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return { error: "Invalid deadline" };
  }

  return { value: trimmedDeadline };
}

export async function GET(_request: Request, context: RouteContext) {
  const { campaignID } = await context.params;
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("task")
    .select(taskSelectFields)
    .eq("campaign", campaignID)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    tasks: data ?? [],
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { campaignID } = await context.params;
  const payload = (await request.json()) as {
    content?: string;
    step?: string | null;
    deadline?: string | null;
  };

  const content = payload.content?.trim();

  if (!content) {
    return Response.json(
      {
        ok: false,
        error: "Task content is required",
      },
      { status: 400 },
    );
  }

  const normalizedDeadline = normalizeDeadline(payload.deadline);

  if (normalizedDeadline && "error" in normalizedDeadline) {
    return Response.json(
      {
        ok: false,
        error: normalizedDeadline.error,
      },
      { status: 400 },
    );
  }

  const step = payload.step?.trim() || null;
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("task")
    .insert({
      campaign: campaignID,
      content,
      step,
      deadline: normalizedDeadline?.value ?? null,
      status: "todo",
      text: normalizeRichTextValue(null),
    })
    .select(taskSelectFields)
    .single();

  if (error) {
    return Response.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    task: data,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { campaignID } = await context.params;
  const payload = (await request.json()) as {
    taskID?: number;
    status?: string;
    text?: string | null;
    content?: string;
    deadline?: string | null;
    assignedTo?: string | null;
    sender?: string;
    webhookUrl?: string;
  };

  if (!payload.taskID) {
    return Response.json(
      {
        ok: false,
        error: "Invalid taskID",
      },
      { status: 400 },
    );
  }

  const hasStatusUpdate =
    typeof payload.status !== "undefined" &&
    (payload.status === "todo" || payload.status === "done");
  const hasTextUpdate = typeof payload.text !== "undefined";
  const hasContentUpdate = typeof payload.content !== "undefined";
  const hasDeadlineUpdate = typeof payload.deadline !== "undefined";
  const hasAssignedToUpdate = typeof payload.assignedTo !== "undefined";

  if (
    !hasStatusUpdate &&
    !hasTextUpdate &&
    !hasContentUpdate &&
    !hasDeadlineUpdate &&
    !hasAssignedToUpdate
  ) {
    return Response.json(
      {
        ok: false,
        error: "No supported task updates provided",
      },
      { status: 400 },
    );
  }

  if (
    typeof payload.status !== "undefined" &&
    payload.status !== "todo" &&
    payload.status !== "done"
  ) {
    return Response.json(
      {
        ok: false,
        error: "Invalid status",
      },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const status = payload.status as TaskStatus | undefined;

  const { data: previousTask, error: previousTaskError } = await supabase
    .from("task")
    .select(taskSelectFields)
    .eq("id", payload.taskID)
    .eq("campaign", campaignID)
    .single();

  if (previousTaskError) {
    return Response.json(
      {
        ok: false,
        error: previousTaskError.message,
      },
      { status: 500 },
    );
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (hasStatusUpdate && status) {
    updates.status = status;
  }

  if (hasTextUpdate) {
    updates.text = normalizeRichTextValue(payload.text);
  }

  if (hasContentUpdate) {
    const trimmed = payload.content?.trim();
    if (!trimmed) {
      return Response.json(
        { ok: false, error: "Task content is required" },
        { status: 400 },
      );
    }
    updates.content = trimmed;
  }

  if (hasDeadlineUpdate) {
    const normalizedDeadline = normalizeDeadline(payload.deadline);
    if (normalizedDeadline && "error" in normalizedDeadline) {
      return Response.json(
        { ok: false, error: normalizedDeadline.error },
        { status: 400 },
      );
    }
    updates.deadline = normalizedDeadline?.value ?? null;
  }

  if (hasAssignedToUpdate) {
    updates.assignedTo = payload.assignedTo?.trim() || null;
  }

  const { data, error } = await supabase
    .from("task")
    .update(updates)
    .eq("id", payload.taskID)
    .eq("campaign", campaignID)
    .select(taskSelectFields)
    .single();

  if (error) {
    return Response.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 },
    );
  }

  const sender = payload.sender?.trim() || "Unknown";
  const webhookUrl = payload.webhookUrl?.trim() || getOptionalTeamsWebhookUrl();
  const shouldNotify =
    previousTask.status !== "done" && updates.status === "done";

  if (shouldNotify && webhookUrl) {
    try {
      await sendTeamsWebhookMessage({
        message: `${sender} 完成任务：${data.content}`,
        webhookUrl,
        sender,
      });
    } catch (notifyError) {
      console.error("Task completion webhook failed:", notifyError);
    }
  }

  // 记录用户操作日志
  const isStatusChangedToDone =
    previousTask.status !== "done" && updates.status === "done";
  const isStatusChangedToTodo =
    previousTask.status === "done" && updates.status === "todo";
  const hasFieldEdits =
    hasContentUpdate ||
    hasDeadlineUpdate ||
    hasAssignedToUpdate ||
    hasTextUpdate;

  if (isStatusChangedToDone) {
    // 状态改为 done → 根据 deadline 判断 status
    const deadlineSource = hasDeadlineUpdate
      ? (updates.deadline as string | null)
      : previousTask.deadline;
    const doneStatus = computeDoneStatus(deadlineSource);

    void logUserAction({
      campaignID,
      userName: sender,
      action: `完成任务：${data.content}`,
      taskID: data.id,
      status: doneStatus,
    });
  } else if (isStatusChangedToTodo) {
    // 状态从 done 改为 todo → 记录重新打开
    void logUserAction({
      campaignID,
      userName: sender,
      action: `重新打开任务：${data.content}`,
      taskID: data.id,
      status: "info",
    });
  } else if (hasFieldEdits && !hasStatusUpdate) {
    // 编辑任务字段 → 记录无色操作
    const editedFields: string[] = [];
    if (hasContentUpdate) editedFields.push("内容");
    if (hasDeadlineUpdate) editedFields.push("截止日期");
    if (hasAssignedToUpdate) editedFields.push("负责人");
    if (hasTextUpdate) editedFields.push("备注");

    void logUserAction({
      campaignID,
      userName: sender,
      action: `编辑任务：${data.content}（${editedFields.join("、")}）`,
      taskID: data.id,
      status: null,
    });
  }

  return Response.json({
    ok: true,
    task: data,
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { campaignID } = await context.params;
  const payload = (await request.json()) as {
    taskID?: number;
  };

  if (!payload.taskID) {
    return Response.json(
      {
        ok: false,
        error: "Invalid taskID",
      },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from("task")
    .delete()
    .eq("id", payload.taskID)
    .eq("campaign", campaignID);

  if (error) {
    return Response.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
  });
}

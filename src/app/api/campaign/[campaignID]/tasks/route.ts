import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { getOptionalTeamsWebhookUrl } from "@/lib/env";
import { sendTeamsWebhookMessage } from "@/lib/teams-webhook";
import { normalizeRichTextValue } from "@/utils/rich-text";

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

  if (!hasStatusUpdate && !hasTextUpdate) {
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

  const updates: {
    status?: TaskStatus;
    text?: string | null;
    updated_at: string;
  } = {
    updated_at: new Date().toISOString(),
  };

  if (hasStatusUpdate && status) {
    updates.status = status;
  }

  if (hasTextUpdate) {
    updates.text = normalizeRichTextValue(payload.text);
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

  return Response.json({
    ok: true,
    task: data,
  });
}

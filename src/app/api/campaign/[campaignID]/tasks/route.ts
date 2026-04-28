import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { getOptionalTeamsWebhookUrl } from "@/lib/env";
import { sendTeamsWebhookMessage } from "@/lib/teams-webhook";

export const runtime = "nodejs";

const taskSelectFields =
  "id, campaign, content, text, assignedTo, step, deadline, status, created_at, updated_at";

type RouteContext = {
  params: Promise<{
    campaignID: string;
  }>;
};

type TaskStatus = "todo" | "done";

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

export async function PATCH(request: Request, context: RouteContext) {
  const { campaignID } = await context.params;
  const payload = (await request.json()) as {
    taskID?: number;
    status?: string;
    sender?: string;
    webhookUrl?: string;
  };

  if (
    !payload.taskID ||
    (payload.status !== "todo" && payload.status !== "done")
  ) {
    return Response.json(
      {
        ok: false,
        error: "Invalid taskID or status",
      },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const status = payload.status as TaskStatus;

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

  const { data, error } = await supabase
    .from("task")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
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
  const shouldNotify = previousTask.status !== "done" && status === "done";

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

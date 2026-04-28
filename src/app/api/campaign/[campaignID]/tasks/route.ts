import { getSupabaseAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const taskSelectFields =
  "id, campaign, content, assignedTo, step, deadline, status, created_at";

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

  const { data, error } = await supabase
    .from("task")
    .update({ status })
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

  return Response.json({
    ok: true,
    task: data,
  });
}

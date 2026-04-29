import { getSupabaseAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    campaignID: string;
  }>;
};

export type ActionLogRecord = {
  id: number;
  campaign_id: string;
  user_name: string;
  action: string;
  task_id: number | null;
  details: string | null;
  status: string | null;
  created_at: string | null;
};

export async function GET(_request: Request, context: RouteContext) {
  const { campaignID } = await context.params;
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("user_action_log")
    .select("*")
    .eq("campaign_id", campaignID)
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
    logs: data ?? [],
  });
}

import { getSupabaseAdminClient } from "@/lib/supabase-server";

export type ActionLogStatus = "info" | "error" | "success" | null;

export type LogActionInput = {
  campaignID: string;
  userName: string;
  action: string;
  taskID?: number | null;
  details?: string | null;
  status?: ActionLogStatus;
};

/**
 * 计算任务完成状态的逻辑
 * - 超过截止日期 → error
 * - 当天完成（截止日期当天） → info
 * - 提前完成 → success
 */
export function computeDoneStatus(deadline: string | null): ActionLogStatus {
  if (!deadline) {
    return null;
  }

  const matchedDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadline);
  let deadlineDate: Date;

  if (matchedDate) {
    const [, year, month, day] = matchedDate;
    deadlineDate = new Date(Number(year), Number(month) - 1, Number(day));
  } else {
    const parsed = new Date(deadline);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    deadlineDate = new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
    );
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (deadlineDate.getTime() < today.getTime()) {
    return "error";
  }

  if (deadlineDate.getTime() === today.getTime()) {
    return "info";
  }

  return "success";
}

/**
 * 记录用户操作日志
 */
export async function logUserAction(input: LogActionInput): Promise<void> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase.from("user_action_log").insert({
    campaign_id: input.campaignID,
    user_name: input.userName,
    action: input.action,
    task_id: input.taskID ?? null,
    details: input.details ?? null,
    status: input.status ?? null,
  });

  if (error) {
    console.error("[ActionLog] Failed to log user action:", error.message);
  }
}

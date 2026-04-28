import { NextRequest } from "next/server";
import { sendProactiveMessage, getConversationReferences } from "@/lib/bot";
import { sendTeamsWebhookMessage } from "@/lib/teams-webhook";
import { getOptionalTeamsWebhookUrl } from "@/lib/env";

/**
 * POST /api/notify - 向群组发送消息
 * 支持两种模式：
 * 1. Bot 主动消息（默认）：通过 Bot Framework 发送到所有已知会话
 * 2. Webhook：通过 Incoming Webhook 发送到指定频道
 *
 * Body: { message: string, webhookUrl?: string, sender?: string }
 */
export async function POST(req: NextRequest) {
  const { message, webhookUrl, sender } = await req.json();

  if (!message || typeof message !== "string") {
    return Response.json({ error: "message 参数必填" }, { status: 400 });
  }

  const resolvedWebhookUrl =
    typeof webhookUrl === "string" && webhookUrl.trim()
      ? webhookUrl.trim()
      : getOptionalTeamsWebhookUrl();

  // 如果提供了 webhookUrl，使用 Webhook 方式发送
  if (resolvedWebhookUrl) {
    return sendViaWebhook(message, resolvedWebhookUrl, sender);
  }

  // 否则使用 Bot 主动消息
  return sendViaBot(message);
}

/** Bot Framework 主动消息 */
async function sendViaBot(message: string) {
  const result = await sendProactiveMessage(message);
  if (result.total === 0) {
    return Response.json(
      {
        error: "没有已保存的会话引用。请先在群组中 @Bot 发送一条消息。",
        note: result.note,
      },
      { status: 400 },
    );
  }
  return Response.json({
    message: `消息已通过 Bot 发送到 ${result.sent}/${result.total} 个会话`,
    ...result,
  });
}

/** Incoming Webhook 发送 */
async function sendViaWebhook(
  message: string,
  webhookUrl: string,
  sender?: string,
) {
  try {
    await sendTeamsWebhookMessage({ message, webhookUrl, sender });

    return Response.json({ message: "消息已通过 Webhook 发送到群组" });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Webhook 发送失败:", errorMessage, err);
    return Response.json(
      { error: `发送失败: ${errorMessage}` },
      {
        status:
          errorMessage.includes("webhookUrl") ||
          errorMessage.includes("Power Automate")
            ? 400
            : 500,
      },
    );
  }
}

/**
 * GET /api/notify - 查询当前 Bot 会话数量
 */
export async function GET() {
  const refs = getConversationReferences();
  return Response.json({
    conversations: refs.size,
    ids: Array.from(refs.keys()),
    botConfigured: !!process.env.BOT_ID,
  });
}

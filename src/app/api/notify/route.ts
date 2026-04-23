import { NextRequest } from "next/server";
import { sendProactiveMessage, getConversationReferences } from "@/lib/bot";

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

  // 如果提供了 webhookUrl，使用 Webhook 方式发送
  if (webhookUrl) {
    return sendViaWebhook(message, webhookUrl, sender);
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
  // 校验 webhook URL 必须是 Microsoft Teams / Power Automate 的合法域名
  try {
    const url = new URL(webhookUrl);
    const validDomains = [
      ".webhook.office.com",
      ".office.com",
      ".powerplatform.com",
      ".logic.azure.com",
    ];
    if (!validDomains.some((d) => url.hostname.endsWith(d))) {
      return Response.json(
        { error: "webhookUrl 必须是 Teams Webhook 或 Power Automate 地址" },
        { status: 400 },
      );
    }
  } catch {
    return Response.json({ error: "webhookUrl 格式无效" }, { status: 400 });
  }

  try {
    const url = new URL(webhookUrl);
    const isPowerAutomate =
      url.hostname.endsWith(".powerplatform.com") ||
      url.hostname.endsWith(".logic.azure.com");

    const adaptiveCard = {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.4",
      body: [
        {
          type: "TextBlock",
          text: "📨 来自 Tab 应用的消息",
          weight: "Bolder",
          size: "Medium",
        },
        { type: "TextBlock", text: message, wrap: true },
        {
          type: "TextBlock",
          text: `发送者: ${sender ?? "Unknown"} | ${new Date().toLocaleString("zh-CN")}`,
          size: "Small",
          isSubtle: true,
        },
      ],
    };

    // Power Automate Workflows 使用不同的 payload 格式
    const payload = isPowerAutomate
      ? {
          type: "message",
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              contentUrl: null,
              content: adaptiveCard,
            },
          ],
        }
      : {
          type: "message",
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              content: adaptiveCard,
            },
          ],
        };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json(
        { error: `Webhook 返回错误: ${res.status} - ${text}` },
        { status: 502 },
      );
    }

    return Response.json({ message: "消息已通过 Webhook 发送到群组" });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Webhook 发送失败:", errorMessage, err);
    return Response.json(
      { error: `发送失败: ${errorMessage}` },
      { status: 500 },
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

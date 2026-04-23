import { NextRequest } from "next/server";
import { getAdapter, saveConversationReference } from "@/lib/bot";
import { ActivityHandler, TurnContext } from "botbuilder";

// Bot 消息处理器
class TeamsDemoBot extends ActivityHandler {
  constructor() {
    super();

    // 收到消息时
    this.onMessage(async (context: TurnContext, next) => {
      saveConversationReference(context.activity);
      const text = context.activity.text?.trim() ?? "";

      if (text.toLowerCase() === "help" || text === "帮助") {
        await context.sendActivity(
          "🤖 **可用命令:**\n" +
            "- `帮助` / `help` - 显示帮助\n" +
            "- `状态` / `status` - 查看应用状态\n" +
            "- 其他消息 - 我会回复你",
        );
      } else if (text.toLowerCase() === "status" || text === "状态") {
        await context.sendActivity(
          "✅ **应用运行正常**\n" +
            `- 当前用户: ${context.activity.from?.name ?? "未知"}\n` +
            `- 频道: ${context.activity.channelId}`,
        );
      } else {
        await context.sendActivity(
          `📨 收到: "${text}"\n\n输入「帮助」查看可用命令。`,
        );
      }
      await next();
    });

    // Bot 被添加到群组时
    this.onMembersAdded(async (context, next) => {
      saveConversationReference(context.activity);
      for (const member of context.activity.membersAdded ?? []) {
        if (member.id !== context.activity.recipient?.id) {
          await context.sendActivity(
            `👋 你好 ${member.name ?? ""}！我是团队协作 Demo Bot。输入「帮助」查看功能。`,
          );
        }
      }
      await next();
    });
  }
}

const bot = new TeamsDemoBot();

/**
 * POST /api/messages - Bot Framework 消息入口
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const adapter = getAdapter();

  // 创建 Bot Framework 兼容的 request/response
  const fakeReq = {
    body,
    headers: Object.fromEntries(req.headers.entries()),
    method: "POST",
  };

  let statusCode = 200;
  let responseBody = {};

  const fakeRes = {
    status: (code: number) => {
      statusCode = code;
    },
    send: (data: unknown) => {
      responseBody = data ?? {};
    },
    end: () => {},
  };

  await adapter.process(fakeReq as never, fakeRes as never, (context) =>
    bot.run(context),
  );

  return Response.json(responseBody, { status: statusCode });
}

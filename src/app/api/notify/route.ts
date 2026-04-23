import { NextRequest } from "next/server";
import { sendProactiveMessage } from "@/lib/bot";

/**
 * POST /api/notify - 向群组发送主动消息
 * Body: { message: string }
 */
export async function POST(req: NextRequest) {
  const { message } = await req.json();

  if (!message || typeof message !== "string") {
    return Response.json({ error: "message 参数必填" }, { status: 400 });
  }

  const result = await sendProactiveMessage(message);

  return Response.json({
    message: `消息已发送到 ${result.sent}/${result.total} 个会话`,
    ...result,
  });
}

/**
 * GET /api/notify - 查询当前会话数量
 */
export async function GET() {
  const { getConversationReferences } = await import("@/lib/bot");
  const refs = getConversationReferences();
  return Response.json({
    conversations: refs.size,
    ids: Array.from(refs.keys()),
  });
}

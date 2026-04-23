import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  ConfigurationBotFrameworkAuthenticationOptions,
  TurnContext,
  ActivityTypes,
  ConversationReference,
} from "botbuilder";

// Bot 认证配置（BOT_ID 和 SECRET_BOT_PASSWORD 由 Teams Toolkit provision 自动生成）
const botAuthConfig: ConfigurationBotFrameworkAuthenticationOptions = {
  MicrosoftAppId: process.env.BOT_ID ?? "",
  MicrosoftAppPassword:
    process.env.BOT_PASSWORD ?? process.env.SECRET_BOT_PASSWORD ?? "",
  MicrosoftAppType: "MultiTenant",
};

const botAuth = new ConfigurationBotFrameworkAuthentication(botAuthConfig);
const adapter = new CloudAdapter(botAuth);

// 存储会话引用（生产环境应使用持久化存储）
const conversationReferences = new Map<
  string,
  Partial<ConversationReference>
>();

export function getAdapter() {
  return adapter;
}

export function getConversationReferences() {
  return conversationReferences;
}

/**
 * 保存会话引用，用于后续主动发送消息
 */
export function saveConversationReference(activity: TurnContext["activity"]) {
  const ref = TurnContext.getConversationReference(activity);
  conversationReferences.set(ref.conversation!.id, ref);
}

/**
 * 向所有已知会话发送主动消息
 */
export async function sendProactiveMessage(message: string) {
  const refs = Array.from(conversationReferences.values());
  if (refs.length === 0) {
    return {
      sent: 0,
      total: 0,
      note: "没有已保存的会话引用，请先在群组中与Bot交互一次",
    };
  }

  let sent = 0;
  for (const ref of refs) {
    try {
      await adapter.continueConversationAsync(
        botAuthConfig.MicrosoftAppId!,
        ref,
        async (turnContext: TurnContext) => {
          await turnContext.sendActivity({
            type: ActivityTypes.Message,
            text: message,
          });
        },
      );
      sent++;
    } catch (err) {
      console.error("发送消息失败:", err);
    }
  }
  return { sent, total: refs.length };
}

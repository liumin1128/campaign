type TeamsWebhookPayload = {
  message: string;
  webhookUrl: string;
  sender?: string;
};

const validDomains = [
  ".webhook.office.com",
  ".office.com",
  ".powerplatform.com",
  ".logic.azure.com",
];

function isValidTeamsWebhookUrl(webhookUrl: string) {
  try {
    const url = new URL(webhookUrl);
    return validDomains.some((domain) => url.hostname.endsWith(domain));
  } catch {
    return false;
  }
}

export function validateTeamsWebhookUrl(webhookUrl: string) {
  if (!isValidTeamsWebhookUrl(webhookUrl)) {
    throw new Error("webhookUrl 必须是 Teams Webhook 或 Power Automate 地址");
  }
}

export async function sendTeamsWebhookMessage({
  message,
  webhookUrl,
  sender,
}: TeamsWebhookPayload) {
  validateTeamsWebhookUrl(webhookUrl);

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

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Webhook 返回错误: ${response.status} - ${text}`);
  }
}

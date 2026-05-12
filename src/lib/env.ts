function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabasePublishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    (() => {
      throw new Error(
        "Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_PUBLISHABLE_KEY",
      );
    })()
  );
}

export function getSupabaseServiceRoleKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    (() => {
      throw new Error(
        "Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY",
      );
    })()
  );
}

export function getPostgresConnectionString(): string {
  return (
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    (() => {
      throw new Error(
        "Missing required environment variable: POSTGRES_URL_NON_POOLING or POSTGRES_URL",
      );
    })()
  );
}

export function getDeepSeekApiKey(): string {
  return requireEnv("DEEPSEEK_API_KEY");
}

/** AgentSL Runner API 令牌 */
export function getAgentSLApiToken(): string {
  return requireEnv("AGENTSL_API_TOKEN");
}

/** AgentSL Runner 用户 ID */
export function getAgentSLUserId(): string {
  return requireEnv("AGENTSL_USERID");
}

/** AgentSL Runner Agent ID */
export function getAgentSLId(): string {
  return requireEnv("AGENTSL_ID");
}

/** AgentSL Runner API 基础 URL（可选配置，默认值在 agentsl.ts 中） */
export function getAgentSLBaseUrl(): string {
  return (
    process.env.AGENTSL_BASE_URL ??
    "https://api.nonprod.kariba-agentsl-runner.de.sin.auto2.nonprod.c0.sq.com.sg"
  );
}

export function getTavilyApiKey(): string {
  return requireEnv("TAVILY_API_KEY");
}

export function getOptionalTeamsWebhookUrl(): string | null {
  return (
    process.env.TEAMS_WEBHOOK_URL ??
    process.env.NEXT_PUBLIC_TEAMS_WEBHOOK_URL ??
    null
  );
}

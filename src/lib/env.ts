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

export function getR2AccessKeyID(): string {
  return requireEnv("R2_ACCESS_KEY_ID");
}

export function getR2SecretAccessKey(): string {
  return requireEnv("R2_SECRET_ACCESS_KEY");
}

export function getR2Bucket(): string {
  return requireEnv("R2_BUCKET");
}

export function getR2Endpoint(): string {
  return requireEnv("R2_ENDPOINT");
}

export function getR2Region(): string {
  return process.env.R2_REGION || "auto";
}

export function getR2Prefix(): string {
  return (process.env.R2_PREFIX ?? "").replace(/^\/+|\/+$/g, "");
}

export function getR2PublicBaseUrl(): string {
  return requireEnv("R2_PUBLIC_BASE_URL").replace(/\/+$/g, "");
}

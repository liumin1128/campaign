import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env";

let browserClient: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(
      getSupabaseUrl(),
      getSupabasePublishableKey(),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    );
  }

  return browserClient;
}

export async function checkSupabaseBrowserConnection(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const supabase = getSupabaseBrowserClient();
  const response = await fetch(`${supabase.supabaseUrl}/auth/v1/settings`, {
    method: "GET",
    headers: {
      apikey: supabase.supabaseKey,
      Authorization: `Bearer ${supabase.supabaseKey}`,
    },
  });

  if (!response.ok) {
    return {
      ok: false,
      error: `Supabase browser health check failed: ${response.status}`,
    };
  }

  return { ok: true };
}
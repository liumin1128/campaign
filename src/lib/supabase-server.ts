import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getSupabasePublishableKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/env";

let serverClient: SupabaseClient | undefined;
let adminClient: SupabaseClient | undefined;

export function getSupabaseServerClient(): SupabaseClient {
  if (!serverClient) {
    serverClient = createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return serverClient;
}

export function getSupabaseAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return adminClient;
}

export async function checkSupabaseServerConnection() {
  const supabaseUrl = getSupabaseUrl();
  const publishableKey = getSupabasePublishableKey();

  const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    method: "GET",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase health check failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as {
    external?: Record<string, boolean>;
    disable_signup?: boolean;
  };

  return {
    ok: true,
    title: "Supabase Auth API",
    version: "v1",
    providers: Object.keys(payload.external ?? {}).length,
    disableSignup: payload.disable_signup ?? false,
  };
}

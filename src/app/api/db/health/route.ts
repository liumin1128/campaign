import { checkSupabaseServerConnection } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await checkSupabaseServerConnection();

    return Response.json({
      ok: true,
      database: "supabase",
      service: result.title,
      version: result.version,
      providers: result.providers,
      disableSignup: result.disableSignup,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
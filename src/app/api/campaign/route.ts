import { getSupabaseAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const campaignSelectFields =
  'id, "campaignID", title, content, created_at, updated_at';

export async function GET() {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("campaign")
    .select(campaignSelectFields)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, campaigns: data ?? [] });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    campaignID?: string;
    title?: string;
    content?: string;
  };

  const campaignID = payload.campaignID?.trim();
  const title = payload.title?.trim();

  if (!campaignID) {
    return Response.json(
      { ok: false, error: "campaignID is required" },
      { status: 400 },
    );
  }

  if (!title) {
    return Response.json(
      { ok: false, error: "Title is required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();

  // Check if campaignID already exists
  const { data: existing } = await supabase
    .from("campaign")
    .select("id")
    .eq("campaignID", campaignID)
    .maybeSingle();

  if (existing) {
    return Response.json(
      { ok: false, error: `Campaign "${campaignID}" already exists` },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("campaign")
    .insert({
      campaignID,
      title,
      content: payload.content?.trim() ?? null,
    })
    .select(campaignSelectFields)
    .single();

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, campaign: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as {
    id?: number;
    title?: string;
    content?: string;
    campaignID?: string;
  };

  const id = payload.id;

  if (!id) {
    return Response.json(
      { ok: false, error: "id is required" },
      { status: 400 },
    );
  }

  const updates: Record<string, string> = {};

  if (payload.title !== undefined) {
    const trimmed = payload.title.trim();
    if (!trimmed) {
      return Response.json(
        { ok: false, error: "Title cannot be empty" },
        { status: 400 },
      );
    }
    updates.title = trimmed;
  }

  if (payload.content !== undefined) {
    updates.content = payload.content.trim() ?? null;
  }

  if (payload.campaignID !== undefined) {
    const trimmed = payload.campaignID.trim();
    if (!trimmed) {
      return Response.json(
        { ok: false, error: "campaignID cannot be empty" },
        { status: 400 },
      );
    }

    // Check uniqueness
    const supabase = getSupabaseAdminClient();
    const { data: existing } = await supabase
      .from("campaign")
      .select("id")
      .eq("campaignID", trimmed)
      .neq("id", id)
      .maybeSingle();

    if (existing) {
      return Response.json(
        { ok: false, error: `Campaign "${trimmed}" already exists` },
        { status: 409 },
      );
    }

    updates.campaignID = trimmed;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json(
      { ok: false, error: "No fields to update" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("campaign")
    .update(updates)
    .eq("id", id)
    .select(campaignSelectFields)
    .single();

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, campaign: data });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return Response.json(
      { ok: false, error: "id query parameter is required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from("campaign")
    .delete()
    .eq("id", Number(id));

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

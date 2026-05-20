import {
  buildCampaignTaskImageKey,
  getR2PublicUrl,
  R2_ALLOWED_IMAGE_TYPES,
  R2_IMAGE_MAX_BYTES,
  uploadImageToR2,
} from "@/lib/r2";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

function getStringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { ok: false, error: "multipart/form-data is required" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  const campaignID = getStringValue(formData.get("campaignID"));
  const taskID = getStringValue(formData.get("taskID"));
  const numericTaskID = taskID ? Number(taskID) : null;

  if (!campaignID) {
    return Response.json(
      { ok: false, error: "campaignID is required" },
      { status: 400 },
    );
  }

  if (!(file instanceof File)) {
    return Response.json(
      { ok: false, error: "Image file is required" },
      { status: 400 },
    );
  }

  if (
    taskID &&
    (!Number.isSafeInteger(numericTaskID) || Number(numericTaskID) <= 0)
  ) {
    return Response.json(
      { ok: false, error: "Invalid taskID" },
      { status: 400 },
    );
  }

  if (!R2_ALLOWED_IMAGE_TYPES.has(file.type)) {
    return Response.json(
      { ok: false, error: "Only JPG, PNG, WebP, or GIF images are supported" },
      { status: 400 },
    );
  }

  if (file.size <= 0 || file.size > R2_IMAGE_MAX_BYTES) {
    return Response.json(
      { ok: false, error: "Image must be smaller than 8 MB" },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseAdminClient();

    if (taskID) {
      const { data: task, error } = await supabase
        .from("task")
        .select("id")
        .eq("id", numericTaskID)
        .eq("campaign", campaignID)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!task) {
        return Response.json(
          { ok: false, error: "Task was not found in this campaign" },
          { status: 404 },
        );
      }
    } else {
      const { data: campaign, error } = await supabase
        .from("campaign")
        .select("id")
        .eq("campaignID", campaignID)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!campaign) {
        return Response.json(
          { ok: false, error: "Campaign was not found" },
          { status: 404 },
        );
      }
    }

    const key = buildCampaignTaskImageKey({
      campaignID,
      taskID: taskID || null,
      contentType: file.type,
    });

    await uploadImageToR2({ key, file });

    return Response.json(
      {
        ok: true,
        image: {
          key,
          url: getR2PublicUrl(key),
          contentType: file.type,
          size: file.size,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("R2 image upload failed:", error);

    return Response.json(
      { ok: false, error: "Failed to upload image" },
      { status: 500 },
    );
  }
}

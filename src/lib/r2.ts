import "server-only";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  getR2AccessKeyID,
  getR2Bucket,
  getR2Endpoint,
  getR2Prefix,
  getR2PublicBaseUrl,
  getR2Region,
  getR2SecretAccessKey,
} from "@/lib/env";

let r2Client: S3Client | undefined;

export const R2_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export const R2_ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const extensionByContentType: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function getR2Client() {
  if (!r2Client) {
    r2Client = new S3Client({
      region: getR2Region(),
      endpoint: getR2Endpoint(),
      credentials: {
        accessKeyId: getR2AccessKeyID(),
        secretAccessKey: getR2SecretAccessKey(),
      },
    });
  }

  return r2Client;
}

function sanitizePathSegment(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function buildCampaignTaskImageKey({
  campaignID,
  taskID,
  contentType,
}: {
  campaignID: string;
  taskID?: string | null;
  contentType: string;
}) {
  const prefix = getR2Prefix();
  const campaignSegment = sanitizePathSegment(campaignID) || "campaign";
  const taskSegment = taskID ? sanitizePathSegment(taskID) : "draft";
  const extension = extensionByContentType[contentType] ?? "bin";
  const fileName = `${crypto.randomUUID()}.${extension}`;
  const parts = [
    prefix,
    "campaigns",
    campaignSegment,
    "tasks",
    taskSegment,
    "notes",
    fileName,
  ].filter(Boolean);

  return parts.join("/");
}

export function getR2PublicUrl(key: string) {
  return `${getR2PublicBaseUrl()}/${key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

export async function uploadImageToR2({
  key,
  file,
}: {
  key: string;
  file: File;
}) {
  const body = Buffer.from(await file.arrayBuffer());

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: body,
      ContentLength: body.byteLength,
      ContentType: file.type,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

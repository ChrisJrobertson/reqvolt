/**
 * Cloudflare R2 storage via S3-compatible API.
 * Presigned URLs for direct client upload - app server never receives file body.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

function getS3Client() {
  return new S3Client({
    region: process.env.R2_REGION ?? "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
    forcePathStyle: true,
  });
}

export interface PresignedUploadResult {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
}

export async function createPresignedUpload(params: {
  workspaceId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}): Promise<PresignedUploadResult> {
  if (params.sizeBytes > MAX_SIZE_BYTES) {
    throw new Error("File size exceeds 50MB limit");
  }
  if (!ALLOWED_CONTENT_TYPES.includes(params.contentType as (typeof ALLOWED_CONTENT_TYPES)[number])) {
    throw new Error(
      "Unsupported content type. Allowed: PDF, DOCX"
    );
  }

  const objectKey = `uploads/${params.workspaceId}/${randomUUID()}/${params.fileName}`;
  const client = getS3Client();
  const bucket = process.env.R2_BUCKET_NAME ?? "reqvolt-files";

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: params.contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });

  return {
    uploadUrl,
    objectKey,
    expiresIn: 300,
  };
}

export async function headObject(objectKey: string): Promise<{
  contentLength: number;
  contentType: string;
}> {
  const client = getS3Client();
  const bucket = process.env.R2_BUCKET_NAME ?? "reqvolt-files";
  const result = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: objectKey })
  );
  return {
    contentLength: result.ContentLength ?? 0,
    contentType: result.ContentType ?? "application/octet-stream",
  };
}

export async function getObjectStream(objectKey: string) {
  const client = getS3Client();
  const bucket = process.env.R2_BUCKET_NAME ?? "reqvolt-files";
  const result = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: objectKey })
  );
  return result.Body;
}

export async function deleteObject(objectKey: string): Promise<void> {
  const client = getS3Client();
  const bucket = process.env.R2_BUCKET_NAME ?? "reqvolt-files";
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}
